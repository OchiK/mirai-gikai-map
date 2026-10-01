# Implementation Plan - Phase 3: Municipality Drill-Down (`/pref/[code]`)

Building the Phase 3 Municipality Drill-Down for the みらい議会マップ (Unofficial Mirai Gikai Portal): Per-prefecture municipality TopoJSON pipeline with designated-city dissolve, dynamic prefecture detail pages (`/pref/[code].astro`), interactive municipality-level MapLibre choropleth map, covered/uncovered municipality listings with "start one here" CTA, and click-through navigation from the Home page.

- Status: Ready for implementation
- Target Date: 2026-10-01
- Workspace: `/Users/ken/antigravity/Mirai_gikai_map`

---

## 1. Goal & Success Criteria

### Goal
Implement the municipality-level drill-down experience across all 47 prefectures:
1. Generate 47 lightweight municipality boundary files (`public/geo/municipalities/{code}.topojson`) derived from verified N03 data with designated-city administrative wards dissolved into their parent city.
2. Build dynamic prefecture detail pages (`src/pages/pref/[code].astro`) showing prefecture-level metrics, national ranking, and prefectural assembly status.
3. Build an interactive municipality map island (`src/components/MunicipalityMap.astro`) where covered municipalities are filled and uncovered ones outlined, with interactive tooltips.
4. Provide structured listings of covered municipalities (with site links) and uncovered municipalities (with call-to-action to launch a fork).
5. Enable seamless click-through navigation from the national map and ranking table on the Home page.

### Success Criteria
1. **Geo Pipeline (`scripts/build-municipalities-geo.ts`)**:
   - Generates 47 files under `public/geo/municipalities/{01..47}.topojson`.
   - Each file contains only `code5` and `name` properties.
   - All 20 designated cities have their administrative wards properly dissolved into the parent city `code5`.
   - Polygons match the exact municipal assemblies in `data/municipalities.csv` for each prefecture.
   - Total file size for each prefecture is optimized (<200 KB per prefecture, with Hokkaido <1 MB).
2. **Metrics & Data Integrity**:
   - All prefecture metrics and municipality data are computed strictly via `src/lib/metrics.ts`.
   - Zero math performed in page components.
3. **Prefecture Detail Pages (`src/pages/pref/[code].astro`)**:
   - Statically pre-rendered for all 47 prefectures via `getStaticPaths()`.
   - Displays:
     - Prefecture name and national rank badge (`#X / 47`).
     - Population coverage rate (`X.X%`, `X,XXX,XXX / X,XXX,XXX 人`).
     - Municipal coverage rate (`X / XX 自治体`, `X.X%`).
     - Prefectural assembly badge (開設済 with link, or 未開設).
   - Interactive Municipality Map:
     - Canvas rendering all municipalities in the prefecture.
     - Covered municipalities filled with accent color; uncovered municipalities outlined.
     - Hover/tap tooltip showing municipality name, population, and site status.
     - Jump buttons for remote islands where applicable (e.g. Tokyo Izu/Ogasawara, Okinawa).
   - Site Directory for the Prefecture:
     - Cards for all active sites in this prefecture.
   - Uncovered Municipalities Section:
     - List of municipalities without a site.
     - "あなたの街のみらい議会を立ち上げよう" CTA linking to `/submit` with prefilled prefecture context or GitHub issue template.
4. **Home Page Click-through Integration**:
   - Clicking a prefecture polygon on the national map navigates to `/pref/{prefCode}`.
   - Clicking a prefecture name in the ranking table links to `/pref/{prefCode}`.
5. **Quality & Validation**:
   - `pnpm validate && pnpm test && pnpm lint && pnpm typecheck && pnpm build` passes with 0 errors.
   - 47 new static HTML pages generated in `dist/pref/`.

---

## 2. Target Files

