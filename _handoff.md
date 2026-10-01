# Session State: Mirai Gikai Map (みらい議会マップ)
**Date:** 2026-10-01

## 1. Objective Context
Build, verify, automate, and deploy an unofficial civic-tech portal (みらい議会マップ) tracking and visualizing the rollout of local assembly AI "みらい議会" instances across Japan. The portal covers all 47 prefectures and 1,741 municipal assemblies with population and assembly coverage calculations.

## 2. Global Rules & Mental Model
- **Astro SSG Static Architecture**: 51 pre-rendered static routes (`/`, `/sites`, `/about`, `/submit`, and 47 `/pref/[code]` pages).
- **Zero Math in Page Components**: All population coverage, municipal coverage, and ranking logic are strictly calculated inside `src/lib/metrics.ts`. Pages only consume formatted values.
- **Master Data Immutability**: Never manually edit `data/municipalities.csv` or `public/geo/*`. Always regenerate via `scripts/build-municipalities.ts`, `scripts/build-geo.ts`, and `scripts/build-municipalities-geo.ts`.
- **String Prefecture & Municipality Codes**: Nationwide municipal and prefecture codes are always 5-digit strings (`"01100"`, `"13104"`) with leading zeros preserved.
- **Dynamic Liveness**: `src/lib/data.ts` merges `data/status.json` dynamically into `SiteEntry.status` at build time without modifying `data/sites.yaml`.
- **Unofficial Disclaimer**: Keep the unofficial disclaimer in the global footer of every page, with links to the upstream national Diet site (`https://gikai.team-mir.ai/`) and data source attributions.

## 3. File Map (What Changed & Why)
- `src/pages/index.astro`: Home page with headline metrics bar, interactive MapLibre choropleth, sortable 47-prefecture ranking table, and recent additions.
- `src/pages/pref/[code].astro`: Dynamic detail route for each of the 47 prefectures featuring municipality-level MapLibre choropleth, covered/uncovered lists, and CTA.
- `src/pages/sites.astro`: Searchable and filterable directory of all 21 registered local assembly sites.
- `src/pages/about.astro` & `src/pages/submit.astro`: Methodology, data citations, inclusion criteria, and issue template submission.
- `src/components/Map.astro` & `src/components/MunicipalityMap.astro`: Client-side MapLibre GL JS islands with TopoJSON boundary rendering, cooperative gestures, island jump buttons, and dark mode support.
- `public/geo/prefectures.topojson`: Optimized national prefecture boundaries (<240 KB).
- `public/geo/municipalities/*.topojson`: 47 per-prefecture municipality boundary files with designated-city wards dissolved into parent cities.
- `scripts/healthcheck.ts` & `.github/workflows/healthcheck.yml`: Weekly site liveness and repo activity checker bot writing `data/status.json`.
- `scripts/discover.ts` & `.github/workflows/discover.yml`: Weekly fork and repository discovery crawler writing `data/candidates.json` and managing GitHub issues.
- `astro.config.mjs`, `vercel.json`, `public/robots.txt`: Production deployment config for Vercel with automatic XML sitemap (`@astrojs/sitemap`) and robots.txt.
- `README.md`, `LICENSE`, `.github/pull_request_template.md`: Open-source standards, MIT license, live CI badges, and PR guidelines.

## 4. Pending Blockers & Known Issues
- None. Full test suite (162 tests), Biome linter, TypeScript check, and static build pass cleanly with 0 errors.
- Production is live and verified on Vercel at `https://mirai-gikai-map.vercel.app/`.
- Site ownership is verified on Google Search Console with `sitemap-index.xml` active.
- Phase 5 optional extras (OGP social preview cards, public JSON API `/api/coverage.json`) remain available for future sessions if desired.

## 5. Next Step Prompt

> **Prompt for Next Agent:**
> "Read `_handoff.md` and `PLAN.md` to re-hydrate context. The core project (Phases 0 through 4) is 100% complete and deployed live at https://mirai-gikai-map.vercel.app/. If continuing, consult Section 10 of PLAN.md to implement Phase 5 optional extras (dynamic OGP image card generation for social sharing, or public JSON API endpoints at `/api/coverage.json` and `/api/sites.json`)."
