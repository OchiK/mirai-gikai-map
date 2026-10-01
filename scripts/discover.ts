/**
 * Weekly discovery crawl: lists forks of team-mirai/mirai-gikai (recursing into forks of
 * forks) and searches GitHub for みらい議会, then records repos not yet in sites.yaml,
 * candidates.json, or its rejected list. Nothing is added to sites.yaml automatically.
 *
 * When new candidates are found inside GitHub Actions, the script opens or updates a
 * single tracking issue through the `gh` CLI.
 *
 * Usage: pnpm discover [output-path]   (or CANDIDATES_JSON_PATH=...; default data/candidates.json)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

export const UPSTREAM_REPO = 'team-mirai/mirai-gikai';
export const ISSUE_TITLE = '[Discovery] 新規みらい議会候補の検出';
/** GitHub rejects issue bodies over 65,536 characters; leave room for the overflow note. */
const ISSUE_BODY_LIMIT = 60_000;
const SELF_REPO_FALLBACK = 'OchiK/mirai-gikai-map';
const MAX_FORK_DEPTH = 3;
const GITHUB_TIMEOUT_MS = 15_000;
const GITHUB_MAX_ATTEMPTS = 3;
const USER_AGENT = 'MiraiGikaiMapBot/1.0 (+https://mirai-gikai-map.vercel.app/)';
const IGNORED_URL_HOSTS = [
  'github.com',
  'raw.githubusercontent.com',
  'user-images.githubusercontent.com',
  'img.shields.io',
  'x.com',
  'twitter.com',
  'www.npmjs.com',
  'nodejs.org',
  'pnpm.io',
  'docs.github.com',
];

export interface Candidate {
  /** `owner/repo` as GitHub reports it. */
  repo: string;
  /** Assembly name extracted from the description or README heading, if any. */
  name: string | null;
  url: string | null;
  detected_at: string;
  stars: number;
  pushed_at: string | null;
}

export interface CandidatesFile {
  candidates: Candidate[];
  rejected: string[];
}

export interface GithubRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  stargazers_count: number;
  pushed_at: string | null;
  forks_count: number;
  fork: boolean;
}

interface SiteRow {
  url: string;
  url_alt?: string;
  repo?: string | null;
}

