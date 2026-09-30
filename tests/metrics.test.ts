import { describe, expect, it } from 'vitest';
import { loadMunicipalities, loadSites } from '../src/lib/data';
import {
  type Municipality,
  type SiteEntry,
  TOTAL_MUNICIPALITIES_NATIONAL,
  TOTAL_PREFECTURES_NATIONAL,
  calculateNationalMetrics,
  calculatePrefectureMetrics,
  computeRate,
  formatPercent,
  formatPopulation,
  getCoveredAssemblyCodes,
  isCoveredStatus,
} from '../src/lib/metrics';

const muni = (
  code5: string,
  prefCode: string,
  population: number,
  kind: Municipality['kind'] = 'city',
): Municipality => ({
  code5,
  code6: `${code5}0`,
  prefCode,
  prefName: `P${prefCode}`,
  name: `M${code5}`,
  kind,
  population,
  populationRefDate: '2026-01-01',
});

const site = (
  id: string,
  assemblyCode5: string,
  status: SiteEntry['status'] = 'active',
  assemblyLevel: SiteEntry['assemblyLevel'] = 'municipal',
): SiteEntry => ({
  id,
  assemblyCode5,
  assemblyLevel,
  name: id,
  url: `https://${id}.example.com`,
  repo: `https://github.com/example/${id}`,
  operator: 'op',
  basedOn: 'fork',
  launchedOn: '2026-06-01',
  addedOn: '2026-09-30',
  status,
});

// Prefecture 01: 3 municipalities (100/200/700). Prefecture 02: 2 (500/500). Prefecture 03: 1 (300).
const MUNIS: Municipality[] = [
  muni('01000', '01', 1000, 'prefecture'),
  muni('01001', '01', 100),
  muni('01002', '01', 200),
  muni('01003', '01', 700, 'town'),
  muni('02000', '02', 1000, 'prefecture'),
  muni('02001', '02', 500),
  muni('02002', '02', 500, 'village'),
  muni('03000', '03', 300, 'prefecture'),
  muni('03001', '03', 300),
];

describe('status and helpers', () => {
  it('identifies covered statuses', () => {
    expect(isCoveredStatus('active')).toBe(true);
    expect(isCoveredStatus('stale')).toBe(true);
    expect(isCoveredStatus('dead')).toBe(false);
    expect(isCoveredStatus('building')).toBe(false);
  });

  it('computes rates safely', () => {
    expect(computeRate(10, 100)).toBe(0.1);
    expect(computeRate(0, 100)).toBe(0);
    expect(computeRate(10, 0)).toBe(0);
  });

  it('counts duplicate sites for one assembly once and ignores dead sites', () => {
    const covered = getCoveredAssemblyCodes([
      site('a', '13104'),
      site('b', '13104'),
      site('c', '14100', 'dead'),
    ]);
    expect(covered.size).toBe(1);
    expect(covered.has('13104')).toBe(true);
  });

  it('formats percent and population', () => {
    expect(formatPercent(0.12345)).toBe('12.3%');
    expect(formatPercent(0.5, 0)).toBe('50%');
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatPopulation(1234567)).toBe('1,234,567');
    expect(formatPopulation(0)).toBe('0');
  });

  it('defines national denominators', () => {
    expect(TOTAL_MUNICIPALITIES_NATIONAL).toBe(1741);
    expect(TOTAL_PREFECTURES_NATIONAL).toBe(47);
  });
});

describe('calculateNationalMetrics', () => {
  it('returns zeros with correct denominators when there are no sites', () => {
    const m = calculateNationalMetrics([], MUNIS);
    expect(m.coveredMunicipalitiesCount).toBe(0);
    expect(m.totalMunicipalitiesCount).toBe(6); // prefecture rows excluded
    expect(m.totalPopulation).toBe(2300); // prefecture populations excluded
    expect(m.municipalCoverageRate).toBe(0);
    expect(m.populationCoverageRate).toBe(0);
    expect(m.totalPrefecturalAssembliesCount).toBe(3);
    expect(m.coveredPrefecturalAssembliesCount).toBe(0);
  });

  it('aggregates count and population, counting multiple sites once', () => {
    const m = calculateNationalMetrics(
      [site('a', '01003'), site('b', '01003', 'stale'), site('c', '02001')],
      MUNIS,
    );
    expect(m.coveredMunicipalitiesCount).toBe(2);
    expect(m.coveredPopulation).toBe(1200);
    expect(m.municipalCoverageRate).toBeCloseTo(2 / 6);
    expect(m.populationCoverageRate).toBeCloseTo(1200 / 2300);
  });

  it('excludes dead and building sites', () => {
    const m = calculateNationalMetrics(
      [site('a', '01001', 'dead'), site('b', '01002', 'building'), site('c', '01003', 'stale')],
      MUNIS,
    );
    expect(m.coveredMunicipalitiesCount).toBe(1);
    expect(m.coveredPopulation).toBe(700);
  });

  it('counts a prefectural assembly separately from municipal totals', () => {
    const m = calculateNationalMetrics([site('p', '01000', 'active', 'prefectural')], MUNIS);
    expect(m.coveredMunicipalitiesCount).toBe(0);
    expect(m.coveredPopulation).toBe(0);
    expect(m.coveredPrefecturalAssembliesCount).toBe(1);
  });

  it('does not let prefecture rows leak into municipal math', () => {
    // A municipal-level site pointing at a prefecture code must not cover anything.
    const m = calculateNationalMetrics([site('x', '01000')], MUNIS);
    expect(m.coveredMunicipalitiesCount).toBe(0);
    expect(m.coveredPopulation).toBe(0);
    expect(m.totalMunicipalitiesCount).toBe(6);
  });

  it('ignores an inactive prefectural site', () => {
    const m = calculateNationalMetrics([site('p', '01000', 'dead', 'prefectural')], MUNIS);
    expect(m.coveredPrefecturalAssembliesCount).toBe(0);
  });
});

