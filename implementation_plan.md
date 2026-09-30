# Implementation Plan - Phase 2: MVP (Portal & Interactive Map)

Building the Phase 2 MVP for the みらい議会マップ (Unofficial Mirai Gikai Portal): Prefecture TopoJSON pipeline, interactive MapLibre choropleth map, Home page with headline metrics & ranking table, searchable Directory, About, and Submit pages.

- Status: Ready for implementation
- Target Date: 2026-10-01
- Workspace: `/Users/ken/antigravity/Mirai_gikai_map`

---

## 1. Goal & Success Criteria

### Goal
Deliver a fast, responsive, mobile-first static portal built with Astro that renders:
1. Prefecture choropleth map colored by coverage metrics (MapLibre GL JS island without tile clutter).
2. National headline metrics calculated strictly via `src/lib/metrics.ts`.
3. 47-prefecture sortable ranking table.
4. Searchable & filterable directory of all registered みらい議会 sites (`/sites`).
5. Explanatory About page (`/about`) and site registration guidelines (`/submit`).

### Success Criteria
1. **Geo Pipeline**: `public/geo/prefectures.topojson` is generated, strictly under 300 KB, contains 47 prefectures with `pref_code` and `name`.
2. **Metrics Compliance**: All coverage numbers and rankings are sourced strictly from `src/lib/metrics.ts`. No page computes percentages or ranking logic on its own.
3. **Interactive Map Island**:
   - Rendered using MapLibre GL JS over a clean blank canvas (no commercial basemap tiles).
   - Choropleth colored using sequential color ramp (distinct neutral gray `#e2e8f0`/`#334155` for 0% coverage).
   - Toggle between **人口カバー率** (default) and **自治体数カバー率**.
   - Hover popup/tooltip shows prefecture name, rank, population %, and municipal coverage count.
   - Quick jump buttons for remote islands (沖縄, 小笠原).
4. **Ranking Table**:
   - Lists all 47 prefectures with Rank, Name, Population Coverage %, Municipal Coverage (x / total, %), and Prefectural Assembly badge.
   - Interactive column sorting (sort by Rank, Population %, Municipal %).
5. **Directory (`/sites`)**:
   - Full list of all registered sites (21 sites currently in `data/sites.yaml`).
   - Client-side search by name/municipality and filter by level (`all`, `prefectural`, `municipal`) and status (`active`, `stale`, `building`).
6. **About (`/about`) & Submit (`/submit`)**:
   - `/about`: Details the exact metric formulas, citations of 総務省 2026 data, update schedules, and the unofficial disclaimer.
   - `/submit`: Documents inclusion criteria and links to the GitHub issue registration.
7. **Design & Performance**:
   - Modern, aesthetic typography and dark mode support via CSS variables.
   - Disclaimer footer with link to upstream national Diet site (`https://gikai.team-mir.ai/`) on every page.
   - All tests, linting, typechecks, and static build pass: `pnpm validate && pnpm test && pnpm lint && pnpm typecheck && pnpm build`.

---

## 2. Target Files

| File | Purpose |
| --- | --- |
| `scripts/build-geo.ts` | Geo pipeline script that generates/optimizes `public/geo/prefectures.topojson` (<300 KB) |
| `public/geo/prefectures.topojson` | Optimized prefecture boundaries for MapLibre rendering |
| `src/layouts/Layout.astro` | Base layout with header navigation, responsive shell, dark mode support, and disclaimer footer |
| `src/components/Map.astro` | MapLibre GL JS client island component for the choropleth map |
| `src/components/RankingTable.astro` | Sortable 47-prefecture ranking table |
| `src/components/MetricCards.astro` | Headline national metrics cards |
| `src/pages/index.astro` | Home page integrating headline metrics, choropleth map, ranking table, and recent sites |
| `src/pages/sites.astro` | Searchable and filterable directory of all registered instances |
| `src/pages/about.astro` | Methodology, data citations, formulas, and portal background |
| `src/pages/submit.astro` | Inclusion criteria and submission guide |
| `package.json` | Add `build:geo` script if applicable |

---

## 3. Step-by-Step Implementation

### Step 1: Prefecture Geo Pipeline (`scripts/build-geo.ts`)
- Implement a script to produce `public/geo/prefectures.topojson`.
- Extract/derive prefecture boundaries from verified open data (N03 or simplified Japan TopoJSON).
- Keep properties strictly to `pref_code` ("01".."47"), `code5` ("01000".."47000"), and `name` ("北海道".."沖縄県").
- Ensure output file size is strictly < 300 KB.
- Add `"build:geo": "tsx scripts/build-geo.ts"` to `package.json`.

