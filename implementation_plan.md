# Implementation Plan - Fix Vercel Deployment Secondary Rate Limit & Suppress Discovery Builds

**Target:** Resolve Vercel production deployment failure at commit `18ac5c3` and prevent recurrence by suppressing Vercel builds on automated candidate discovery commits.  
**Path:** `/Users/ken/antigravity/Mirai_gikai_map/implementation_plan.md`  
**Date:** 2026-10-11  

---

## 1. Problem Assessment & Root Cause Analysis

### Incident Summary
- **Commit:** `18ac5c3` on branch `main` (`chore(discovery): record new site candidates`, committed by `github-actions[bot]`).
- **Failure:** Production deployment failed on Vercel with:
  ```text
  Git provider error
  GitHub fetch error - status: 403, message: {
    "documentation_url": "https://docs.github.com/free-pro-team@latest/rest/overview/rate-limits-for-the-rest-api#about-secondary-rate-limits",
    "message": "You have exceeded a secondary rate limit. Please wait a few minutes before you try again. For more on scraping GitHub and how it may affect your rights, please review our Terms of Service (https://docs.github.com/en/site-policy/github-terms/github-terms-of-service) If you reach out to GitHub Support for help, please include the request ID 6E12:1E7F10:11DC13F:14E8025:6ACA8D7A."
  }
  ```

### Root Cause
1. **Transient GitHub Rate Limit:** The weekly discovery workflow (`discover.yml`) runs extensive GitHub API requests (fork traversal and search queries) using `GITHUB_TOKEN`. Upon completing, it commits new candidate records in `data/candidates.json` and pushes directly to `main`.
2. **Immediate Webhook & API Fetch Contention:** Vercel received the webhook push event for `18ac5c3` and immediately invoked GitHub's REST/git archive API to download the repository tree. Because of the immediate burst of requests associated with the repo/action, GitHub's secondary rate limiter throttled the fetch with HTTP 403.
3. **Unnecessary Production Deployments:** `data/candidates.json` is purely internal discovery staging data for human triage; it is **never** used, imported, or bundled into the static Astro application. Triggering a production Vercel build for candidate discoveries is completely redundant and repeatedly risks this rate-limit failure every weekend.

---

## 2. Proposed Changes & Scope

### Prevention: Suppress Builds on Candidate Discovery Commits
- In `.github/workflows/discover.yml`, append `[skip ci]` to the commit message:
  ```bash
  git commit -m 'chore(discovery): record new site candidates [skip ci]'
  ```
  Vercel natively honors `[skip ci]` / `[ci skip]` on production branches and skips deployment generation, saving build minutes and completely eliminating the secondary rate limit collision.
  *(Note: `healthcheck.yml` updates `data/status.json`, which does affect the site UI and only commits when status changes, so it should continue triggering deployments.)*

### Local Branch Reconcile
- Fast-forward local `main` with `origin/main` (`git pull --rebase origin main`) to pull bot commits `c510ab9` and `18ac5c3` cleanly, preserving existing unstaged changes (`CLAUDE.md`, `.gitignore`, untracked files).

### Validation & Verification
- Run full repo validation suite: `pnpm validate`, `pnpm test`, `pnpm lint`, `pnpm build`.
- Verify Astro builds 51 static pages cleanly with zero errors.

### Vercel Deployment Remediation
- Because the rate limit was temporary and `18ac5c3` contains no application code changes, either:
  1. Click **Redeploy** on the failed deployment in Vercel Dashboard (the rate limit expired immediately after), or
  2. Pushing the fix for `discover.yml` to `main` will trigger a clean, successful production deployment.

---

## 3. Target Files & Key Behaviors

| File | Changes |
| :--- | :--- |
| `.github/workflows/discover.yml` | Line 60: Change commit message to `'chore(discovery): record new site candidates [skip ci]'` |
| `data/candidates.json` | Fast-forward to latest upstream (`18ac5c3`) |

---

## 4. Execution Baseline

