# Implementation Plan - Phase 4: Automation (Weekly Health Check & Discovery)

Building Phase 4 automation for the みらい議会マップ portal: A weekly automated site liveness and repo activity health checker (`scripts/healthcheck.ts` + `.github/workflows/healthcheck.yml`), a weekly GitHub fork and repository discovery crawler (`scripts/discover.ts` + `.github/workflows/discover.yml`), candidate issue management, and dynamic status merging in the site data layer.

- Status: Implemented and verified
- Target Date: 2026-10-01
- Workspace: `/Users/ken/antigravity/Mirai_gikai_map`

---

## 1. Goal & Success Criteria

### Goal
Implement automated background workflows using GitHub Actions:
1. **Weekly Health Check (`healthcheck.yml` & `scripts/healthcheck.ts`)**: Weekly bot running on schedule that performs HTTP GET checks on all registered sites, fetches GitHub repo `pushed_at` dates via the GitHub API, computes status (`active`, `stale`, `dead`), updates `data/status.json`, and commits changes to trigger a fresh production build.
2. **Weekly Discovery Crawler (`discover.yml` & `scripts/discover.ts`)**: Weekly bot that crawls forks of `team-mirai/mirai-gikai` and searches GitHub for `みらい議会`, filters out existing/rejected entries, updates `data/candidates.json`, and creates or updates a GitHub Issue with candidate checkboxes for maintainer review.
3. **Data Layer Status Merging**: Update `src/lib/data.ts` to merge `data/status.json` into `SiteEntry.status` at build time so the UI and metrics reflect dynamic liveness without modifying `data/sites.yaml`.

### Success Criteria
1. **Health Check Pipeline**:
   - `scripts/healthcheck.ts` tests all URLs in `data/sites.yaml` with a 15s timeout, descriptive User-Agent, and redirect following.
   - For sites with a `repo` URL, queries the GitHub API using `GITHUB_TOKEN` for `pushed_at`. Gracefully handles sites without repositories (e.g. GAS-hosted or closed builds).
   - Status rules:
     - `dead`: 3 or more consecutive failed checks (corresponding to ~3 weeks of continuous failure).
     - `stale`: Site responds with HTTP 200, but repo `pushed_at` is older than 120 days.
     - `active`: Site responds with HTTP 200 and either has recent repo pushes or has no known repo.
     - `building`: Preserved from `data/sites.yaml` (never overwritten).
   - Records metadata in `data/status.json`: `http`, `last_checked`, `last_ok`, `consecutive_failures`, `repo_pushed_at`, `status`.
   - Workflow `.github/workflows/healthcheck.yml` runs on weekly cron schedule (`0 21 * * 0` = Mondays 06:00 JST) and on `workflow_dispatch`.
   - Commits `data/status.json` **only when status or consecutive_failures changes** to avoid noisy empty commits.
2. **Discovery Pipeline**:
   - `scripts/discover.ts` fetches forks of `team-mirai/mirai-gikai` (paginated) and searches GitHub for repositories matching `みらい議会`.
   - Deduplication: Ignores repositories already in `data/sites.yaml` or listed in the `rejected` array of `data/candidates.json`.
   - Extracts candidate site URL (from repo `homepage` or README) and assembly name (from regex `みらい議会[＠@](.+?)(版)?`).
   - Updates `data/candidates.json` with new candidates.
   - Workflow `.github/workflows/discover.yml` runs on weekly cron schedule (`0 15 * * 6` = Sundays 00:00 JST) and on `workflow_dispatch`.
   - Opens or updates a GitHub Issue titled `[Discovery] 新規みらい議会候補の検出` listing new candidates with registration links.
3. **Build Integration**:
   - `src/lib/data.ts` loads `data/status.json` if present and overrides `SiteEntry.status` with the healthcheck status (unless `sites.yaml` status is `building`).
   - If `data/status.json` is missing (e.g. in fresh checkouts), falls back safely to `sites.yaml` status.
4. **Testing & Quality**:
   - Unit tests for health check status evaluation logic (`tests/healthcheck.test.ts`).
   - Unit tests for candidate extraction and deduplication (`tests/discover.test.ts`).
   - Full test suite passes: `pnpm validate && pnpm test && pnpm lint && pnpm typecheck && pnpm build`.

---

## 2. Target Files