### Step 2: Global Layout & Aesthetic Design System (`src/layouts/Layout.astro`)
- Set up a clean civic-tech design system:
  - Curated color tokens (avoiding upstream `#2aa693` per PLAN.md design notes).
  - Dark mode support via CSS custom properties and `prefers-color-scheme`.
  - Accessible contrast ratios (WCAG 2.2 AA compliant).
- Header with branding:
  - Title: **みらい議会マップ** with "（非公式）" subtitle/badge.
  - Navigation: ホーム (`/`), 掲載一覧 (`/sites`), このサイトについて (`/about`), 登録申請 (`/submit`).
- Footer with mandatory disclaimer:
  - Unofficial project statement.
  - Link to national Diet site: `https://gikai.team-mir.ai/`.
  - Link to GitHub repository.

### Step 3: Interactive Map Island (`src/components/Map.astro`)
- Use MapLibre GL JS (already installed).
- Configure a blank, tile-free canvas with Japan bounding box `[[127.0, 26.0], [146.0, 46.0]]`.
- Add remote island quick jump buttons:
  - "全国" (reset bounds)
  - "沖縄" (zoom to Okinawa)
  - "小笠原" (zoom to Ogasawara)
- Load `public/geo/prefectures.topojson`, convert via `topojson-client`.
- Join metrics computed by `src/lib/metrics.ts` at build time (passed as props or JSON island).
- Choropleth color ramp:
  - 0% coverage: neutral light gray (`#e2e8f0` light / `#334155` dark).
  - >0% coverage: smooth gradient scale based on active metric.
- Metric toggle control (人口カバー率 / 自治体数カバー率).
- Interactive tooltip on hover showing prefecture details and rank.

### Step 4: Home Page Headline Metrics & Ranking Table
- `src/components/MetricCards.astro`:
  - Municipal coverage: `18 / 1,741 (1.0%)`
  - Population coverage: `9,774,588 / 123,767,642 (7.9%)`
  - Prefectural assemblies: `3 / 47`
- `src/components/RankingTable.astro`:
  - 47 rows generated by `calculatePrefectureMetrics(sites, municipalities)`.
  - Columns: 順位, 都道府県, 人口カバー率, 自治体数カバー率 (covered/total), 都道府県議会 (あり/なし badge).
  - Lightweight client-side sorting when column headers are clicked.
- Recent additions section on `src/pages/index.astro`:
  - Cards displaying the 5 most recently added sites from `data/sites.yaml`.

### Step 5: Directory Page (`src/pages/sites.astro`)
- Load all sites with `loadSites('data/sites.yaml')`.
- Search input for real-time name/municipality text matching.
- Filter buttons:
  - Assembly Level: すべて, 都道府県議会, 市区町村議会
  - Status: すべて, 稼働中 (active), 更新停止 (stale), 準備中 (building)
- Render site cards:
  - Assembly name & badge.
  - Site URL (with external link icon).
  - Repository link (if available).
  - Operator info (including X link if `operatorX` is present).
  - Status badge with semantic colors.

### Step 6: About & Submit Pages (`src/pages/about.astro`, `src/pages/submit.astro`)
- `src/pages/about.astro`:
  - Exact metric definitions from PLAN.md §4 (Municipal coverage formula, Population coverage formula, Prefectural badge rule).
  - Data sources and reference dates (総務省住民基本台帳人口 令和8年1月1日, 全国地方公共団体コード 令和6年1月1日).
  - Technical architecture (Astro static generation, MapLibre GL JS, automated daily health checks).
- `src/pages/submit.astro`:
  - Listing criteria from PLAN.md §9.
  - Link to GitHub Issue template / submission workflow.

