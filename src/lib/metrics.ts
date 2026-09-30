/**
 * Core coverage and ranking calculation logic.
 *
 * NOTE: As per CLAUDE.md / PLAN.md, all coverage math MUST live in this file.
 * Pages, components, and scripts must never compute percentages or ranks themselves.
 */

export interface Municipality {
  code5: string;
  code6: string;
  prefCode: string;
  prefName: string;
  name: string;
  kind: 'prefecture' | 'designated_city' | 'city' | 'special_ward' | 'town' | 'village';
  parentCode5?: string;
  population: number;
  populationRefDate: string;
}

export type SiteStatus = 'active' | 'stale' | 'dead' | 'building';

export interface SiteEntry {
  id: string;
  assemblyCode5: string;
  assemblyLevel: 'municipal' | 'prefectural';
  name: string;
  url: string;
  urlAlt?: string;
  repo?: string | null;
  operator?: string;
  operatorX?: string;
  basedOn: 'fork' | 'independent';
  launchedOn?: string;
  addedOn: string;
  status: SiteStatus;
  countsForCoverage: boolean;
  notes?: string;
}

export const TOTAL_MUNICIPALITIES_NATIONAL = 1741;
export const TOTAL_PREFECTURES_NATIONAL = 47;

/**
 * An assembly is considered covered when at least one coverage-eligible registry entry
 * points to it with status 'active' or 'stale' (not 'dead', not 'building').
 */
export function isCoveredStatus(status: SiteStatus): boolean {
  return status === 'active' || status === 'stale';
}

export interface NationalMetrics {
  coveredMunicipalitiesCount: number;
  totalMunicipalitiesCount: number;
  municipalCoverageRate: number; // 0.0 - 1.0
  coveredPopulation: number;
  totalPopulation: number;
  populationCoverageRate: number; // 0.0 - 1.0
  coveredPrefecturalAssembliesCount: number;
  totalPrefecturalAssembliesCount: number;
}

export interface PrefectureMetrics {
  prefCode: string;
  prefName: string;
  coveredMunicipalitiesCount: number;
  totalMunicipalitiesCount: number;
  municipalCoverageRate: number; // 0.0 - 1.0
  coveredPopulation: number;
  totalPopulation: number;
  populationCoverageRate: number; // 0.0 - 1.0
  hasPrefecturalAssembly: boolean;
  rank: number;
}

/**
 * Computes coverage rate safely, returning 0 if denominator is 0.
 */
export function computeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

/**
 * Filter unique covered assembly codes from site entries.
 */
export function getCoveredAssemblyCodes(sites: SiteEntry[]): Set<string> {
  const covered = new Set<string>();
  for (const site of sites) {
    if (site.countsForCoverage && isCoveredStatus(site.status)) {
      covered.add(site.assemblyCode5);
    }
  }
  return covered;
}

/**
 * Codes of municipal assemblies covered by at least one active/stale
 * municipal-level site. Prefectural sites never count here.
 */
function getCoveredMunicipalCodes(sites: SiteEntry[]): Set<string> {
  return getCoveredAssemblyCodes(sites.filter((s) => s.assemblyLevel === 'municipal'));
}

/**
 * Prefecture codes (2 digits) whose prefectural assembly has an active/stale site.
 * Prefectural assembly codes look like "40000"; the prefecture is the first 2 digits.
 */
function getCoveredPrefectureCodes(sites: SiteEntry[]): Set<string> {
  const covered = new Set<string>();
  for (const site of sites) {
    if (
      site.assemblyLevel === 'prefectural' &&
      site.countsForCoverage &&
      isCoveredStatus(site.status)
    ) {
      covered.add(site.assemblyCode5.slice(0, 2));
    }
  }
  return covered;
}

/** Municipal assemblies only: prefecture rows are excluded from all municipal math. */
function onlyMunicipal(municipalities: Municipality[]): Municipality[] {
  return municipalities.filter((m) => m.kind !== 'prefecture');
}

function sumPopulation(list: Municipality[]): number {
  return list.reduce((acc, m) => acc + m.population, 0);
}

export function calculateNationalMetrics(
  sites: SiteEntry[],
  municipalities: Municipality[],
): NationalMetrics {
  const munis = onlyMunicipal(municipalities);
  const coveredCodes = getCoveredMunicipalCodes(sites);
  const covered = munis.filter((m) => coveredCodes.has(m.code5));
  const totalPopulation = sumPopulation(munis);
  const coveredPopulation = sumPopulation(covered);
  const prefectures = municipalities.filter((m) => m.kind === 'prefecture');
  const coveredPrefCodes = getCoveredPrefectureCodes(sites);

  return {
    coveredMunicipalitiesCount: covered.length,
    totalMunicipalitiesCount: munis.length,
    municipalCoverageRate: computeRate(covered.length, munis.length),
    coveredPopulation,
    totalPopulation,
    populationCoverageRate: computeRate(coveredPopulation, totalPopulation),
    coveredPrefecturalAssembliesCount: prefectures.filter((p) => coveredPrefCodes.has(p.prefCode))
      .length,
    totalPrefecturalAssembliesCount: prefectures.length,
  };
}

/**
 * Per-prefecture metrics, ranked by population coverage desc, then municipal
 * coverage desc, then prefecture code asc. Rank is 1-indexed.
 */
export function calculatePrefectureMetrics(
  sites: SiteEntry[],
  municipalities: Municipality[],
): PrefectureMetrics[] {
  const coveredCodes = getCoveredMunicipalCodes(sites);
  const coveredPrefCodes = getCoveredPrefectureCodes(sites);

  const byPref = new Map<string, { prefName: string; munis: Municipality[] }>();
  for (const m of municipalities) {
    const entry = byPref.get(m.prefCode) ?? { prefName: m.prefName, munis: [] };
    if (m.kind !== 'prefecture') entry.munis.push(m);
    byPref.set(m.prefCode, entry);
  }

  const result: PrefectureMetrics[] = [];
  for (const [prefCode, { prefName, munis }] of byPref) {
    const covered = munis.filter((m) => coveredCodes.has(m.code5));
    const totalPopulation = sumPopulation(munis);
    const coveredPopulation = sumPopulation(covered);
    result.push({
      prefCode,
      prefName,
      coveredMunicipalitiesCount: covered.length,
      totalMunicipalitiesCount: munis.length,
      municipalCoverageRate: computeRate(covered.length, munis.length),
      coveredPopulation,
      totalPopulation,
      populationCoverageRate: computeRate(coveredPopulation, totalPopulation),
      hasPrefecturalAssembly: coveredPrefCodes.has(prefCode),
      rank: 0,
    });
  }

  result.sort(
    (a, b) =>
      b.populationCoverageRate - a.populationCoverageRate ||
      b.municipalCoverageRate - a.municipalCoverageRate ||
      a.prefCode.localeCompare(b.prefCode),
  );
  result.forEach((p, i) => {
    p.rank = i + 1;
  });
  return result;
}

/** 0.1234 -> "12.3%" */
export function formatPercent(rate: number, digits = 1): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

/** 1234567 -> "1,234,567" */
export function formatPopulation(population: number): string {
  return population.toLocaleString('en-US');
}