| File | Purpose |
| --- | --- |
| `scripts/healthcheck.ts` | HTTP probe & GitHub API repo activity checker writing `data/status.json` |
| `scripts/discover.ts` | Fork crawler & GitHub repository search script writing `data/candidates.json` and managing GitHub issues |
| `.github/workflows/healthcheck.yml` | Weekly GitHub Actions workflow for health checks (Mondays 06:00 JST) |
| `.github/workflows/discover.yml` | Weekly GitHub Actions workflow for fork discovery (Sundays 00:00 JST) |
| `data/status.json` | Initialized status storage for health check results |
| `data/candidates.json` | Storage for discovered candidates and rejected repository list |
| `src/lib/data.ts` | Merge `data/status.json` dynamically into `loadSites` |
| `tests/healthcheck.test.ts` | Unit tests for health check status logic |
| `tests/discover.test.ts` | Unit tests for candidate discovery and regex extraction |
| `package.json` | Add `healthcheck` and `discover` npm scripts |

---

## 3. Step-by-Step Implementation

### Step 1: Status Merging in Data Layer (`src/lib/data.ts`)
- Define `StatusRecord` interface matching `data/status.json`:
  ```ts
  export interface SiteStatusRecord {
    http: number | null;
    lastChecked: string;
    lastOk: string | null;
    consecutiveFailures: number;
    repoPushedAt: string | null;
    status: SiteStatus;
  }
  ```
- In `loadSites(yamlPath: string, statusJsonPath = 'data/status.json')`:
  - Check if `statusJsonPath` exists; if so, parse JSON.
  - If a site has status `building` in `sites.yaml`, preserve `building`.
  - Otherwise, if `status.json` contains a record for `site.id`, use its computed `status`.
- Add unit test verifying that `status.json` correctly updates `site.status` and metrics calculations.

### Step 2: Implement Health Check Script (`scripts/healthcheck.ts`)
- Read `data/sites.yaml` and existing `data/status.json`.
- For each site:
  - HTTP probe: `fetch(site.url, { method: 'GET', signal: AbortSignal.timeout(15000), redirect: 'follow', headers: { 'User-Agent': 'MiraiGikaiMapBot/1.0 (+https://mirai-gikai-map-mr2w.vercel.app/)' } })`.
  - Check HTTP status: 200..399 is success; 4xx, 5xx, or network timeout/error is failure.
  - Repo probe: Parse `https://github.com/{owner}/{repo}` if `site.repo` is provided. Call `https://api.github.com/repos/{owner}/{repo}` with `Authorization: Bearer ${GITHUB_TOKEN}` to get `pushed_at`.
  - Status evaluation function `computeSiteStatus(httpOk: boolean, consecutiveFailures: number, pushedDaysAgo: number | null, currentStatus: SiteStatus): SiteStatus`.
    - If `consecutiveFailures >= 3` -> `dead`.
    - If `httpOk` and `pushedDaysAgo !== null && pushedDaysAgo > 120` -> `stale`.
    - If `httpOk` -> `active`.
- Write formatted `data/status.json`.
- Output summary report to console.
- Add npm script: `"healthcheck": "tsx scripts/healthcheck.ts"`.

### Step 3: Implement Discovery Crawler (`scripts/discover.ts`)
- Read `data/sites.yaml` and `data/candidates.json` (structure: `{ candidates: Candidate[], rejected: string[] }`).
- Collect known URLs and repo paths into a Set.
- Step A: Fetch forks of `team-mirai/mirai-gikai` via `GET /repos/team-mirai/mirai-gikai/forks?per_page=100&sort=newest`.
- Step B: Search GitHub via `GET /search/repositories?q=みらい議会&sort=updated`.
- For each repository found:
  - If in known Set or `rejected` array, skip.
  - Extract site URL from repository `homepage` field or regex in `README.md`.
  - Extract assembly name from repo name or title pattern `みらい議会[＠@](.+?)(版)?`.
  - Record candidate: `{ repo: string, name: string, url: string | null, detectedAt: string, stars: number, pushed_at: string }`.
- Write new candidates to `data/candidates.json`.
- If running in GitHub Actions with new candidates, use `gh issue` to create or append to the discovery tracking issue.
- Add npm script: `"discover": "tsx scripts/discover.ts"`.