### Step 7: Build & End-to-End Verification
- Run full suite:
  - `pnpm validate`
  - `pnpm test`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`
- Verify static output in `dist/`.

---

## 4. Verification Plan

### Automated Checks
- `pnpm validate`: 100% pass on schema & municipality integrity.
- `pnpm test`: All unit tests pass.
- `pnpm lint`: Biome check passes with 0 errors.
- `pnpm typecheck`: Astro check & tsc pass with 0 errors.
- `pnpm build`: Astro static build completes with all routes generated (`/`, `/sites`, `/about`, `/submit`).

### Manual / Browser Checks
- Inspect the rendered Home page:
  - Map renders without errors and updates colors when toggling metrics.
  - Tooltip displays accurate population and municipal percentages matching `metrics.ts`.
  - Ranking table sorts accurately.
- Inspect `/sites`:
  - Search filter dynamically filters the list of 21 sites.
- Mobile responsiveness: Check viewports at 375px, 768px, and 1200px.

---

## Changes from Plan

Recorded during implementation on 2026-10-01.

1. **Geo source: 地球地図日本 via dataofjapan/land, not N03.** Step 1 allowed "N03 or simplified Japan TopoJSON". The N03 2026 national archive is about 800 MB and would need a dissolve step just to get prefecture outlines, which have not changed. `scripts/build-geo.ts` downloads `japan.topojson` from dataofjapan/land at a pinned commit (`01d9c03b…`) into `data/raw/` (gitignored), dissolves by prefecture, simplifies it (visvalingam weighted, keep-shapes, 40%), and writes 231.7 KB. Names come from the `kind=prefecture` rows in `data/municipalities.csv`, not from the source file. The script refuses to write unless there are exactly 47 features with unique codes "01".."47", `code5` equal to `pref_code + "000"`, only the three allowed properties, names matching the master list, and a size under 300,000 bytes. 地球地図日本 requires attribution. It is shown in the footer, on `/about`, in the map's attribution control, and in `data/raw/README.md`. Municipality boundaries for Phase 3 will still need N03.
2. **New dev dependencies: `mapshaper` and `@types/topojson-specification`.** mapshaper runs the dissolve and simplification through its JS API. It has no typings, so `scripts/mapshaper.d.ts` declares the one function the script uses. `@types/topojson-specification` was only a transitive dependency and could not be imported under pnpm's strict layout; the map island uses its `Topology` types.
3. **Additional files not listed in the plan:**
   - `src/lib/site.ts`: shared URLs (repo `https://github.com/OchiK/mirai-gikai-map`, taken from `git remote`; the issue form URL; the upstream Diet site; data attribution links) and the Japanese labels for status and level. It contains no coverage math.
   - `src/components/SiteCard.astro`: one site card, used by the home page's recent-sites section and by `/sites`.
   - `scripts/mapshaper.d.ts` (see item 2).
   - `data/raw/README.md` (modified): documents the geo source file, its pinned URL, and the attribution requirement.
4. **`CLAUDE.md` now names `scripts/build-geo.ts`.** It previously named `scripts/build-geo.sh` (from PLAN.md §6), which the plan replaces with a TypeScript script.
5. **Metrics are formatted on the server.** The home page, cards, table, and map tooltip get every percentage and count string from `formatPercent` and `formatPopulation` in `src/lib/metrics.ts` at build time. On the client, the map only turns the raw rate into a color, and the table only sorts rows by the rate and rank values that `metrics.ts` produced, stored in `data-*` attributes. The legend thresholds are fixed color stops, formatted with `formatPercent`.
6. **Map details the plan did not specify:**
   - Color ramp: amber → orange → magenta → purple, a plasma-inspired ramp that avoids `#2aa693`. It has not yet been checked in a color-blindness simulator, as PLAN.md §8 asks. Stops are 0/5/10/20/40% for population and 0/2/5/10/20% for the municipal count. 0% uses the plan's neutral gray (`#e2e8f0` light, `#334155` dark), switched through `matchMedia` because MapLibre cannot read CSS variables.
   - Cooperative gestures are on (ctrl or two fingers to zoom), so the map does not trap page scrolling on phones.
   - Tapping a prefecture shows the same tooltip as hovering. Prefecture pages belong to Phase 3.
7. **Mobile ranking table.** Below 640 px it shows only rank, name, and population coverage, per PLAN.md §8. The municipal-coverage and prefectural-assembly columns are hidden at that width.
8. **Recent sites tie-break.** All 21 entries share `added_on: 2026-09-30`. Sites are sorted by `added_on` descending; for equal dates, entries later in `sites.yaml` count as newer.
9. **Wording on `/about`.** Daily health checks are described as in preparation (準備中), not running, because the health-check workflow is Phase 4 and does not exist yet.
10. **Directory status filter.** Filter buttons are すべて, 稼働中, 更新停止, and 準備中, as the plan lists. `dead` sites (none exist today) appear under すべて with a 停止 badge, but they have no filter button of their own.
11. **Bundle size.** `astro build` warns that the map chunk is 1.06 MB (286 KB gzipped); nearly all of it is MapLibre GL JS. It is a deferred module script and does not block the first render. It has not been code-split, and the Phase 2 goal of loading in under 2 seconds on 4G has not been measured.
12. **Coverage eligibility for topic-limited sites.** Registry entries now accept `counts_for_coverage: false` for sites limited to a committee, budget, or other topic. They remain visible in the directory but are excluded from all coverage metrics. The field defaults to `true` for existing entries, requires an explanatory note when false, and is collected by the registration issue form.
