/**
 * Generates data/municipalities.csv from official 総務省 files in data/raw/:
 *   code_list.xlsx  全国地方公共団体コード (sheet 1: all bodies, sheet 2: 政令指定都市 + wards)
 *   population.xlsx 住民基本台帳人口 (市区町村別, 総計 incl. foreign residents)
 * See data/raw/README.md for download URLs. Exits non-zero on any count mismatch.
 */
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { loadMunicipalities, loadSites } from '../src/lib/data';
import {
  type Municipality,
  calculateNationalMetrics,
  calculatePrefectureMetrics,
  formatPercent,
  formatPopulation,
} from '../src/lib/metrics';

const POPULATION_REF_DATE = '2026-01-01';

// Four 北方領土 villages share a plain name with a real village (泊村), so they
// are identified by the county-qualified name used in the population table.
const NORTHERN_TERRITORY_POP_NAMES = new Set([
  '色丹郡色丹村',
  '国後郡泊村',
  '国後郡留夜別村',
  '択捉郡留別村',
  '紗那郡紗那村',
  '蘂取郡蘂取村',
]);

const EXPECTED = { prefecture: 47, city: 792, town: 743, village: 183, special_ward: 23 };
const EXPECTED_DESIGNATED = 20;
const EXPECTED_MUNICIPAL_TOTAL = 1741;

type Row = (string | number | null)[];

async function readRows(file: string, sheetIndex = 0): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[sheetIndex];
  const rows: Row[] = [];
  ws.eachRow((row) => {
    rows.push((row.values as unknown[]).slice(1).map((v) => (v ?? null) as string | number | null));
  });
  return rows;
}

const str = (v: string | number | null | undefined): string => (v == null ? '' : String(v).trim());

function fail(msg: string): never {
  console.error(`❌ build-municipalities: ${msg}`);
  process.exit(1);
}

function kindOf(name: string, prefName: string, designated: Set<string>): Municipality['kind'] {
  if (designated.has(name)) return 'designated_city';
  if (name.endsWith('市')) return 'city';
  if (name.endsWith('区')) {
    if (prefName !== '東京都') fail(`unexpected ward-like body outside Tokyo: ${prefName} ${name}`);
    return 'special_ward';
  }
  if (name.endsWith('町')) return 'town';
  if (name.endsWith('村')) return 'village';
  return fail(`cannot classify: ${prefName} ${name}`);
}

