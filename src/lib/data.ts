/**
 * Loaders that turn the on-disk data files (snake_case) into the camelCase
 * types used by metrics.ts. No coverage math lives here.
 */
import fs from 'node:fs';
import { parse } from 'csv-parse/sync';
import yaml from 'js-yaml';
import type { Municipality, SiteEntry } from './metrics';

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

export function loadSites(yamlPath: string): SiteEntry[] {
  const rows = (yaml.load(fs.readFileSync(yamlPath, 'utf-8')) ?? []) as SiteRow[];
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
    status: r.status,
    countsForCoverage: r.counts_for_coverage ?? true,
    notes: r.notes,
  }));
}