export function normalizeRepo(repo: string): string {
  return repo
    .trim()
    .replace(/^https:\/\/github\.com\//i, '')
    .replace(/(\.git)?\/?$/, '')
    .toLowerCase();
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    return `${u.host}${u.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.trim().replace(/\/+$/, '').toLowerCase();
  }
}

/** Extracts the assembly name from text like "みらい議会＠神奈川県" or "みらい議会@福岡県版". */
export function extractAssemblyName(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = /みらい議会\s*[＠@]\s*([^\s版|｜()（）[\]【】\-–—:：、。,]+)/u.exec(text);
  return m ? m[1] : null;
}

/** First heading line of a Markdown README. */
/**
 * GitHub search tokenizes Japanese loosely (a query for みらい議会 also returns repos that
 * only mention 議会), so search hits must contain the literal name or the upstream slug.
 */
export function mentionsMiraiGikai(
  repo: Pick<GithubRepo, 'full_name' | 'description'>,
  readme: string | null,
): boolean {
  const text = `${repo.full_name}\n${repo.description ?? ''}\n${readme ?? ''}`;
  return /みらい議会|mirai[-_]?gikai/i.test(text);
}

export function readmeTitle(readme: string | null): string | null {
  if (!readme) return null;
  const m = /^#\s+(.+)$/m.exec(readme);
  return m ? m[1].trim() : null;
}

/**
 * Returns all https URLs in a text, in order of appearance. Only ASCII URL characters are
 * matched so Japanese punctuation right after a link (e.g. "）を") is not swallowed.
 */
export function extractUrls(text: string): string[] {
  return [...text.matchAll(/https:\/\/[A-Za-z0-9\-._~:/?#@!$&*+,;=%]+/g)].map((m) =>
    m[0].replace(/[.,;:!?*]+$/, ''),
  );
}

/**
 * Picks the most likely site URL: the repo `homepage`, else the first README URL that is
 * not a code/docs host and not inherited from the upstream README.
 */
export function pickSiteUrl(
  homepage: string | null,
  readme: string | null,
  upstreamUrls: Set<string>,
): string | null {
  const usable = (url: string) => {
    const norm = normalizeUrl(url);
    if (upstreamUrls.has(norm)) return false;
    try {
      return !IGNORED_URL_HOSTS.includes(new URL(url).host.toLowerCase());
    } catch {
      return false;
    }
  };
  if (homepage?.startsWith('https://') && usable(homepage)) return homepage;
  if (!readme) return null;
  return extractUrls(readme).find(usable) ?? null;
}

export interface KnownKeys {
  repos: Set<string>;
  urls: Set<string>;
}

/** Collects every repo and URL that should not resurface as a candidate. */
export function collectKnownKeys(
  sites: SiteRow[],
  file: CandidatesFile,
  excludedRepos: string[],
): KnownKeys {
  const repos = new Set<string>(excludedRepos.map(normalizeRepo));
  const urls = new Set<string>();
  for (const s of sites) {
    if (s.repo) repos.add(normalizeRepo(s.repo));
    urls.add(normalizeUrl(s.url));
    if (s.url_alt) urls.add(normalizeUrl(s.url_alt));
  }
  for (const r of file.rejected) repos.add(normalizeRepo(r));
  for (const c of file.candidates) {
    repos.add(normalizeRepo(c.repo));
    if (c.url) urls.add(normalizeUrl(c.url));
  }
  return { repos, urls };
}

export function isKnownRepo(repo: string, known: KnownKeys): boolean {
  return known.repos.has(normalizeRepo(repo));
}

export function isKnownUrl(url: string | null, known: KnownKeys): boolean {
  return url !== null && known.urls.has(normalizeUrl(url));
}

/** Adds a candidate to the current run's deduplication sets. */
export function rememberCandidate(known: KnownKeys, repo: string, url: string | null): void {
  known.repos.add(normalizeRepo(repo));
  if (url) known.urls.add(normalizeUrl(url));
}

/** Drops pending candidates that have since been registered in sites.yaml. */
export function pruneRegistered(candidates: Candidate[], sites: SiteRow[]): Candidate[] {
  const registered = collectKnownKeys(sites, { candidates: [], rejected: [] }, []);
  return candidates.filter(
    (c) => !isKnownRepo(c.repo, registered) && !isKnownUrl(c.url, registered),
  );
}

export function buildRegistrationLink(issueRepo: string, c: Candidate): string {
  const params = new URLSearchParams({ template: 'register-site.yml' });
  if (c.url) params.set('site_url', c.url);
  params.set('repo_url', `https://github.com/${c.repo}`);
  if (c.name) params.set('assembly_name', c.name);
  return `https://github.com/${issueRepo}/issues/new?${params.toString()}`;
}

export function buildIssueBody(issueRepo: string, candidates: Candidate[], newRepos: Set<string>) {
  const lines = [
    '自動検出された「みらい議会」候補の一覧です。各候補について、サイトが表示されること、対象議会が正しいこと、非公式である旨の表示があることを確認してください。',
    '',
    '- 掲載する場合: 「掲載申請」リンクから申請を作成し、PRで `data/sites.yaml` に追加します。',
    '- 掲載しない場合: `data/candidates.json` の `rejected` にリポジトリ名を追加します。',
    '',
    '> このIssueは `scripts/discover.ts` が自動で作成・更新します。',
    '',
  ];
  let length = lines.join('\n').length;
  for (const [i, c] of candidates.entries()) {
    const tag = newRepos.has(c.repo) ? ' 🆕' : '';
    const url = c.url ? ` — ${c.url}` : ' — サイトURL不明';
    const line = `- [ ] [${c.repo}](https://github.com/${c.repo})${tag}: ${c.name ?? '議会名不明'}${url} ([掲載申請](${buildRegistrationLink(issueRepo, c)}))`;
    if (length + line.length > ISSUE_BODY_LIMIT) {
      lines.push(
        '',
        `…ほか${candidates.length - i}件は \`data/candidates.json\` を参照してください。`,
      );
      break;
    }
    lines.push(line);
    length += line.length + 1;
  }
  return `${lines.join('\n')}\n`;
}

// ── GitHub API ───────────────────────────────────────────────────────────────

function apiHeaders(accept = 'application/vnd.github+json'): Record<string, string> {
  const headers: Record<string, string> = { Accept: accept, 'User-Agent': USER_AGENT };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

/** GitHub request with a bounded timeout and retries for transient failures. */
export async function fetchGithub(
  url: string,
  init: RequestInit = {},
  maxAttempts = GITHUB_MAX_ATTEMPTS,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
      });
      const transient = res.status === 429 || res.status >= 500;
      if (!transient || attempt === maxAttempts) return res;
      await res.body?.cancel();
      lastError = new Error(`GitHub API ${res.status} for ${url}`);
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`GitHub request failed for ${url}`);
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetchGithub(`https://api.github.com${path}`, { headers: apiHeaders() });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
  return (await res.json()) as T;
}

async function listForks(repo: string, depth = 1): Promise<GithubRepo[]> {
  const out: GithubRepo[] = [];
  for (let page = 1; ; page++) {
    const batch = await getJson<GithubRepo[]>(
      `/repos/${repo}/forks?per_page=100&sort=newest&page=${page}`,
    );
    out.push(...batch);
    if (batch.length < 100) break;
  }
  if (depth < MAX_FORK_DEPTH) {
    for (const fork of [...out]) {
      if (fork.forks_count === 0) continue;
      // Forks listed with forks_count > 0 can still 404 (deleted, disabled, or private
      // children), so one bad sub-tree must not abort the whole crawl.
      try {
        out.push(...(await listForks(fork.full_name, depth + 1)));
      } catch (err) {
        console.warn(`  ! Skipping forks of ${fork.full_name}: ${(err as Error).message}`);
      }
    }
  }
  return out;
}