- **Repository Path:** `/Users/ken/antigravity/Mirai_gikai_map`
- **Branch:** `main`
- **Local Commit:** `a2fab06` (2 commits behind `origin/main`: `c510ab9`, `18ac5c3`)
- **Unstaged Changes:**
  - `modified: .gitignore` (Claude scratch ignore)
  - `modified: CLAUDE.md` (Model routing rules)
- **Untracked Files:**
  - `.claude/`
  - `.codex/`
  - `AGENTS.md`

---

## 5. Acceptance Criteria

1. `.github/workflows/discover.yml` includes `[skip ci]` in the bot commit command.
2. Local working tree fast-forwards cleanly onto `origin/main` without dropping existing uncommitted edits.
3. `pnpm validate`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` all pass with 0 errors.
4. No unexpected modifications to `src/`, `data/sites.yaml`, `data/municipalities.csv`, or `public/geo/*`.

---

## 6. Changes from Plan

1. **Reconcile method:** Plan said `git pull --rebase origin main`. Git refuses it with unstaged changes ("cannot pull with rebase: You have unstaged changes"), and stashing was out of bounds. Used `git merge --ff-only origin/main` instead. The incoming commits (`c510ab9`, `18ac5c3`) touch only `data/candidates.json`, so the result is identical to the planned rebase (linear history, no overlap with dirty files). Validated by the HEAD/status checks below.
2. **Extra check:** Also ran `pnpm typecheck` (listed in plan acceptance criterion 3, not in the task's command chain).
3. **Additional file:** `implementation_plan.md` itself (this section and Execution Evidence). It was already dirty before this run; original saved to `.claude/scratch/baseline-20261011-050507/implementation_plan.orig.md`.



---

## Execution Evidence

**Checkout / branch:** `/Users/ken/antigravity/Mirai_gikai_map`, `main`
**Starting commit:** `a2fab06027e3a3394768a33a7458b25c9a451214` (behind origin/main by `c510ab9`, `18ac5c3`)
**Ending commit:** `18ac5c3` (fast-forwarded; no new local commits)
**Baseline snapshot:** `.claude/scratch/baseline-20261011-050507/` (`dirty-before.diff`, `status-before.txt`, `implementation_plan.orig.md`). Before-state: modified `.gitignore`, `CLAUDE.md`, `implementation_plan.md`; untracked `.claude/`, `.codex/`, `AGENTS.md`.

**Task-touched files:**
- `.github/workflows/discover.yml` line 60: commit message now `'chore(discovery): record new site candidates [skip ci]'`
- `data/candidates.json`: updated only via fast-forward to upstream (not hand-edited)
- `implementation_plan.md`: this evidence

**Untouched:** `healthcheck.yml` (still `chore(status): update site health check results`, no `[skip ci]`), `src/`, `data/sites.yaml`, `data/municipalities.csv`, `data/status.json`, `public/geo/*`.

**Remaining changes (all uncommitted, nothing staged):** M `.github/workflows/discover.yml`, M `.gitignore`, M `CLAUDE.md`, M `implementation_plan.md`; untracked `.claude/`, `.codex/`, `AGENTS.md`.

**Commands and results (logs in `.claude/scratch/*.log`):**
| Command | Result |
| :-- | :-- |
| `pnpm validate` | exit 0, sites.yaml validated (21 sites) |
| `pnpm test` | exit 0, 164/164 passed |
| `pnpm lint` | exit 0, 38 files, no fixes |
| `pnpm typecheck` | exit 0, 0 errors/warnings/hints |
| `pnpm build` | exit 0, 51 page(s) built, 0 errors |

**Missing evidence / not done:**
- Not committed or pushed (no authorization). Local completion only.
- Remote delivery and deployed behavior are unverified: whether Vercel honors `[skip ci]` on the bot commit, and whether the failed `18ac5c3` deployment is redeployed, can only be confirmed after a push / in the Vercel dashboard.
- No independent review run, per instructions.
