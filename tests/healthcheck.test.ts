import { describe, expect, it } from 'vitest';
import {
  computeSiteStatus,
  hasMeaningfulChange,
  isHttpOk,
  nextRecord,
  parseGithubRepo,
} from '../scripts/healthcheck';
import type { SiteStatusRecordRow } from '../src/lib/data';

const NOW = new Date('2026-10-01T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const record = (overrides: Partial<SiteStatusRecordRow> = {}): SiteStatusRecordRow => ({
  http: 200,
  last_checked: daysAgo(7),
  last_ok: daysAgo(7),
  consecutive_failures: 0,
  repo_pushed_at: null,
  status: 'active',
  ...overrides,
});

describe('computeSiteStatus', () => {
  it('keeps the previous status for 1-2 failures and turns dead at 3', () => {
    expect(computeSiteStatus(false, 1, null, 'active')).toBe('active');
    expect(computeSiteStatus(false, 2, null, 'stale')).toBe('stale');
    expect(computeSiteStatus(false, 3, null, 'active')).toBe('dead');
    expect(computeSiteStatus(false, 5, null, 'dead')).toBe('dead');
  });

  it('turns stale when the repo has had no push in over 120 days', () => {
    expect(computeSiteStatus(true, 0, 121, 'active')).toBe('stale');
    expect(computeSiteStatus(true, 0, 120, 'active')).toBe('active');
  });

  it('treats a loading site without a known repo as active', () => {
    expect(computeSiteStatus(true, 0, null, 'dead')).toBe('active');
  });

  it('never overwrites building', () => {
    expect(computeSiteStatus(false, 10, null, 'building')).toBe('building');
    expect(computeSiteStatus(true, 0, 400, 'building')).toBe('building');
  });
});

describe('nextRecord', () => {
  it('counts consecutive failures and goes dead on the third failed week', () => {
    let prev: SiteStatusRecordRow | undefined;
    const statuses: string[] = [];
    for (let week = 0; week < 3; week++) {
      prev = nextRecord('active', prev, { http: null, repoPushedAt: null }, NOW);
      statuses.push(prev.status);
    }
    expect(statuses).toEqual(['active', 'active', 'dead']);
    expect(prev?.consecutive_failures).toBe(3);
    expect(prev?.last_ok).toBeNull();
  });

  it('resets failures and updates last_ok on success', () => {
    const prev = record({ consecutive_failures: 4, status: 'dead', last_ok: daysAgo(30) });
    const next = nextRecord('active', prev, { http: 200, repoPushedAt: daysAgo(10) }, NOW);
    expect(next).toMatchObject({
      consecutive_failures: 0,
      status: 'active',
      last_ok: NOW.toISOString(),
    });
  });

  it('keeps last_ok and the previous repo date on a failed check', () => {
    const prev = record({ repo_pushed_at: daysAgo(200), status: 'stale' });
    const next = nextRecord('active', prev, { http: 503, repoPushedAt: null }, NOW);
    expect(next).toMatchObject({
      http: 503,
      consecutive_failures: 1,
      last_ok: prev.last_ok,
      repo_pushed_at: prev.repo_pushed_at,
      status: 'stale',
    });
  });

  it('marks a loading site with an old repo stale', () => {
    const next = nextRecord('active', undefined, { http: 200, repoPushedAt: daysAgo(150) }, NOW);
    expect(next.status).toBe('stale');
  });

  it('preserves building from sites.yaml', () => {
    const next = nextRecord('building', record(), { http: null, repoPushedAt: null }, NOW);
    expect(next.status).toBe('building');
  });

  it('leaves building after sites.yaml promotes the site', () => {
    const prev = record({ status: 'building' });
    expect(nextRecord('active', prev, { http: 200, repoPushedAt: null }, NOW).status).toBe(
      'active',
    );
    expect(nextRecord('active', prev, { http: null, repoPushedAt: null }, NOW).status).toBe(
      'active',
    );
  });
});

describe('helpers', () => {
  it('treats 2xx and 3xx as success', () => {
    expect(isHttpOk(200)).toBe(true);
    expect(isHttpOk(301)).toBe(true);
    expect(isHttpOk(404)).toBe(false);
    expect(isHttpOk(500)).toBe(false);
    expect(isHttpOk(null)).toBe(false);
  });

  it('parses GitHub repo URLs and ignores other hosts', () => {
    expect(parseGithubRepo('https://github.com/OchiK/miraigikai-Shinjuku')).toBe(
      'OchiK/miraigikai-Shinjuku',
    );
    expect(parseGithubRepo('https://github.com/a/b.git/')).toBe('a/b');
    expect(parseGithubRepo(null)).toBeNull();
    expect(parseGithubRepo('https://gitlab.com/a/b')).toBeNull();
  });

  it('ignores timestamp-only changes', () => {
    const prev = { a: record() };
    expect(hasMeaningfulChange(prev, { a: record({ last_checked: NOW.toISOString() }) })).toBe(
      false,
    );
    expect(hasMeaningfulChange(prev, { a: record({ consecutive_failures: 1 }) })).toBe(true);
    expect(hasMeaningfulChange(prev, { a: record({ status: 'stale' }) })).toBe(true);
    expect(hasMeaningfulChange(prev, { a: record(), b: record() })).toBe(true);
    expect(hasMeaningfulChange({}, { a: record() })).toBe(true);
  });
});
