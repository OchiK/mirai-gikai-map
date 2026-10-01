/**
 * Builds public/geo/municipalities/{01..47}.topojson from 国土数値情報 行政区域 (N03, 2021
 * edition), as converted to TopoJSON by smartnews-smri/japan-topography.
 *
 * Designated-city wards are dissolved into their parent city, so each feature is one
 * municipal assembly. Output properties are limited to code5 and name (from the 総務省
 * master list); everything else joins at runtime from the build's data.
 *
 * Usage: pnpm build:geo:municipalities
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mapshaper from 'mapshaper';
import { mergeArcs } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import { loadMunicipalities } from '../src/lib/data';
import type { Municipality } from '../src/lib/metrics';

// Pinned to a commit so the output is reproducible.
const SOURCE_COMMIT = 'b403e71eb97f1fdf32f63d16bd485129f703855e';
const sourceUrl = (prefCode: string) =>
  `https://raw.githubusercontent.com/smartnews-smri/japan-topography/${SOURCE_COMMIT}/data/municipality/topojson/s0010/N03-21_${prefCode}_210101.json`;
const RAW_DIR = 'data/raw/municipalities';
const OUT_DIR = 'public/geo/municipalities';
const MUNICIPALITIES_CSV = 'data/municipalities.csv';
const OBJECT_NAME = 'municipalities';
const MAX_BYTES = 200_000;
const MAX_BYTES_HOKKAIDO = 1_000_000;
const EXPECTED_DESIGNATED_CITIES = 20;

// The pinned N03 source contains one explicitly labelled unassigned area in each of
// these prefectures. No other feature without N03_007 may be discarded silently.
const EXPECTED_UNASSIGNED_AREAS: Record<string, SourceProps[]> = {
  '12': [{ N03_001: '千葉県', N03_002: null, N03_003: null, N03_004: '所属未定地', N03_007: null }],
  '13': [{ N03_001: '東京都', N03_002: null, N03_003: null, N03_004: '所属未定地', N03_007: null }],
  '23': [{ N03_001: '愛知県', N03_002: null, N03_003: null, N03_004: '所属未定地', N03_007: null }],
  '47': [{ N03_001: '沖縄県', N03_002: null, N03_003: null, N03_004: '所属未定地', N03_007: null }],
};

// 北方領土 villages: present in N03 but without functioning assemblies, so not in the CSV.
const NORTHERN_TERRITORIES = new Set(['01695', '01696', '01697', '01698', '01699', '01700']);

interface SourceProps {
  N03_001: string | null;
  N03_002: string | null;
  N03_003: string | null;
  N03_004: string | null;
  N03_007: string | null;
}

interface Topo<P> {
  objects: Record<string, { geometries: { properties: P }[] }>;
}

const rawPath = (prefCode: string) => path.join(RAW_DIR, `${prefCode}.json`);

async function ensureSource(prefCode: string): Promise<void> {
  const file = rawPath(prefCode);
  if (fs.existsSync(file)) return;
  const url = sourceUrl(prefCode);
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed for ${prefCode}: HTTP ${res.status}`);
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

/**
 * Dissolves the source into one feature per municipal assembly, with properties { code5 }.
 * Designated-city wards map to the parent city by city name (N03_003) rather than code
 * range, so ward reorganizations after the source edition (e.g. 浜松市, 2024) still resolve.
 * Features with no code (所属未定地) and 北方領土 villages are dropped.
 *
 * Merging uses topojson's shared arcs (mergeArcs) instead of mapshaper -dissolve, whose
 * polygon mosaic fails on some source files (e.g. 愛媛県: "Invalid node geometry").
 */
export function dissolveByCode5(
  prefCode: string,
  source: string,
  designatedByName: Map<string, string>,
  usedParents: Set<string>,
): string {
  const topology = JSON.parse(source) as Topology;
  const [object] = Object.values(topology.objects);
  if (object?.type !== 'GeometryCollection') throw new Error('Source has no GeometryCollection');

  const missingCodeAreas = object.geometries
    .map((g) => g.properties as unknown as SourceProps)
    .filter((p) => !p.N03_007);
  const expectedMissing = EXPECTED_UNASSIGNED_AREAS[prefCode] ?? [];
  if (JSON.stringify(missingCodeAreas) !== JSON.stringify(expectedMissing)) {
    throw new Error(
      `${prefCode}: unexpected features without N03_007: ${JSON.stringify(missingCodeAreas)}`,
    );
  }

  const groups = new Map<string, typeof object.geometries>();
  for (const g of object.geometries) {
    const p = g.properties as unknown as SourceProps;
    if (!p.N03_007 || NORTHERN_TERRITORIES.has(p.N03_007)) continue;
    const parent =
      p.N03_003 && p.N03_004?.endsWith('区') ? designatedByName.get(p.N03_003) : undefined;
    if (parent) usedParents.add(parent);
    const code5 = parent ?? p.N03_007;
    groups.set(code5, [...(groups.get(code5) ?? []), g]);
  }

  const geometries = [...groups].map(([code5, parts]) => ({
    ...mergeArcs(topology, parts as Parameters<typeof mergeArcs>[1]),
    properties: { code5 },
  }));
  topology.objects = { [OBJECT_NAME]: { type: 'GeometryCollection', geometries } };
  return JSON.stringify(topology);
}