| File | Purpose |
| --- | --- |
| `scripts/build-municipalities-geo.ts` | Geo pipeline script downloading N03 TopoJSON, dissolving designated-city wards, and generating 47 per-prefecture TopoJSON files |
| `public/geo/municipalities/*.topojson` | 47 per-prefecture municipality boundary files |
| `src/pages/pref/[code].astro` | Dynamic Astro route for the 47 prefecture detail pages |
| `src/components/MunicipalityMap.astro` | MapLibre GL JS client island component for municipality-level map |
| `src/components/Map.astro` | Update national map to enable click-through navigation to `/pref/[code]` |
| `src/components/RankingTable.astro` | Update ranking table to link prefecture names to `/pref/[code]` |
| `src/components/SiteCard.astro` | Add prefecture badge linking to `/pref/[code]` |
| `tests/pages.test.ts` | Tests validating all 47 prefecture routes and data consistency |
| `package.json` | Add `build:geo:municipalities` script |

---

## 3. Step-by-Step Implementation

### Step 1: Municipality Geo Pipeline (`scripts/build-municipalities-geo.ts`)
- Source: Use N03-derived TopoJSON from `smartnews-smri/japan-topography` (`data/municipality/topojson/s0010/N03-21_{pref}_210101.json`).
- Download and cache source files in `data/raw/municipalities/`.
- Designated City Dissolve:
  - Load designated-city ward mapping (from `data/raw/code_list.xlsx` sheet 2 or authoritative lookup matching `data/municipalities.csv`).
  - Remap each ward's `N03_007` to the parent designated city's 5-digit `code5` (e.g. Yokohama wards 14101-14118 -> 14100).
  - Use `mapshaper` to dissolve polygons by `code5`.
- Assign clean properties `{ code5: string, name: string }` from `data/municipalities.csv`.
- Filter out Northern Territory villages without active assemblies.
- Save optimized TopoJSON to `public/geo/municipalities/{prefCode}.topojson`.
- Add verification check: ensure every polygon's `code5` exists in `data/municipalities.csv` for that prefecture.
- Add npm script: `"build:geo:municipalities": "tsx scripts/build-municipalities-geo.ts"`.

### Step 2: Interactive Municipality Map Island (`src/components/MunicipalityMap.astro`)
- Client island powered by MapLibre GL JS:
  - Loads `/geo/municipalities/{prefCode}.topojson` on demand.
  - Automatically calculates bounding box for the prefecture and fits map view.
  - Layer styling:
    - Covered municipalities: colored with primary accent fill and subtle border.
    - Uncovered municipalities: transparent/light neutral fill with crisp border.
  - Hover & tap interaction:
    - Popup displaying: Municipality name, population, and site count / link.
  - Quick jump buttons for prefectures with distant islands (Tokyo: 本土 / 伊豆諸島 / 小笠原; Okinawa: 本島 / 先島).
  - Clean attribution and cooperative gestures.

### Step 3: Prefecture Detail Route (`src/pages/pref/[code].astro`)
- Implement `getStaticPaths()` returning all 47 prefecture codes (`01` through `47`).
- Load data using `loadMunicipalities` and `loadSites`.
- Calculate metrics via `calculatePrefectureMetrics` and extract the target prefecture's rank and stats.
- Layout:
  - Breadcrumbs: `ホーム > {prefName}`.
  - Header: Prefecture name, national rank badge, population coverage bar, and municipal coverage bar.
  - Prefectural assembly card:
    - If active: shows site title, URL, operator, and link.
    - If inactive: shows "都道府県議会版は未開設です" with CTA.
  - Municipality Map: embeds `MunicipalityMap.astro` with local coverage data.
  - Covered Municipalities list:
    - Grid of `SiteCard`s for each active site in this prefecture.
  - Uncovered Municipalities list:
    - Accordion or card listing all uncovered municipalities with populations.
    - Call to action card: "この街でみらい議会をはじめませんか？" with instructions and link to `/submit?pref={code}`.

### Step 4: Click-through Navigation from Home & Directory
- In `src/components/Map.astro`:
  - Add `click` event listener on prefecture layer: `window.location.href = '/pref/' + prefCode`.
  - Add hover cursor pointer to indicate clickability.
- In `src/components/RankingTable.astro`:
  - Turn prefecture names into clickable links to `/pref/${row.prefCode}`.
- In `src/components/SiteCard.astro` and `src/pages/sites.astro`:
  - Ensure prefecture tags link to `/pref/${site.prefCode}`.