async function main() {
  const root = process.cwd();
  const codeFile = path.join(root, 'data/raw/code_list.xlsx');
  const popFile = path.join(root, 'data/raw/population.xlsx');
  for (const f of [codeFile, popFile]) {
    if (!fs.existsSync(f)) fail(`missing ${f}; see data/raw/README.md for download URLs`);
  }

  const codeRows = (await readRows(codeFile, 0)).slice(1);
  const designatedRows = (await readRows(codeFile, 1)).slice(1);
  const popRows = await readRows(popFile, 0);

  const designated = new Set(
    designatedRows.map((r) => str(r[2])).filter((n) => n.endsWith('市') && !n.endsWith('区')),
  );
  if (designated.size !== EXPECTED_DESIGNATED) {
    fail(`expected ${EXPECTED_DESIGNATED} designated cities, got ${designated.size}`);
  }

  const popTitle = str(popRows[0]?.[0]);
  if (!popTitle.includes('令和8年1月1日')) {
    fail(`population.xlsx is not the ${POPULATION_REF_DATE} edition: "${popTitle}"`);
  }

  const pop = new Map<string, { name: string; total: number }>();
  for (const r of popRows) {
    const code6 = str(r[0]);
    if (/^\d{6}$/.test(code6) && typeof r[5] === 'number') {
      pop.set(code6, { name: str(r[2]), total: r[5] });
    }
  }

  const out: Municipality[] = [];
  for (const r of codeRows) {
    const code6 = str(r[0]);
    if (!/^\d{6}$/.test(code6)) continue;
    const prefName = str(r[1]);
    const name = str(r[2]);
    const p = pop.get(code6);
    if (!p) fail(`no population row for ${code6} ${prefName}${name}`);
    if (NORTHERN_TERRITORY_POP_NAMES.has(p.name)) continue;
    const code5 = code6.slice(0, 5);
    const prefCode = code6.slice(0, 2);
    out.push({
      code5,
      code6,
      prefCode,
      prefName,
      name: name || prefName,
      kind: name ? kindOf(name, prefName, designated) : 'prefecture',
      population: p.total,
      populationRefDate: POPULATION_REF_DATE,
    });
  }
  out.sort((a, b) => a.code6.localeCompare(b.code6));

  // Hard assertions on the published denominators.
  const counts: Record<string, number> = {};
  for (const m of out) counts[m.kind] = (counts[m.kind] ?? 0) + 1;
  const cities = (counts.city ?? 0) + (counts.designated_city ?? 0);
  const municipalTotal = out.length - (counts.prefecture ?? 0);
  const problems: string[] = [];
  if (counts.prefecture !== EXPECTED.prefecture) problems.push(`prefectures=${counts.prefecture}`);
  if (cities !== EXPECTED.city) problems.push(`cities=${cities}`);
  if (counts.town !== EXPECTED.town) problems.push(`towns=${counts.town}`);
  if (counts.village !== EXPECTED.village) problems.push(`villages=${counts.village}`);
  if (counts.special_ward !== EXPECTED.special_ward)
    problems.push(`special_ward=${counts.special_ward}`);
  if (counts.designated_city !== EXPECTED_DESIGNATED)
    problems.push(`designated_city=${counts.designated_city}`);
  if (municipalTotal !== EXPECTED_MUNICIPAL_TOTAL) problems.push(`total=${municipalTotal}`);
  if (new Set(out.map((m) => m.code5)).size !== out.length) problems.push('duplicate code5');
  if (problems.length > 0) fail(`count assertions failed: ${problems.join(', ')}`);

  const header =
    'code5,code6,pref_code,pref_name,name,kind,parent_code5,population,population_ref_date';
  const lines = out.map((m) =>
    [
      m.code5,
      m.code6,
      m.prefCode,
      m.prefName,
      m.name,
      m.kind,
      m.parentCode5 ?? '',
      m.population,
      m.populationRefDate,
    ].join(','),
  );
  fs.writeFileSync(path.join(root, 'data/municipalities.csv'), `${header}\n${lines.join('\n')}\n`);
  console.log(
    `✅ Wrote data/municipalities.csv: ${municipalTotal} municipal assemblies + ${counts.prefecture} prefectures`,
  );
  console.log(
    `   cities=${cities} (designated=${counts.designated_city}) towns=${counts.town} villages=${counts.village} special_wards=${counts.special_ward}`,
  );

  printSummary(root);
}

/** Verification tables. All numbers come from metrics.ts. */
function printSummary(root: string) {
  const munis = loadMunicipalities(path.join(root, 'data/municipalities.csv'));
  const sitesPath = path.join(root, 'data/sites.yaml');
  const sites = fs.existsSync(sitesPath) ? loadSites(sitesPath) : [];
  const national = calculateNationalMetrics(sites, munis);
  console.log('\nNational summary');
  console.log(
    `  municipal coverage: ${national.coveredMunicipalitiesCount} / ${national.totalMunicipalitiesCount} (${formatPercent(national.municipalCoverageRate)})`,
  );
  console.log(
    `  population coverage: ${formatPopulation(national.coveredPopulation)} / ${formatPopulation(national.totalPopulation)} (${formatPercent(national.populationCoverageRate)})`,
  );
  console.log(
    `  prefectural assemblies: ${national.coveredPrefecturalAssembliesCount} / ${national.totalPrefecturalAssembliesCount}`,
  );
  const prefs = calculatePrefectureMetrics(sites, munis);
  console.log('\nSample prefectures (Tokyo 13, Kanagawa 14, Fukuoka 40)');
  for (const p of prefs.filter((x) => ['13', '14', '40'].includes(x.prefCode))) {
    console.log(
      `  #${p.rank} ${p.prefCode} ${p.prefName}: municipalities ${p.coveredMunicipalitiesCount}/${p.totalMunicipalitiesCount} (${formatPercent(p.municipalCoverageRate)}), population ${formatPopulation(p.coveredPopulation)}/${formatPopulation(p.totalPopulation)} (${formatPercent(p.populationCoverageRate)}), prefectural assembly: ${p.hasPrefecturalAssembly ? 'yes' : 'no'}`,
    );
  }
}

main().catch((e) => fail(String(e)));
