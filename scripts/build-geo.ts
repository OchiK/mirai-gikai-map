/**
 * Builds public/geo/prefectures.topojson from the 地球地図日本 (Global Map Japan)
 * prefecture boundaries, as redistributed by dataofjapan/land.
 *
 * Output properties are limited to pref_code ("01".."47"), code5 ("01000".."47000")
 * and name ("北海道".."沖縄県"). Everything else joins at runtime from the build's data.
 *
 * Usage: pnpm build:geo
 */
import fs from 'node:fs';
import path from 'node:path';
import mapshaper from 'mapshaper';
import { loadMunicipalities } from '../src/lib/data';

// Pinned to a commit so the output is reproducible.
const SOURCE_COMMIT = '01d9c03b92c4b7280cefd3da6b7c76e8b7a746e5';
const SOURCE_URL = `https://raw.githubusercontent.com/dataofjapan/land/${SOURCE_COMMIT}/japan.topojson`;
const RAW_PATH = 'data/raw/japan.topojson';
const OUT_PATH = 'public/geo/prefectures.topojson';
const MUNICIPALITIES_CSV = 'data/municipalities.csv';
const MAX_BYTES = 300_000;
const SIMPLIFY_PERCENT = '40%';

async function ensureSource(): Promise<void> {
  if (fs.existsSync(RAW_PATH)) return;
  console.log(`Downloading ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  fs.mkdirSync(path.dirname(RAW_PATH), { recursive: true });
  fs.writeFileSync(RAW_PATH, Buffer.from(await res.arrayBuffer()));
}

/** Adds code5 and the master-list name to each feature, keeping pref_code first. */
function withNames(topo: string, names: Map<string, string>): string {
  const parsed = JSON.parse(topo) as {
    objects: Record<string, { geometries: { properties: Record<string, string> }[] }>;
  };
  for (const g of parsed.objects.prefectures?.geometries ?? []) {
    const prefCode = g.properties.pref_code;
    g.properties = {
      pref_code: prefCode,
      code5: `${prefCode}000`,
      name: names.get(prefCode) ?? '',
    };
  }
  return JSON.stringify(parsed);
}

interface OutFeature {
  properties: { pref_code: string; code5: string; name: string };
}

function verify(topo: string, expectedNames: Map<string, string>): void {
  const parsed = JSON.parse(topo) as {
    objects: Record<string, { geometries: OutFeature[] }>;
  };
  const geometries = parsed.objects.prefectures?.geometries;
  if (!geometries) throw new Error('Output has no "prefectures" object');
  if (geometries.length !== 47) throw new Error(`Expected 47 features, got ${geometries.length}`);

  const seen = new Set<string>();
  for (const { properties: p } of geometries) {
    const keys = Object.keys(p).sort().join(',');
    if (keys !== 'code5,name,pref_code') throw new Error(`Unexpected properties: ${keys}`);
    if (!/^\d{2}$/.test(p.pref_code)) throw new Error(`Bad pref_code: ${p.pref_code}`);
    if (p.code5 !== `${p.pref_code}000`) throw new Error(`Bad code5 for ${p.pref_code}`);
    if (expectedNames.get(p.pref_code) !== p.name) {
      throw new Error(`Name mismatch for ${p.pref_code}: ${p.name}`);
    }
    seen.add(p.pref_code);
  }
  if (seen.size !== 47) throw new Error('Duplicate pref_code in output');
}

async function main(): Promise<void> {
  await ensureSource();

  // Prefecture names come from the 総務省 master list, not the source file.
  const expectedNames = new Map(
    loadMunicipalities(MUNICIPALITIES_CSV)
      .filter((m) => m.kind === 'prefecture')
      .map((m) => [m.prefCode, m.name]),
  );
  if (expectedNames.size !== 47) throw new Error('municipalities.csv must list 47 prefectures');

  const commands = [
    '-i source.topojson',
    '-rename-layers prefectures',
    `-each "pref_code = String(id).padStart(2, '0')"`,
    // Merge any multi-part records into one feature per prefecture.
    '-dissolve pref_code',
    '-filter-fields pref_code',
    '-sort pref_code',
    `-simplify visvalingam weighted keep-shapes ${SIMPLIFY_PERCENT}`,
    '-o output.topojson format=topojson',
  ].join(' ');

  const output = await mapshaper.applyCommands(commands, {
    'source.topojson': fs.readFileSync(RAW_PATH, 'utf-8'),
  });
  const topo = withNames(String(output['output.topojson']), expectedNames);

  verify(topo, expectedNames);
  const bytes = Buffer.byteLength(topo);
  if (bytes >= MAX_BYTES) throw new Error(`Output is ${bytes} bytes; limit is ${MAX_BYTES}`);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, topo);
  console.log(`Wrote ${OUT_PATH} (47 prefectures, ${(bytes / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
