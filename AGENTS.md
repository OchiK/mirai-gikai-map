# Mirai Gikai Map: Codex project instructions

## Codex model routing

These rules apply to Codex only. Preserve CLAUDE.md and .claude/agents; their model names and Checker write exceptions do not apply to Codex.

Main Strategist: gpt-6.1-sol, medium. Planning, source conflicts, ambiguous intent, domain judgments, scope and approval gates stay here.
Builder: gpt-6.1-sol, medium. Execute a settled, user-authorized plan or named audit repairs.
Checker: gpt-5.6-luna, low, read-only. Exact mechanical evidence only; return NEEDS JUDGMENT for meaning, intent, source support, privacy, or visual decisions.
Auditor: gpt-6.1-sol, medium, read-only, fresh context. Independent final judgment; never audit its own implementation.

Use only low or medium reasoning for the main thread, custom agents, built-in and ad hoc agents. Never exceed medium. Verify model availability before spawning; stop instead of silently substituting. Set both model and effort for ad hoc spawns. No nested delegation. Keep tiny tasks in the main thread.

For substantive authorized implementation, use the project agents when useful: Strategist freezes scope, source authority, baseline and acceptance criteria; Checker gathers bounded evidence; Builder preserves affected files and implements; Checker checks stable results; fresh Auditor compares every criterion and Changes from Plan; Strategist presents acceptance evidence. Pass original sources, baseline, plan, artifacts and limitations to the Auditor without inherited Builder conversation (fork_turns="none" where supported). Approved fixes require another Builder pass and fresh audit.

Only the Builder writes authorized backups, scratch outputs, reports, logs or project files. Checker and Auditor return findings in their responses: no installs, builds, renders, preparation scripts, backups or log edits that write files. The parent or authorized Builder generates disposable evidence. Check actual inherited child permissions before delegation; stop if read-only boundaries cannot be maintained.

Shared writes, builds and dependent audits stay sequential. Parallelize only independent bounded reads against stable inputs; at most three subagents. Preserve all dirty/untracked work and synced content. Use rtk for shell commands and apply_patch for edits. Missing runtime, native rendering, source, database, CI or deployed evidence must remain explicit; a test exit does not prove those states. No global-setting changes, external messages, publication, commits or pushes without explicit authorization for that action. This routing setup alone authorizes no substantive project work.

## Project safeguards

Read CLAUDE.md, PLAN.md, the approved implementation plan and _handoff.md before substantive work. Its core project rules remain binding; Claude model routing and Checker write exceptions do not apply to Codex.
All coverage math belongs in src/lib/metrics.ts. Municipality codes remain strings. Never hand-edit data/municipalities.csv or public/geo/*: change the generator and regenerate only within authorized scope, after non-overwriting backups.
No discovery candidate becomes a data/sites.yaml entry without explicit human confirmation. Duplicate identity, assembly ownership, counts_for_coverage, neutrality and missing metadata are Strategist/human judgments. Do not infer unverifiable registry facts.
Preserve the unofficial disclaimer, Japanese public UI and existing code/documentation language rules. data/raw/* stays local-only and read-only except authorized backups.
healthcheck/discover can overwrite committed data; GITHUB_ACTIONS=true can create external issues. Run only an explicitly authorized side-effect-reviewed command with disposable scratch outputs; Checker/Auditor never run commands that write. No commits or pushes without explicit authorization; main pushes deploy production.
Builder provides pnpm validate/test and relevant gates as separate evidence, while Auditor independently checks scope, sources, metrics, generated data and rendered UI where required. Do not treat local checks as deployment proof.

Use mirai_gikai_map_builder, mirai_gikai_map_checker and mirai_gikai_map_auditor.

## Codex model ceiling

GPT-6.1 Sol is the highest permitted Codex model for this project. Use gpt-6.1-sol at medium for the main Strategist, Builder and fresh independent Auditor; use gpt-5.6-luna at low for mechanical checking. Do not select Astra or escalate to another model automatically, including built-in/ad hoc agents; obtain explicit user approval for any exception. Keep the reasoning ceiling at medium.
