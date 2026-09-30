# Agent Guidelines for みらい議会マップ

## Core Rules & Constraints

- **Metrics Calculation**: All coverage math must live in `src/lib/metrics.ts`. Pages, components, and scripts must never compute percentages or ranks themselves.
- **Data Integrity**: Never edit `data/municipalities.csv` or files under `public/geo/*` by hand. Always update the generator scripts (`scripts/build-municipalities.ts` or `scripts/build-geo.sh`) and regenerate.
- **Curation Discipline**: Never add a site directly to `data/sites.yaml` from discovery script outputs (`data/candidates.json`) without explicit human confirmation.
- **Code Types**: All local government codes (全国地方公共団体コード) are strings, never numbers (e.g. `"01100"`, `"13104"`), to preserve leading zeros.
- **Unofficial Disclaimer**: Maintain the clear unofficial disclaimer in the footer of every page: this is a community-run portal and not an official product of チームみらい or any local assembly.
- **Validation**: Always run `pnpm validate` and `pnpm test` before committing.
- **Language**: Japanese for user-facing UI and content; English for code, comments, documentation, and commit messages.
