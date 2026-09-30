import fs from 'node:fs';
import { parse } from 'csv-parse/sync';
import { describe, expect, it } from 'vitest';
import { validateMunicipalityRows } from '../scripts/validate';

type RawRow = Record<string, string>;

function loadRows(): RawRow[] {
  return parse(fs.readFileSync('data/municipalities.csv', 'utf-8'), {
    columns: true,
    skip_empty_lines: true,
  }) as RawRow[];
}

describe('municipalities.csv validation', () => {
  it('accepts the generated municipality master', () => {
    expect(validateMunicipalityRows(loadRows())).toEqual([]);
  });

  it('rejects malformed codes, prefecture relationships, and reference dates', () => {
    const rows = loadRows();
    rows[0] = {
      ...rows[0],
      code6: 'BADBAD',
      pref_code: '99',
      population_ref_date: 'not-a-date',
    };

    const errors = validateMunicipalityRows(rows);
    expect(errors.some((error) => error.includes('code6 must be 6 digits'))).toBe(true);
    expect(errors.some((error) => error.includes('population_ref_date'))).toBe(true);
    expect(errors.some((error) => error.includes('Missing prefecture row: 01000'))).toBe(true);
  });

  it('rejects duplicate codes and invalid parent relationships', () => {
    const rows = loadRows();
    rows[1] = {
      ...rows[1],
      code5: rows[0].code5,
      code6: rows[0].code6,
    };
    rows[2] = { ...rows[2], parent_code5: '99999' };

    const errors = validateMunicipalityRows(rows);
    expect(errors).toContain(`Duplicate code5: ${rows[0].code5}`);
    expect(errors).toContain(`Duplicate code6: ${rows[0].code6}`);
    expect(errors).toContain(`Invalid designated-city parent 99999 for ${rows[2].code5}`);
  });

  it('rejects unknown columns and population values outside the safe integer range', () => {
    const rows = loadRows();
    rows[0] = { ...rows[0], unexpected: 'value' };
    rows[1] = { ...rows[1], population: '9007199254740992' };

    const errors = validateMunicipalityRows(rows);
    expect(errors.some((error) => error.includes('Unrecognized key'))).toBe(true);
    expect(errors.some((error) => error.includes('safe integer range'))).toBe(true);
  });
});