### Step 4: GitHub Actions Workflows (`healthcheck.yml` & `discover.yml`)
- `.github/workflows/healthcheck.yml`:
  - Triggers:
    - `schedule: - cron: '0 21 * * 0'` (Weekly: Every Sunday 21:00 UTC = Monday 06:00 JST).
    - `workflow_dispatch:` (Manual trigger).
  - Steps:
    - Checkout repo with write permissions.
    - Setup Node.js & pnpm.
    - Run `pnpm healthcheck` with `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
    - Check git diff on `data/status.json`.
    - If modified, commit with `github-actions[bot]` and push to `main`.
- `.github/workflows/discover.yml`:
  - Triggers:
    - `schedule: - cron: '0 15 * * 6'` (Weekly: Every Saturday 15:00 UTC = Sunday 00:00 JST).
    - `workflow_dispatch:` (Manual trigger).
  - Steps:
    - Checkout repo.
    - Setup Node.js & pnpm.
    - Run `pnpm discover` with `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
    - If new candidates exist, commit `data/candidates.json` and create/update discovery issue.

### Step 5: Unit Tests & Verification
- `tests/healthcheck.test.ts`:
  - Test consecutive failures threshold (1..2 failures keep previous or become active; 3 failures turn `dead`).
  - Test stale threshold (>120 days turns `stale`).
  - Test `building` preservation.
  - Test sites without GitHub repos.
- `tests/discover.test.ts`:
  - Test assembly name regex extraction.
  - Test candidate deduplication against existing sites and rejected repos.
