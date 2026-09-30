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
  repo: string;
  operator: string;
  basedOn: 'fork' | 'independent';
  launchedOn: string;
  addedOn: string;
  status: SiteStatus;
  notes?: string;
}

export const TOTAL_MUNICIPALITIES_NATIONAL = 1741;
export const TOTAL_PREFECTURES_NATIONAL = 47;

/**
 * An assembly is considered covered when at least one registry entry
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
    if (isCoveredStatus(site.status)) {
      covered.add(site.assemblyCode5);
    }
  }
  return covered;
}