async function searchRepos(): Promise<GithubRepo[]> {
  const q = encodeURIComponent('"みらい議会" in:name,description,readme');
  const out: GithubRepo[] = [];
  // The search API returns at most 1000 results; 3 pages is plenty for this niche.
  for (let page = 1; page <= 3; page++) {
    const res = await getJson<{ items: GithubRepo[] }>(
      `/search/repositories?q=${q}&sort=updated&per_page=100&page=${page}`,
    );
    out.push(...res.items);
    if (res.items.length < 100) break;
  }
  return out;
}

async function fetchReadme(repo: string): Promise<string | null> {
  try {
    const res = await fetchGithub(`https://api.github.com/repos/${repo}/readme`, {
      headers: apiHeaders('application/vnd.github.raw'),
    });
    return res.ok ? await res.text() : null;
  } catch (err) {
    console.warn(`  ! Skipping README for ${repo}: ${(err as Error).message}`);
    return null;
  }
}

function upsertIssue(issueRepo: string, body: string) {
  const bodyFile = path.join(os.tmpdir(), 'discovery-issue.md');
  fs.writeFileSync(bodyFile, body);
  try {
    const open = JSON.parse(
      execFileSync(
        'gh',
        [
          'issue',
          'list',
          '--repo',
          issueRepo,
          '--state',
          'open',
          '--search',
          `"${ISSUE_TITLE}" in:title`,
          '--json',
          'number,title',
        ],
        { encoding: 'utf-8' },
      ),
    ) as { number: number; title: string }[];
    const existing = open.find((i) => i.title === ISSUE_TITLE);
    if (existing) {
      execFileSync(
        'gh',
        ['issue', 'edit', String(existing.number), '--repo', issueRepo, '--body-file', bodyFile],
        { stdio: 'inherit' },
      );
      console.log(`Updated issue #${existing.number}.`);
    } else {
      execFileSync(
        'gh',
        ['issue', 'create', '--repo', issueRepo, '--title', ISSUE_TITLE, '--body-file', bodyFile],
        { stdio: 'inherit' },
      );
    }
  } finally {
    fs.rmSync(bodyFile, { force: true });
  }
}

async function main() {
  const outPath = process.argv[2] ?? process.env.CANDIDATES_JSON_PATH ?? 'data/candidates.json';
  const issueRepo = process.env.GITHUB_REPOSITORY ?? SELF_REPO_FALLBACK;
  const sites = (yaml.load(fs.readFileSync('data/sites.yaml', 'utf-8')) ?? []) as SiteRow[];
  const file: CandidatesFile = fs.existsSync(outPath)
    ? JSON.parse(fs.readFileSync(outPath, 'utf-8'))
    : { candidates: [], rejected: [] };

  const pending = pruneRegistered(file.candidates, sites);
  const known = collectKnownKeys(sites, file, [UPSTREAM_REPO, issueRepo, SELF_REPO_FALLBACK]);

  const upstream = await getJson<GithubRepo>(`/repos/${UPSTREAM_REPO}`);
  const upstreamUrls = new Set(
    extractUrls((await fetchReadme(UPSTREAM_REPO)) ?? '').map(normalizeUrl),
  );
  if (upstream.homepage) upstreamUrls.add(normalizeUrl(upstream.homepage));

  const forks = await listForks(UPSTREAM_REPO);
  const searched = await searchRepos();
  console.log(`Found ${forks.length} forks and ${searched.length} search results.`);

  const seen = new Set<string>();
  const found: Candidate[] = [];
  const now = new Date().toISOString();
  const forkNames = new Set(forks.map((r) => normalizeRepo(r.full_name)));
  for (const repo of [...forks, ...searched]) {
    const key = normalizeRepo(repo.full_name);
    if (seen.has(key) || isKnownRepo(repo.full_name, known)) continue;
    seen.add(key);

    const readme = await fetchReadme(repo.full_name);
    if (!forkNames.has(key) && !mentionsMiraiGikai(repo, readme)) continue;
    const url = pickSiteUrl(repo.homepage, readme, upstreamUrls);
    if (isKnownUrl(url, known)) continue;
    found.push({
      repo: repo.full_name,
      name: extractAssemblyName(repo.description) ?? extractAssemblyName(readmeTitle(readme)),
      url,
      detected_at: now,
      stars: repo.stargazers_count,
      pushed_at: repo.pushed_at,
    });
    rememberCandidate(known, repo.full_name, url);
  }

  for (const c of found) console.log(`+ ${c.repo}: ${c.name ?? '?'} ${c.url ?? ''}`);
  const pruned = pending.length !== file.candidates.length;
  if (found.length === 0 && !pruned) {
    console.log(`No new candidates; ${outPath} left untouched.`);
    return;
  }

  const candidates = [...pending, ...found];
  fs.writeFileSync(
    outPath,
    `${JSON.stringify({ candidates, rejected: file.rejected }, null, 2)}\n`,
  );
  console.log(`Wrote ${candidates.length} candidates (${found.length} new) to ${outPath}.`);

  if (found.length > 0 && process.env.GITHUB_ACTIONS === 'true') {
    upsertIssue(
      issueRepo,
      buildIssueBody(issueRepo, candidates, new Set(found.map((c) => c.repo))),
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
