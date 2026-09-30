import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import yaml from 'js-yaml';
import { z } from 'zod';

const SiteEntrySchema = z.object({
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
  operator: z.string().min(1, 'operator cannot be empty'),
  based_on: z.enum(['fork', 'independent']),
  launched_on: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'launched_on must be YYYY-MM-DD'),
    z.date().transform((d) => d.toISOString().slice(0, 10)),
  ]),
  added_on: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'added_on must be YYYY-MM-DD'),
    z.date().transform((d) => d.toISOString().slice(0, 10)),
  ]),
  status: z.enum(['active', 'stale', 'dead', 'building']),
  notes: z.string().optional().default(''),
});

const SitesListSchema = z.array(SiteEntrySchema);

interface MunicipalityRow {
  code5: string;
  name: string;
  pref_code: string;
  pref_name: string;
}

function main() {
  const rootDir = process.cwd();
  const sitesPath = path.join(rootDir, 'data/sites.yaml');
  const muniPath = path.join(rootDir, 'data/municipalities.csv');

  if (!fs.existsSync(sitesPath)) {
    console.error(`Error: ${sitesPath} does not exist.`);
    process.exit(1);
  }

  // Load municipalities if present
  const municipalities = new Map<string, MunicipalityRow>();
  if (fs.existsSync(muniPath)) {
    const muniRaw = fs.readFileSync(muniPath, 'utf-8');
    const records = parse(muniRaw, {
      columns: true,
      skip_empty_lines: true,
    }) as MunicipalityRow[];
    for (const row of records) {
      municipalities.set(row.code5, row);
    }
  }

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
  const errors: string[] = [];

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
      if (!site.assembly_code5.endsWith('000')) {
        errors.push(
          `Prefectural assembly code must end with 000: ${site.id} (${site.assembly_code5})`,
        );
      }
    } else if (municipalities.size > 0) {
      const muni = municipalities.get(site.assembly_code5);
      if (!muni) {
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

main();
