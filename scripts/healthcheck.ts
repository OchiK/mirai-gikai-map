/**
 * Weekly health check: probes every site URL, reads repo activity from the GitHub API,
 * and writes data/status.json. The file is rewritten only when a site's status or
 * consecutive failure count changes, so the bot never makes timestamp-only commits.
 *
 * Usage: pnpm healthcheck [output-path]   (or STATUS_JSON_PATH=...; default data/status.json)
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';
import type { SiteStatusRecordRow } from '../src/lib/data';
import type { SiteStatus } from '../src/lib/metrics';

export const DEAD_FAILURE_THRESHOLD = 3;
export const STALE_DAYS = 120;
const HTTP_TIMEOUT_MS = 15_000;
const USER_AGENT = 'MiraiGikaiMapBot/1.0 (+https://mirai-gikai-map.vercel.app/)';
const DAY_MS = 24 * 60 * 60 * 1000;

export type StatusFile = Record<string, SiteStatusRecordRow>;

interface SiteRow {
  id: string;
  url: string;
  repo?: string | null;
  status: SiteStatus;
}

export interface ProbeResult {
  /** Final HTTP status code, or null on network error or timeout. */
  http: number | null;
  /** Repo `pushed_at`, or null when the site has no repo or the API call failed. */
  repoPushedAt: string | null;
}

export function isHttpOk(http: number | null): boolean {
  return http !== null && http >= 200 && http < 400;
}

export function daysSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / DAY_MS;
}

/** Parses `https://github.com/{owner}/{repo}` into an API path, or null for non-GitHub URLs. */
export function parseGithubRepo(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/i.exec(url.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

/**
 * Status rules (in order):
 * - `building` is set by hand in sites.yaml and is never overwritten.
 * - `dead` after DEAD_FAILURE_THRESHOLD consecutive failed checks.
 * - A failed check below the threshold keeps the previous status.
 * - `stale` when the site loads but the repo has had no push in STALE_DAYS.
 * - `active` otherwise (including sites with no known repo).
 */
export function computeSiteStatus(
  httpOk: boolean,
  consecutiveFailures: number,
  pushedDaysAgo: number | null,
  currentStatus: SiteStatus,
): SiteStatus {
  if (currentStatus === 'building') return 'building';
  if (consecutiveFailures >= DEAD_FAILURE_THRESHOLD) return 'dead';
  if (!httpOk) return currentStatus;
  if (pushedDaysAgo !== null && pushedDaysAgo > STALE_DAYS) return 'stale';
  return 'active';
}

/** Builds the next status.json record for one site from the previous record and a fresh probe. */
export function nextRecord(
  yamlStatus: SiteStatus,
  prev: SiteStatusRecordRow | undefined,
  probe: ProbeResult,
  now: Date,
): SiteStatusRecordRow {
  const ok = isHttpOk(probe.http);
  const nowIso = now.toISOString();
  const consecutiveFailures = ok ? 0 : (prev?.consecutive_failures ?? 0) + 1;
  const repoPushedAt = probe.repoPushedAt ?? prev?.repo_pushed_at ?? null;
  // `building` belongs to sites.yaml, not to the historical status file. Once a
  // maintainer promotes a site, an old `building` record must not keep it stuck there.
  const currentStatus =
    yamlStatus === 'building'
      ? 'building'
      : prev?.status === 'building'
        ? yamlStatus
        : (prev?.status ?? yamlStatus);
  return {
    http: probe.http,
    last_checked: nowIso,
    last_ok: ok ? nowIso : (prev?.last_ok ?? null),
    consecutive_failures: consecutiveFailures,
    repo_pushed_at: repoPushedAt,
    status: computeSiteStatus(
      ok,
      consecutiveFailures,
      repoPushedAt ? daysSince(repoPushedAt, now) : null,
      currentStatus,
    ),
  };
}

/** True when a site was added or removed, or any status / failure count changed. */
export function hasMeaningfulChange(prev: StatusFile, next: StatusFile): boolean {
  const prevIds = Object.keys(prev);
  const nextIds = Object.keys(next);
  if (prevIds.length !== nextIds.length) return true;
  return nextIds.some((id) => {
    const p = prev[id];
    const n = next[id];
    return !p || p.status !== n.status || p.consecutive_failures !== n.consecutive_failures;
  });
}

async function probeUrl(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT },
    });
    await res.body?.cancel();
    return res.status;
  } catch {
    return null;
  }
}

async function fetchPushedAt(repoUrl: string | null | undefined): Promise<string | null> {
  const repo = parseGithubRepo(repoUrl);
  if (!repo) return null;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': USER_AGENT,
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`  ! GitHub API ${res.status} for ${repo}`);
      return null;
    }
    const body = (await res.json()) as { pushed_at?: string | null };
    return body.pushed_at ?? null;
  } catch (err) {
    console.warn(`  ! GitHub API error for ${repo}: ${(err as Error).message}`);
    return null;
  }
}

async function main() {
  const outPath = process.argv[2] ?? process.env.STATUS_JSON_PATH ?? 'data/status.json';
  const sites = (yaml.load(fs.readFileSync('data/sites.yaml', 'utf-8')) ?? []) as SiteRow[];
  const prev: StatusFile = fs.existsSync(outPath)
    ? (JSON.parse(fs.readFileSync(outPath, 'utf-8')) ?? {})
    : {};
  const now = new Date();

  const records = await Promise.all(
    sites.map(async (site) => {
      const [http, repoPushedAt] = await Promise.all([
        probeUrl(site.url),
        fetchPushedAt(site.repo),
      ]);
      return [site, nextRecord(site.status, prev[site.id], { http, repoPushedAt }, now)] as const;
    }),
  );

  const next: StatusFile = {};
  for (const [site, record] of records) {
    next[site.id] = record;
    const before = prev[site.id]?.status ?? site.status;
    const changed = before !== record.status ? ` (was ${before})` : '';
    console.log(
      `${record.status.padEnd(8)} ${String(record.http ?? 'ERR').padEnd(4)} fails=${record.consecutive_failures} ${site.id}${changed}`,
    );
  }

  if (!hasMeaningfulChange(prev, next)) {
    console.log(`No status changes; ${outPath} left untouched.`);
    return;
  }
  fs.writeFileSync(outPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(next).length} records to ${outPath}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