/** Adds the master-list name to each feature. */
function withNames(topo: string, names: Map<string, string>): string {
  const parsed = JSON.parse(topo) as Topo<{ code5: string; name?: string }>;
  for (const g of parsed.objects[OBJECT_NAME]?.geometries ?? []) {
    g.properties = { code5: g.properties.code5, name: names.get(g.properties.code5) ?? '' };
  }
  return JSON.stringify(parsed);
}

/** Output must hold exactly one feature per CSV municipality, with only code5 and name. */
function verify(prefCode: string, topo: string, expected: Map<string, string>): void {
  const parsed = JSON.parse(topo) as Topo<Record<string, string>>;
  const geometries = parsed.objects[OBJECT_NAME]?.geometries;
  if (!geometries) throw new Error(`${prefCode}: output has no "${OBJECT_NAME}" object`);

  const seen = new Set<string>();
  for (const { properties: p } of geometries) {
    const keys = Object.keys(p).sort().join(',');
    if (keys !== 'code5,name') throw new Error(`${prefCode}: unexpected properties ${keys}`);
    if (expected.get(p.code5) !== p.name) {
      throw new Error(`${prefCode}: ${p.code5} (${p.name}) is not in municipalities.csv`);
    }
    if (seen.has(p.code5)) throw new Error(`${prefCode}: duplicate feature for ${p.code5}`);
    seen.add(p.code5);
  }
  const missing = [...expected.keys()].filter((c) => !seen.has(c));
  if (missing.length > 0) throw new Error(`${prefCode}: no polygon for ${missing.join(', ')}`);
}

async function main(): Promise<void> {
  const municipalities = loadMunicipalities(MUNICIPALITIES_CSV);
  const byPref = new Map<string, Municipality[]>();
  for (const m of municipalities) {
    if (m.kind === 'prefecture') continue;
    byPref.set(m.prefCode, [...(byPref.get(m.prefCode) ?? []), m]);
  }
  if (byPref.size !== 47) throw new Error('municipalities.csv must cover 47 prefectures');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const usedParents = new Set<string>();
  let totalFeatures = 0;

  for (const [prefCode, munis] of [...byPref].sort(([a], [b]) => a.localeCompare(b))) {
    await ensureSource(prefCode);
    const expected = new Map(munis.map((m) => [m.code5, m.name]));
    const designatedByName = new Map(
      munis.filter((m) => m.kind === 'designated_city').map((m) => [m.name, m.code5]),
    );

    const dissolved = dissolveByCode5(
      prefCode,
      fs.readFileSync(rawPath(prefCode), 'utf-8'),
      designatedByName,
      usedParents,
    );
    // Re-encode through mapshaper for a clean, sorted topology.
    const commands = ['-i source.topojson', '-sort code5', '-o output.topojson format=topojson'];
    const output = await mapshaper.applyCommands(commands.join(' '), {
      'source.topojson': dissolved,
    });
    const topo = withNames(String(output['output.topojson']), expected);

    verify(prefCode, topo, expected);
    const bytes = Buffer.byteLength(topo);
    const limit = prefCode === '01' ? MAX_BYTES_HOKKAIDO : MAX_BYTES;
    if (bytes >= limit) throw new Error(`${prefCode}: output is ${bytes} bytes; limit is ${limit}`);

    fs.writeFileSync(path.join(OUT_DIR, `${prefCode}.topojson`), topo);
    totalFeatures += expected.size;
    console.log(
      `Wrote ${prefCode}.topojson (${expected.size} features, ${(bytes / 1024).toFixed(1)} KB)`,
    );
  }

  if (usedParents.size !== EXPECTED_DESIGNATED_CITIES) {
    throw new Error(
      `Expected ${EXPECTED_DESIGNATED_CITIES} designated cities to absorb wards, got ${usedParents.size}`,
    );
  }
  console.log(
    `Done: 47 files, ${totalFeatures} municipalities, ${usedParents.size} designated cities`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