describe('calculatePrefectureMetrics', () => {
  it('ranks by population coverage, then municipal coverage, then prefecture code', () => {
    const munis = [
      ...MUNIS,
      muni('04000', '04', 100, 'prefecture'),
      muni('04001', '04', 100),
      muni('04002', '04', 100),
      muni('05000', '05', 100, 'prefecture'),
      muni('05001', '05', 100),
      muni('05002', '05', 100),
    ];
    const sites = [
      site('a', '01003'), // pref 01: 700/1000 = 0.7, 1/3
      site('b', '02001'), // pref 02: 500/1000 = 0.5, 1/2
      site('c', '03001'), // pref 03: 300/300 = 1.0
      site('d', '04001'), // pref 04: 100/200 = 0.5, 1/2 -> ties with 02 on both
    ];
    const result = calculatePrefectureMetrics(sites, munis);
    expect(result.map((p) => p.prefCode)).toEqual(['03', '01', '02', '04', '05']);
    expect(result.map((p) => p.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it('breaks population ties by municipal coverage', () => {
    const munis = [
      muni('06001', '06', 100),
      muni('06002', '06', 100),
      muni('06003', '06', 200),
      muni('07001', '07', 200),
      muni('07002', '07', 200),
    ];
    // 06: 200/400 pop = 0.5, 2/3 munis. 07: 200/400 pop = 0.5, 1/2 munis.
    const result = calculatePrefectureMetrics(
      [site('a', '06001'), site('b', '06002'), site('c', '07001')],
      munis,
    );
    expect(result.map((p) => p.prefCode)).toEqual(['06', '07']);
  });

  it('places a zero-coverage prefecture at the bottom with correct denominators', () => {
    const result = calculatePrefectureMetrics([site('a', '03001')], MUNIS);
    // 01 and 02 both have zero coverage; the code-asc tie-break puts 01 second and 02 last.
    expect(result.map((p) => p.prefCode)).toEqual(['03', '01', '02']);
    const zero = result[1];
    expect(zero.rank).toBe(2);
    expect(zero.coveredMunicipalitiesCount).toBe(0);
    expect(zero.totalMunicipalitiesCount).toBe(3);
    expect(zero.totalPopulation).toBe(1000);
    const last = result[2];
    expect(last.rank).toBe(3);
    expect(last.municipalCoverageRate).toBe(0);
    expect(last.populationCoverageRate).toBe(0);
  });

  it('flags prefectural assemblies without touching rates', () => {
    const result = calculatePrefectureMetrics([site('p', '02000', 'stale', 'prefectural')], MUNIS);
    const p02 = result.find((p) => p.prefCode === '02');
    expect(p02?.hasPrefecturalAssembly).toBe(true);
    expect(p02?.coveredMunicipalitiesCount).toBe(0);
    expect(p02?.populationCoverageRate).toBe(0);
    expect(result.find((p) => p.prefCode === '01')?.hasPrefecturalAssembly).toBe(false);
  });

  it('counts each municipality once per prefecture with duplicate sites', () => {
    const result = calculatePrefectureMetrics(
      [site('a', '01001'), site('b', '01001'), site('c', '01001', 'stale')],
      MUNIS,
    );
    expect(result.find((p) => p.prefCode === '01')?.coveredMunicipalitiesCount).toBe(1);
  });
});

describe('generated data files', () => {
  it('municipalities.csv has the published national denominators', () => {
    const munis = loadMunicipalities('data/municipalities.csv');
    const m = calculateNationalMetrics([], munis);
    expect(m.totalMunicipalitiesCount).toBe(TOTAL_MUNICIPALITIES_NATIONAL);
    expect(m.totalPrefecturalAssembliesCount).toBe(TOTAL_PREFECTURES_NATIONAL);
    expect(calculatePrefectureMetrics([], munis)).toHaveLength(47);
  });

  it('keeps codes as leading-zero strings', () => {
    const munis = loadMunicipalities('data/municipalities.csv');
    expect(munis.find((x) => x.name === '札幌市')?.code5).toBe('01100');
  });

  it('every seeded site resolves against the CSV', () => {
    const munis = loadMunicipalities('data/municipalities.csv');
    const codes = new Set(munis.map((x) => x.code5));
    const sites = loadSites('data/sites.yaml');
    expect(sites.length).toBeGreaterThan(0);
    for (const s of sites) expect(codes.has(s.assemblyCode5)).toBe(true);
  });
});
