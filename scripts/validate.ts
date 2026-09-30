import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import yaml from 'js-yaml';
import { z } from 'zod';

const SiteEntrySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'id must be a kebab-case slug'),
    assembly_code5: z.string().regex(/^\d{5}$/, 'assembly_code5 must be a 5-digit string'),
    assembly_level: z.enum(['municipal', 'prefectural']),
    name: z.string().min(1, 'name cannot be empty'),
    url: z
      .string()
      .url()
      .refine((val) => val.startsWith('https://'), 'url must use HTTPS'),
    repo: z
      .string()
      .url()
      .refine((val) => val.startsWith('https://'), 'repo must use HTTPS'),
    operator: z.string().min(1, 'operator cannot be empty').optional(),
    based_on: z.enum(['fork', 'independent']),
    launched_on: z
      .union([
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'launched_on must be YYYY-MM-DD'),
        z.date().transform((d) => d.toISOString().slice(0, 10)),
      ])
      .optional(),
    added_on: z.union([
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'added_on must be YYYY-MM-DD'),
      z.date().transform((d) => d.toISOString().slice(0, 10)),
    ]),
    status: z.enum(['active', 'stale', 'dead', 'building']),
    notes: z.string().optional().default(''),
  })
  .superRefine((site, ctx) => {
    if ((!site.operator || !site.launched_on) && !site.notes.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notes'],
        message: 'notes must explain why operator or launched_on is unverified',
      });
    }
  });

const SitesListSchema = z.array(SiteEntrySchema);

export interface MunicipalityRow {
  code5: string;
  code6: string;
  name: string;
  pref_code: string;
  pref_name: string;
  kind: 'prefecture' | 'designated_city' | 'city' | 'special_ward' | 'town' | 'village';
  parent_code5: string;
  population: string;
  population_ref_date: '2026-01-01';
}

const MunicipalityRowSchema = z
  .object({
    code5: z.string().regex(/^\d{5}$/, 'code5 must be 5 digits'),
    code6: z.string().regex(/^\d{6}$/, 'code6 must be 6 digits'),
    pref_code: z.string().regex(/^\d{2}$/, 'pref_code must be 2 digits'),
    pref_name: z.string().min(1, 'pref_name cannot be empty'),
    name: z.string().min(1, 'name cannot be empty'),
    kind: z.enum(['prefecture', 'designated_city', 'city', 'special_ward', 'town', 'village']),
    parent_code5: z.union([
      z.literal(''),
      z.string().regex(/^\d{5}$/, 'parent_code5 must be empty or 5 digits'),
    ]),
    population: z.string().regex(/^\d+$/, 'population must be a nonnegative integer'),
    population_ref_date: z.literal('2026-01-01'),
  })
  .strict();

const EXPECTED_KINDS = {
  prefecture: 47,
  designated_city: 20,
  city: 772,
  special_ward: 23,
  town: 743,
  village: 183,
} as const;

function expectedCheckDigit(code5: string): string {
  const weightedSum = [...code5].reduce(
    (sum, digit, index) => sum + Number(digit) * (6 - index),
    0,
  );
  return String((11 - (weightedSum % 11)) % 10);
}

