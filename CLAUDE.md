# Agent Guidelines for みらい議会マップ

## Core Rules & Constraints

- **Metrics Calculation**: All coverage math must live in `src/lib/metrics.ts`. Pages, components, and scripts must never compute percentages or ranks themselves.
- **Data Integrity**: Never edit `data/municipalities.csv` or files under `public/geo/*` by hand. Always update the generator scripts (`scripts/build-municipalities.ts` or `scripts/build-geo.ts`) and regenerate.
- **Curation Discipline**: Never add a site directly to `data/sites.yaml` from discovery script outputs (`data/candidates.json`) without explicit human confirmation.
- **Code Types**: All local government codes (全国地方公共団体コード) are strings, never numbers (e.g. `"01100"`, `"13104"`), to preserve leading zeros.
- **Unofficial Disclaimer**: Maintain the clear unofficial disclaimer in the footer of every page: this is a community-run portal and not an official product of チームみらい or any local assembly.
- **Validation**: Always run `pnpm validate` and `pnpm test` before committing.
- **Language**: Japanese for user-facing UI and content; English for code, comments, documentation, and commit messages.

## Model Routing

The main session (Opus) plans, rules, and decides; project subagents in `.claude/agents/` execute and check. The main session is pre-authorized to spawn these agents for the tasks below without asking.

| Tier | Agent | Use for | Never for |
| --- | --- | --- | --- |
| Opus | main session | Reviewing incoming plans (e.g. a Claude Code-authored plan routed through Antigravity) against `PLAN.md`/this file and recording rulings; resolving conflicting documents; metric definitions and `counts_for_coverage`; discovery triage (real site? duplicate? correct assembly?); data-edition choices; neutrality/disclaimer wording; Phase 5 design | — |
| Sonnet | `mirai-gikai-map-builder` | Carrying out an approved plan or audit-fix list; editing `src/`, `scripts/`, `tests/`, docs; Japanese UI copy inside the existing structure; changing generators and regenerating (after backup); adding human-confirmed `sites.yaml` entries; updating README/handoff/`knowledge/log.md` | Choosing between sources, verifying its own work, commits/pushes |
| Haiku | `mirai-gikai-map-checker` | The five gates, page/disclaimer/color/math greps, status-vs-sites id diff, sandboxed `healthcheck`/`discover` to `.claude/scratch/`, discovery evidence collection, timestamped backups | Any project-file edit, judging duplicates or intent |
| Opus | `mirai-gikai-map-auditor` | Fresh-context, read-only final audit of finished work against plan, rulings, this file, and source data | Fixing findings, making rulings |

Exceptions to the split:

- Discovery triage looks mechanical but is judgment (copied READMEs inherit wrong city names; most entries have `repo: ~`). Checker collects evidence → Opus proposes → a human confirms → builder adds.
- Verification is not delegated to Haiku beyond the mechanical gates; past plans needed post-review fixes.
- No agent commits or pushes. A push to `main` deploys production on Vercel; the bots also push to `main`.
- `data/raw/*` is gitignored and local-only: read-only except backups. Plain `pnpm healthcheck`/`pnpm discover` overwrite committed data and `GITHUB_ACTIONS=true` makes discover open issues — always pass a scratch output path.
- Scratch and backups live in gitignored `.claude/scratch/` (backups at `.claude/scratch/backups/<YYYYMMDD-HHMMSS>/`, never overwritten).

Pipeline for a plan → shipped change:

1. A plan arrives (often via the Antigravity `execute-plan`/`optimal-handoff` skills).
2. Opus (main session) reviews it against `PLAN.md`, this file, and the code; rules on every conflict and writes the rulings down.
3. Checker records a baseline (five gates, 51 pages, disclaimer count).
4. Builder backs up affected data/geo files, executes the plan, and stops on any ambiguity.
5. Checker reruns the gates and greps; reports PASS / FAIL / NEEDS JUDGMENT.
6. Auditor audits the diff in fresh context, most severe first.
7. Builder applies the fixes; repeat steps 5–6 until the auditor reports no critical/major findings.
8. Builder updates `knowledge/log.md`, handoff files, and README counts.
9. The user commits and pushes.
