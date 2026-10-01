/**
 * Loaders that turn the on-disk data files (snake_case) into the camelCase
 * types used by metrics.ts. No coverage math lives here.
 */
import fs from 'node:fs';
import { parse } from 'csv-parse/sync';
import yaml from 'js-yaml';
import type { Municipality, SiteEntry, SiteStatus } from './metrics';

interface MunicipalityRow {
  code5: string;
  code6: string;
  pref_code: string;
  pref_name: string;
  name: string;
  kind: Municipality['kind'];
  parent_code5: string;
  population: string;
  population_ref_date: string;
}

export function loadMunicipalities(csvPath: string): Municipality[] {
  const rows = parse(fs.readFileSync(csvPath, 'utf-8'), {
    columns: true,
    skip_empty_lines: true,
  }) as MunicipalityRow[];
  return rows.map((r) => ({
    code5: r.code5,
    code6: r.code6,
    prefCode: r.pref_code,
    prefName: r.pref_name,
    name: r.name,
    kind: r.kind,
    parentCode5: r.parent_code5 || undefined,
    population: Number(r.population),
    populationRefDate: r.population_ref_date,
  }));
}

interface SiteRow {
  id: string;
  assembly_code5: string;
  assembly_level: SiteEntry['assemblyLevel'];
  name: string;
  url: string;
  url_alt?: string;
  repo?: string | null;
  operator?: string;
  operator_x?: string;
  based_on: SiteEntry['basedOn'];
  launched_on?: string | Date;
  added_on: string | Date;
  status: SiteEntry['status'];
  counts_for_coverage?: boolean;
  notes?: string;
}

function toDateString(v: string | Date): string;
function toDateString(v: undefined): undefined;
function toDateString(v: string | Date | undefined): string | undefined;
function toDateString(v: string | Date | undefined): string | undefined {
  return v instanceof Date ? v.toISOString().slice(0, 10) : v;
}

/** One site's health-check result as written to data/status.json (snake_case on disk). */
export interface SiteStatusRecordRow {
  http: number | null;
  last_checked: string;
  last_ok: string | null;
  consecutive_failures: number;
  repo_pushed_at: string | null;
  status: SiteStatus;
}

export interface SiteStatusRecord {
  http: number | null;
  lastChecked: string;
  lastOk: string | null;
  consecutiveFailures: number;
  repoPushedAt: string | null;
  status: SiteStatus;
}

const SITE_STATUSES = new Set<SiteStatus>(['active', 'stale', 'dead', 'building']);

function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function parseStatusRecord(id: string, value: unknown): SiteStatusRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid status record for ${id}: expected an object`);
  }
  const row = value as Record<string, unknown>;
  if (
    !(
      row.http === null ||
      (typeof row.http === 'number' &&
        Number.isInteger(row.http) &&
        row.http >= 100 &&
        row.http <= 599)
    ) ||
    !isIsoDateTime(row.last_checked) ||
    !(row.last_ok === null || isIsoDateTime(row.last_ok)) ||
    typeof row.consecutive_failures !== 'number' ||
    !Number.isSafeInteger(row.consecutive_failures) ||
    row.consecutive_failures < 0 ||
    !(row.repo_pushed_at === null || isIsoDateTime(row.repo_pushed_at)) ||
    typeof row.status !== 'string' ||
    !SITE_STATUSES.has(row.status as SiteStatus)
  ) {
    throw new Error(`Invalid status record for ${id}: malformed fields`);
  }
  return {
    http: row.http as number | null,
    lastChecked: row.last_checked,
    lastOk: row.last_ok as string | null,
    consecutiveFailures: row.consecutive_failures as number,
    repoPushedAt: row.repo_pushed_at as string | null,
    status: row.status as SiteStatus,
  };
}

/** Reads data/status.json keyed by site id. Returns an empty map when the file is missing. */
export function loadStatusRecords(statusJsonPath: string): Map<string, SiteStatusRecord> {
  if (!fs.existsSync(statusJsonPath)) return new Map();
  const rows = JSON.parse(fs.readFileSync(statusJsonPath, 'utf-8')) as unknown;
  if (!rows || typeof rows !== 'object' || Array.isArray(rows)) {
    throw new Error(`Invalid status file ${statusJsonPath}: expected an object keyed by site id`);
  }
  return new Map(
    Object.entries(rows as Record<string, unknown>).map(([id, row]) => [
      id,
      parseStatusRecord(id, row),
    ]),
  );
}

/**
 * Loads sites.yaml and overlays the health-check status from status.json.
 * A `building` status in sites.yaml is set by hand and always wins.
 */
export function loadSites(yamlPath: string, statusJsonPath = 'data/status.json'): SiteEntry[] {
  const rows = (yaml.load(fs.readFileSync(yamlPath, 'utf-8')) ?? []) as SiteRow[];
  const statuses = loadStatusRecords(statusJsonPath);
  return rows.map((r) => ({
    id: r.id,
    assemblyCode5: r.assembly_code5,
    assemblyLevel: r.assembly_level,
    name: r.name,
    url: r.url,
    urlAlt: r.url_alt,
    repo: r.repo ?? undefined,
    operator: r.operator,
    operatorX: r.operator_x,
    basedOn: r.based_on,
    launchedOn: toDateString(r.launched_on),
    addedOn: toDateString(r.added_on),
    status: r.status === 'building' ? 'building' : (statuses.get(r.id)?.status ?? r.status),
    countsForCoverage: r.counts_for_coverage ?? true,
    notes: r.notes,
  }));
}