### Step 5: End-to-End Verification & Automated Tests
- Run `tests/`: Add test cases verifying all 47 routes generate valid HTML with correct title, metrics, and DOM elements.
- Verify full suite:
  - `pnpm build:geo:municipalities`
  - `pnpm validate`
  - `pnpm test`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`
- Verify that `dist/pref/` contains 47 generated HTML files (`/pref/01/index.html` ... `/pref/47/index.html`).

---

## 4. Verification Plan

### Automated Checks
- `pnpm validate`: passes schema validation.
- `pnpm test`: all unit and page tests pass.
- `pnpm lint`: Biome passes with 0 errors.
- `pnpm typecheck`: Astro check + tsc pass with 0 errors.
- `pnpm build`: Static build completes and outputs 51 pages (4 existing + 47 prefecture pages).

### Browser / Visual Audits
- Visit `/pref/13` (Tokyo), `/pref/14` (Kanagawa), and `/pref/40` (Fukuoka):
  - Verify municipality boundaries render cleanly.
  - Verify covered municipalities (e.g. Shinjuku, Kawasaki, Fukuoka City) appear highlighted.
  - Verify clicking an uncovered municipality shows the CTA.
- Test Home page click-through:
  - Click on Tokyo on the national map -> navigates directly to `/pref/13`.
  - Click Fukuoka in the ranking table -> navigates directly to `/pref/40`.

---

## Changes from Plan

Recorded during implementation (2026-10-01).

1. **Dissolve uses `topojson-client` `mergeArcs`, not `mapshaper -dissolve`** (`scripts/build-municipalities-geo.ts`). mapshaper 0.7.71's polygon mosaic throws `Invalid node geometry` on the source file for 愛媛県 (38), with or without `-clean`/`-snap`. `mergeArcs` merges features through their shared TopoJSON arcs and works on all 47 files. mapshaper is still used to sort and re-encode the output.
2. **Ward → parent mapping uses names from `data/municipalities.csv`, not `code_list.xlsx`.** A ward feature (`N03_004` ends with 区) maps to the designated city in the same prefecture whose CSV name equals `N03_003`. This works on 2021 data even where ward codes changed later (浜松市 reorganized its wards in 2024). The script asserts that exactly 20 designated cities absorb wards.
3. **Source edition is N03 2021 (令和3年1月1日), pinned to smartnews-smri commit `b403e71e…`.** This is the plan's chosen source. Before building, the code sets were diffed in both directions: after the dissolve, every prefecture matches the CSV exactly (1,741 total). The script drops features with no `N03_007` (所属未定地; one each in 12, 13, 23, 47) and an explicit allowlist of 北方領土 villages (01695–01700). Any other unknown or missing code is a hard error.
4. **Verification is set equality, not one-way.** The plan checks polygon ⊆ CSV. The script also fails if any CSV municipality has no polygon, matching PLAN.md Phase 3's done criterion. No extra `-simplify`: the source is already simplified (largest file is 北海道 at 110.6 KB; all others are under 93 KB).
5. **New `calculatePrefectureDetail()` in `src/lib/metrics.ts`** (an extra modified file). It returns the prefecture's metrics and rank, its covered and uncovered municipalities with their sites, the covering prefectural-assembly sites, and all sites in the prefecture. The covered/uncovered split is coverage logic, so per CLAUDE.md it lives in metrics.ts rather than in the page. Unit tests are in `tests/metrics.test.ts`.
6. **Map interaction: hover tooltip plus click/tap popup.** The hover tooltip follows the existing pattern (`pointer-events: none`), so links inside it can't be clicked. Clicking or tapping a municipality therefore opens a `maplibregl.Popup` with the name, population, any registered sites (as links, with status), and the CTA link for uncovered ones. Popup content is built with DOM APIs, not HTML strings.
7. **Island views live in `ISLAND_VIEWS` in `src/lib/site.ts`** (extra modified file). 東京都: 本土 / 伊豆諸島 / 小笠原. 沖縄県: 本島 / 先島. Both also get a 全域 button. The first view is the initial view, so the mainland isn't rendered tiny next to 沖ノ鳥島, 南鳥島, or the 先島 islands. Every other prefecture fits its full bounding box.
8. **Home map click navigates instead of showing a tooltip.** The `click` handler on the national map used to show the tooltip, and that was also the mobile tap path. It now goes to `/pref/{code}`, so on touch devices a tap navigates directly and no longer shows the tooltip. Desktop hover tooltips are unchanged.
9. **SiteCard's prefecture link replaces the plain location text.** The prefecture name in each card's location line now links to `/pref/{code}`, followed by the municipality name. This covers `/sites`, the home page's recent sites, and prefecture pages. `src/pages/sites.astro` itself needed no change.
10. **Site directory section on the prefecture page lists every registered site in the prefecture**, including both assembly levels and all statuses, the same as `/sites`. The plan said "all active sites". Status badges show which sites are active, and this keeps the page consistent with the directory.
11. **`/submit` now reads `?pref=`** (extra modified file: `src/pages/submit.astro`). The CTA links to `/submit?pref={code}` as planned. `/submit` embeds a code→name map built from the CSV. With a valid `pref`, a client script shows 「対象：{都道府県}」 and adds `title=[登録申請] {都道府県}` to the GitHub issue-form link. Without the parameter the page is unchanged. The CTA card also links to the upstream repository (`team-mirai/mirai-gikai`, new `UPSTREAM_REPO_URL`) and directly to the issue form, since PLAN.md mentions a "start one here" link to the fork guidelines.
12. **N03 attribution added** (extra modified files: `src/layouts/Layout.astro`, `src/pages/about.astro`, `data/raw/README.md`, `src/lib/site.ts`). The new boundaries come from 国土数値情報 (行政区域) via smartnews-smri. That repository has no LICENSE file, and its README says credit follows the N03 terms. Credit now appears in the footer on every page, in the `/about` sources table (基準日 令和3年1月1日), and in the municipality map's attribution control. The footer and `/about` also state the upstream acquisition date (2021年9月28日), possible positional/temporal errors and omissions, unsuitable high-accuracy uses, and link to the N03 terms. `data/raw/README.md` previously said the N03 edition was 2026; it now names the 2021 edition and documents the new download and limitations.
13. **Tests don't read `dist/`.** In the plan's order `pnpm test` runs before `pnpm build`, so `tests/pages.test.ts` renders all 47 routes with the Astro Container API (`experimental_AstroContainer`). It checks the title, metrics, rank, prefectural badge, map root, CTA, and disclaimer against `calculatePrefectureMetrics`, and it checks every `public/geo/municipalities/*.topojson` for an exact code and name match with the CSV, the `code5`/`name`-only properties, and the 20 designated-city outputs. `tests/build-municipalities-geo.test.ts` exercises the dissolve algorithm with adjacent synthetic wards, verifies that the shared ward boundary is removed, and covers the strict missing-code allowlist. `tests/astro-modules.d.ts` (extra file) declares `*.astro` modules so the plain `tsc --noEmit` step can type the test's page import; `astro check` resolves real `.astro` files and ignores it.
14. **Prefecture header details.** The rank badge reads 「全国 X 位 / 47」 instead of `#X / 47`, following the Japanese-UI rule. The coverage bars are native `<meter>` elements fed directly by the metrics.ts rates, so the page does no math. The 開設済 prefectural card shows the site title (link), URL, and operator (name or X handle). The 未開設 card shows a 「{都道府県}議会版をはじめる →」 CTA to `/submit?pref={code}`.
15. **Designated-city dissolve check.** For all 20 cities, any extra polygons in the output are small detached islands or landfill that share no arcs with the main polygon, so no failed merges are hidden (広島市 has two islands touching at a single vertex).
16. **Browser/visual audit only partly done.** I tried headless Chrome (SwiftShader). The pages render, but MapLibre canvases come out blank, including the existing home-page map, so this is a screenshot limitation, not a regression. As a substitute I checked in Node that the island views contain the expected municipalities (新宿区/八王子市 → 本土, 八丈町/大島町 → 伊豆諸島, 小笠原村 → 小笠原, 那覇市 → 本島, 石垣市/宮古島市 → 先島) and that 横浜市 is one dissolved MultiPolygon. I also ran headless Chrome with console logging against `/`, `/pref/01`, `/pref/13`, `/pref/40` and `/pref/47`. The map script runs with no console errors (only SwiftShader `ReadPixels` performance notes), the `.maplibregl-canvas` and N03 attribution are in the DOM, and `/submit/?pref=13` shows the 東京都 context and the prefilled issue title. The interactive checks (hover, popup, home click-through) still need a real browser.
