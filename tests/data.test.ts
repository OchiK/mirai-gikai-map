import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadMunicipalities, loadSites } from '../src/lib/data';
import { calculateNationalMetrics } from '../src/lib/metrics';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirai-status-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const yamlPath = path.join(dir, 'sites.yaml');
fs.writeFileSync(
  yamlPath,
  `
- id: shinjuku-ku
  assembly_code5: "13104"
  assembly_level: municipal
  name: みらい議会＠新宿区
  url: https://a.example/
  based_on: fork
  added_on: 2026-09-30
  status: active
- id: chuo-ku
  assembly_code5: "13102"
  assembly_level: municipal
  name: みらい議会＠中央区
  url: https://b.example/
  based_on: fork
  added_on: 2026-09-30
  status: building
- id: minato-ku
  assembly_code5: "13103"
  assembly_level: municipal
  name: みらい議会＠港区
  url: https://c.example/
  based_on: fork
  added_on: 2026-09-30
  status: active
`,
);

const statusRow = (status: string) => ({
  http: null,
  last_checked: '2026-10-01T00:00:00.000Z',
  last_ok: null,
  consecutive_failures: 3,
  repo_pushed_at: null,
  status,
});

describe('loadSites with status.json', () => {
  it('overrides status from status.json but keeps building from sites.yaml', () => {
    const statusPath = path.join(dir, 'status.json');
    fs.writeFileSync(
      statusPath,
      JSON.stringify({ 'shinjuku-ku': statusRow('dead'), 'chuo-ku': statusRow('active') }),
    );
    const byId = new Map(loadSites(yamlPath, statusPath).map((s) => [s.id, s.status]));
    expect(byId.get('shinjuku-ku')).toBe('dead');
    expect(byId.get('chuo-ku')).toBe('building');
    expect(byId.get('minato-ku')).toBe('active');
  });

  it('falls back to sites.yaml when status.json is missing', () => {
    const sites = loadSites(yamlPath, path.join(dir, 'missing.json'));
    expect(sites.map((s) => s.status)).toEqual(['active', 'building', 'active']);
  });

  it('feeds the merged status into coverage metrics', () => {
    const munis = loadMunicipalities('data/municipalities.csv');
    const statusPath = path.join(dir, 'status-dead.json');
    fs.writeFileSync(statusPath, JSON.stringify({ 'shinjuku-ku': statusRow('dead') }));
    const withoutStatus = calculateNationalMetrics(loadSites(yamlPath, 'nope.json'), munis);
    const withStatus = calculateNationalMetrics(loadSites(yamlPath, statusPath), munis);
    expect(withoutStatus.coveredMunicipalitiesCount).toBe(2);
    expect(withStatus.coveredMunicipalitiesCount).toBe(1);
  });

  it('rejects malformed status records instead of changing coverage silently', () => {
    const statusPath = path.join(dir, 'status-invalid.json');
    fs.writeFileSync(statusPath, JSON.stringify({ 'shinjuku-ku': statusRow('unknown') }));
    expect(() => loadSites(yamlPath, statusPath)).toThrow(
      'Invalid status record for shinjuku-ku: malformed fields',
    );
  });
});