- Run full suite:
  - `pnpm validate`
  - `pnpm test`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`
- Run local simulation of `pnpm healthcheck` to verify `data/status.json` generates cleanly.

---

## 4. Verification Plan

### Automated Checks
- `pnpm test`: All unit tests pass (including new healthcheck & discovery tests).
- `pnpm lint`: Biome check passes with 0 errors.
- `pnpm typecheck`: Astro check + tsc pass with 0 errors.
- `pnpm build`: Static build passes with dynamic status merged from `data/status.json`.
- `pnpm healthcheck`: Generates a valid `data/status.json` containing entries for all 21 sites.

### Workflow File Audits
- Check YAML syntax and cron expressions:
  - `healthcheck.yml`: `0 21 * * 0` (Weekly Sunday 21:00 UTC / Monday 06:00 JST).
  - `discover.yml`: `0 15 * * 6` (Weekly Saturday 15:00 UTC / Sunday 00:00 JST).
- Verify permission settings (`contents: write`, `issues: write`).

---

## Changes from Plan

Recorded during implementation on 2026-10-01.

1. **Assembly-name regex replaced.** The plan's `みらい議会[＠@](.+?)(版)?` matches only one character (the lazy `.+?` is followed by an optional group), so "みらい議会＠神奈川県" yields "神". `scripts/discover.ts` uses `/みらい議会\s*[＠@]\s*([^\s版|｜()（）[\]【】\-–—:：、。,]+)/u` instead, applied to the repo description and then the README's first `#` heading (repo names are ASCII, so they never match). Tests assert full names.
2. **Discrepancies with PLAN.md, resolved in favor of this plan.** PLAN.md §9 specifies a *daily* health check with `dead` at 7 failures; this plan specifies weekly with `dead` at 3. Implemented as weekly/3. PLAN.md also asks the discovery crawl to recurse into forks of forks, which this plan's Step 3 omits. Recursion was implemented (max depth 3) because PLAN.md lists it and it costs only a few API calls; a sub-tree that 404s (observed live for `GondoTakashi/mirai-gikai-kawasaki`) is skipped with a warning instead of aborting the crawl.
3. **"Commit only when status or consecutive_failures changes."** `last_checked` changes on every run, so a plain `git diff` would always fire. `scripts/healthcheck.ts` compares status, consecutive_failures, and the set of site ids against the previous file and leaves `data/status.json` untouched when none changed. The workflow's `git diff --quiet` then works as intended. A consequence: `last_checked`, `http`, and `repo_pushed_at` on disk are only as fresh as the last meaningful change.
4. **`computeSiteStatus` behavior for 1–2 failures.** The plan did not say what a failed check below the threshold returns. It keeps the previous status (from `status.json`, else `sites.yaml`). `building` is checked first and always returned. Success resets `consecutive_failures` to 0; `last_ok` updates only on success; on a GitHub API failure the previous `repo_pushed_at` is kept.
5. **On-disk field naming.** `status.json` and `candidates.json` use snake_case on disk (`last_checked`, `detected_at`, `pushed_at`), matching PLAN.md §5 and the existing loader convention. `src/lib/data.ts` exports both `SiteStatusRecordRow` (disk) and the camelCase `SiteStatusRecord` from Step 1, plus `loadStatusRecords()`. The plan's candidate shape mixed `detectedAt` and `pushed_at`; it is `detected_at` throughout. `name` is `string | null` because many forks have no extractable assembly name.
6. **Search post-filter.** GitHub search tokenizes Japanese loosely; an unquoted `みらい議会` query returned 340+ unrelated repos in a live run. The query is now the quoted phrase `"みらい議会" in:name,description,readme`, and search hits (not forks) must contain `みらい議会` or `mirai-gikai`/`miraigikai` in the name, description, or README (`mentionsMiraiGikai`).
7. **Extra dedupe and URL rules.** Dedupe also covers pending candidates (so weekly runs don't append duplicates), `team-mirai/mirai-gikai`, and this portal's own repo; repos are compared as lowercase `owner/repo` and URLs as lowercase host+path without a trailing slash. Candidates that have since been registered in `sites.yaml` are pruned. Site URLs from the README skip code/doc hosts and any URL already present in the upstream README or homepage (forks that never edited the README would otherwise all point at upstream). URL extraction matches only ASCII URL characters so Japanese punctuation after a link is not captured.
8. **Issue management lives only in the script.** `discover.ts` creates or edits the issue through `gh` when `GITHUB_ACTIONS=true` and there are new candidates; the workflow sets `GH_TOKEN` and only commits `candidates.json`. The issue lists all pending candidates (new ones marked 🆕) with prefilled `register-site.yml` links using its field ids (`site_url`, `repo_url`, `assembly_name`), and is truncated with a note before GitHub's 65,536-character body limit.
9. **Output path override.** Both scripts accept an output path as the first CLI argument or via `STATUS_JSON_PATH` / `CANDIDATES_JSON_PATH`, so local simulations don't overwrite committed data. Both use the same main-guard as `scripts/validate.ts` so tests can import their pure functions without triggering network calls.
10. **Workflows.** Both workflows share a `concurrency: data-bot` group and run `git pull --rebase origin main` before pushing, so the two bots can't race each other.
11. **Additional file:** `tests/data.test.ts` covers the Step 1 merge (status override, `building` preservation, missing-file fallback, effect on `calculateNationalMetrics`) using a temp-dir fixture rather than the real `data/status.json`.
12. **Data files.** `pnpm healthcheck` was run against the default path, so `data/status.json` now holds 21 records (all HTTP 200 / `active`, 4 repo `pushed_at` dates). That matches `sites.yaml`, so metrics are unchanged. `data/candidates.json` was left empty on purpose: a local `pnpm discover` run into a scratch directory found 54 candidates (47 forks + 18 search hits after filtering; a second run made no changes), and those should arrive through the bot's issue for maintainer review.
13. **Biome formatting step in both workflows.** `JSON.stringify(x, null, 2)` expands short arrays (e.g. a non-empty `rejected` list) while Biome collapses them, which would make CI lint fail after the bot's first commit. Both workflows run `pnpm exec biome format --write <file>` before the `git diff --quiet` check.

### Post-review remediation

- A historical `building` result no longer overrides a later promotion to `active` in `sites.yaml`.
- GitHub discovery requests use a 15-second timeout, retry transient network/429/5xx failures up to three times, and skip an unreadable candidate README instead of aborting the crawl.
- `src/lib/data.ts` validates every status record before merging it into registry data.
- Repositories and site URLs discovered earlier in the same crawl are added to the deduplication sets immediately.

### Known limitations for the maintainer
- Most `sites.yaml` entries have `repo: ~`, so discovery can only match them by URL. Forks whose README links somewhere else (e.g. `Suuuisui/mirai-gikai-tagawa` vs. registered `https://tagawa-gikai.jp/`) will appear as candidates once and need to be added to `rejected` or have `repo` filled in `sites.yaml`.
- Forks that copied another fork's README inherit its assembly name (e.g. `kazowakow-jpg/moriguchi-gikai` reported as 沼津市). Human review is expected to catch this.