export function validateMunicipalityRows(rawRecords: unknown[]): string[] {
  const errors: string[] = [];
  const records: MunicipalityRow[] = [];

  rawRecords.forEach((raw, index) => {
    const result = MunicipalityRowSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(
          `municipalities.csv row ${index + 2}, ${issue.path.join('.') || 'row'}: ${issue.message}`,
        );
      }
      return;
    }
    records.push(result.data);
  });

  const seenCode5 = new Set<string>();
  const seenCode6 = new Set<string>();
  const prefNames = new Map<string, string>();
  const counts = new Map<MunicipalityRow['kind'], number>();

  for (const row of records) {
    if (seenCode5.has(row.code5)) errors.push(`Duplicate code5: ${row.code5}`);
    if (seenCode6.has(row.code6)) errors.push(`Duplicate code6: ${row.code6}`);
    seenCode5.add(row.code5);
    seenCode6.add(row.code6);

    if (row.code6.slice(0, 5) !== row.code5) {
      errors.push(`code6 does not start with code5: ${row.code5} / ${row.code6}`);
    } else if (row.code6[5] !== expectedCheckDigit(row.code5)) {
      errors.push(`Invalid code6 check digit: ${row.code6}`);
    }
    if (row.pref_code !== row.code5.slice(0, 2)) {
      errors.push(`pref_code does not match code5: ${row.code5} / ${row.pref_code}`);
    }
    if (!Number.isSafeInteger(Number(row.population))) {
      errors.push(`Population is outside the safe integer range: ${row.code5}`);
    }

    const knownPrefName = prefNames.get(row.pref_code);
    if (knownPrefName && knownPrefName !== row.pref_name) {
      errors.push(
        `Inconsistent prefecture name for ${row.pref_code}: ${knownPrefName} / ${row.pref_name}`,
      );
    } else {
      prefNames.set(row.pref_code, row.pref_name);
    }
    counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
  }

  for (const [kind, expected] of Object.entries(EXPECTED_KINDS)) {
    const actual = counts.get(kind as MunicipalityRow['kind']) ?? 0;
    if (actual !== expected) errors.push(`Expected ${expected} ${kind} rows, found ${actual}`);
  }

  const expectedPrefCodes = new Set(
    Array.from({ length: 47 }, (_, index) => String(index + 1).padStart(2, '0')),
  );
  const prefectures = records.filter((row) => row.kind === 'prefecture');
  const actualPrefCodes = new Set(prefectures.map((row) => row.pref_code));
  for (const code of expectedPrefCodes) {
    if (!actualPrefCodes.has(code)) errors.push(`Missing prefecture row: ${code}000`);
  }
  for (const row of prefectures) {
    if (row.code5 !== `${row.pref_code}000`) {
      errors.push(`Prefecture row has invalid code5: ${row.code5}`);
    }
    if (row.name !== row.pref_name) {
      errors.push(`Prefecture row name does not match pref_name: ${row.code5}`);
    }
  }

  const byCode5 = new Map(records.map((row) => [row.code5, row]));
  for (const row of records) {
    if (!row.parent_code5) continue;
    const parent = byCode5.get(row.parent_code5);
    if (!parent || parent.kind !== 'designated_city' || parent.pref_code !== row.pref_code) {
      errors.push(`Invalid designated-city parent ${row.parent_code5} for ${row.code5}`);
    }
  }

  return errors;
}

function main() {
  const rootDir = process.cwd();
  const sitesPath = path.join(rootDir, 'data/sites.yaml');
  const muniPath = path.join(rootDir, 'data/municipalities.csv');

  if (!fs.existsSync(sitesPath)) {
    console.error(`Error: ${sitesPath} does not exist.`);
    process.exit(1);
  }

  if (!fs.existsSync(muniPath)) {
    console.error(`Error: ${muniPath} does not exist. Run \`pnpm build:data\` first.`);
    process.exit(1);
  }

  const rawRecords = parse(fs.readFileSync(muniPath, 'utf-8'), {
    columns: true,
    skip_empty_lines: true,
  }) as unknown[];
  const errors = validateMunicipalityRows(rawRecords);
  const validRecords = rawRecords.flatMap((row) => {
    const result = MunicipalityRowSchema.safeParse(row);
    return result.success ? [result.data] : [];
  });
  const municipalities = new Map(validRecords.map((row) => [row.code5, row]));

  // Parse YAML
  const rawYaml = fs.readFileSync(sitesPath, 'utf-8');
  const parsedData = yaml.load(rawYaml);
  const result = SitesListSchema.safeParse(parsedData);

  if (!result.success) {
    console.error('❌ Validation failed for sites.yaml:');
    console.error(result.error.format());
    process.exit(1);
  }

  const sites = result.data;
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();

  for (const site of sites) {
    // Unique ID check
    if (seenIds.has(site.id)) {
      errors.push(`Duplicate id: ${site.id}`);
    }
    seenIds.add(site.id);

    // Unique URL check
    if (seenUrls.has(site.url)) {
      errors.push(`Duplicate url: ${site.url}`);
    }
    seenUrls.add(site.url);

    // Assembly code check
    if (site.assembly_level === 'prefectural') {
      const pref = municipalities.get(site.assembly_code5);
      if (!site.assembly_code5.endsWith('000') || pref?.kind !== 'prefecture') {
        errors.push(
          `Prefectural assembly code must be an existing prefecture code ending in 000: ${site.id} (${site.assembly_code5})`,
        );
      }
    } else {
      const muni = municipalities.get(site.assembly_code5);
      if (!muni || muni.kind === 'prefecture') {
        errors.push(`Unknown municipality code: ${site.assembly_code5} in site ${site.id}`);
      } else {
        // Name contains municipality name or notes provided
        if (!site.name.includes(muni.name) && (!site.notes || site.notes.trim() === '')) {
          errors.push(
            `Site name "${site.name}" does not include municipality name "${muni.name}", and no explanatory notes were provided.`,
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error('❌ Data integrity checks failed:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(`✅ sites.yaml validated successfully (${sites.length} sites checked).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
