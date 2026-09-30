# みらい議会 portal: implementation plan

A static site that lists every みらい議会 instance run for a Japanese local assembly, shows how many assemblies are covered nationally and in each prefecture, and ranks prefectures on an interactive map.

Status: planning. Last updated 2026-09-30.

## 1. Scope

In scope:

- A hand-curated registry of みらい議会 sites, one entry per site, each tied to a 全国地方公共団体コード.
- Coverage metrics at the national and prefecture level (definitions in section 4).
- A choropleth map of Japan with drill-down from prefecture to municipality.
- A prefecture ranking table and a searchable directory of all sites.
- Semi-automated discovery of new sites and a daily liveness check.

Out of scope for v1:

- Anything inside the individual sites (bills, votes, session data). The forks use different schemas, and some are not forks at all.
- Accounts, comments, a database, or any server-side runtime.
- The national みらい議会 (gikai.team-mir.ai). It covers the Diet, not a local assembly, so it gets a link in the footer and nothing more.

## 2. Key decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Framework | Astro (static output) | Every page can be prebuilt from data files; the map is the only interactive island. |
| Map | MapLibre GL JS with GeoJSON layers, no basemap tiles | A blank background keeps the look clean, loads fast, and avoids tile licensing and attribution clutter. |
| Data storage | Files in the repo (CSV, YAML, JSON) | The whole dataset is a few hundred rows. Git history doubles as the audit log. |
| Primary key | 5-digit 全国地方公共団体コード | This is what N03 boundary data (`N03_007`) and population tables use. Store the 6-digit code with check digit as a secondary field. |
| Hosting | Cloudflare Pages or Vercel, free tier | Static output, rebuild on push. |
| Automation | GitHub Actions | Discovery crawl and health checks run on a schedule and commit results, which triggers a rebuild. |
| Language of the site | Japanese UI; code, comments, and docs in English | The audience is Japanese residents; contributors may use coding agents. |

## 3. Data sources

| Data | Source | Notes |
| --- | --- | --- |
| Municipality master list | 総務省「全国地方公共団体コード」 | Excel file. Also mark 政令指定都市 and their wards. |
| Boundaries | 国土数値情報 行政区域データ (N03), 2026 edition | Reference date 2026-01-01. Includes municipality names, designated-city ward names, and codes. |
| Population | 総務省「住民基本台帳に基づく人口、人口動態及び世帯数」 | Published each summer with a January 1 reference date. Use the total including foreign residents. |
| Sites | This repo's `data/sites.yaml` | Curated by hand; seeded from the list in section 12. |

Denominator: 1,718 cities, towns, and villages (792 市, 743 町, 183 村) plus the 23 特別区, for 1,741 municipal assemblies. Add the 47 prefectural assemblies as a separate count. Exclude the six 北方領土 villages, which appear in some government totals (the count becomes 1,724 with them) but have no functioning assembly.

Designated cities need care. Their administrative wards (e.g. 札幌市中央区) appear in N03 and in the code list but have no assembly. Dissolve ward polygons into the parent city, and build the ward-to-city mapping from the 総務省 code list. Do not derive it arithmetically from the codes: 横浜市 is 14100 and its wards start at 14101, but 川崎市 is 14130 and 相模原市 is 14150.

## 4. Metric definitions

Put these on the About page verbatim so the numbers can be checked.

Let an assembly be *covered* when at least one registry entry points to it with status `active` or `stale` (not `dead`, not `building`).

1. **Municipal coverage (count).** Covered municipal assemblies in the prefecture ÷ municipal assemblies in the prefecture. National: covered ÷ 1,741.
2. **Population coverage.** Sum of population of covered municipalities ÷ prefecture population. National: same over all municipalities. This is the default view for the ranking, because the count metric rewards prefectures with few municipalities (鳥取 has 19, 北海道 has 179).
3. **Prefectural assembly.** A yes/no badge per prefecture, shown alongside the rates but not mixed into them.

Tie-break the ranking by municipal coverage, then by prefecture code.

A municipality with two sites counts once. The directory still lists both.

## 5. Data model

### `data/municipalities.csv` (generated, never edited by hand)

```
code5,code6,pref_code,pref_name,name,kind,parent_code5,population,population_ref_date
13104,131041,13,東京都,新宿区,special_ward,,<number>,2026-01-01
14100,141003,14,神奈川県,横浜市,designated_city,,<number>,2026-01-01
```

`kind` is one of `prefecture`, `designated_city`, `city`, `special_ward`, `town`, `village`. Designated-city wards are not rows here; the geo build uses a separate lookup for them.

### `data/sites.yaml` (hand-curated, validated in CI)

```yaml
- id: shinjuku-ku                 # stable slug, never reused
  assembly_code5: "13104"         # municipality code, or "13000" for a prefectural assembly
  assembly_level: municipal       # municipal | prefectural
  name: みらい議会＠新宿区
  url: https://miraigikai-shinjuku-web.vercel.app/
  repo: https://github.com/OchiK/miraigikai-Shinjuku
  operator: 新宿区民A             # as displayed on the site; nothing more
  based_on: fork                  # fork | independent
  launched_on: 2026-06-01         # placeholder; best known launch date, used by the timeline slider
  added_on: 2026-09-30            # date it entered this registry
  status: active                  # active | stale | dead | building (set by health check; building is manual)
  counts_for_coverage: true       # false for committee-, budget-, or topic-only sites
  notes: ""
```

Rules enforced by `scripts/validate.ts` (Zod schema):

- `assembly_code5` exists in `municipalities.csv` (or is a valid prefecture code ending in `000` when `assembly_level: prefectural`).
- `url` is HTTPS and unique across entries.
- `id` is unique.
- `name` contains the municipality name from the master list, or the entry sets `notes` explaining why not.
- `counts_for_coverage` defaults to `true`; set it to `false` for a site limited to a committee, budget, or other topic, and explain the exclusion in `notes`.

### `data/status.json` (written by the health check bot)

```json
{ "shinjuku-ku": { "http": 200, "last_checked": "...", "last_ok": "...", "consecutive_failures": 0, "repo_pushed_at": "..." } }
```

Keep the bot's output separate from `sites.yaml` so human edits and bot commits never conflict. The build merges them.

## 6. Repository layout

```
/
├─ PLAN.md
├─ CLAUDE.md                  # short rules for coding agents (see section 11)
├─ data/
│  ├─ sites.yaml
│  ├─ status.json
│  ├─ candidates.json         # discovery output, pending human review
│  ├─ municipalities.csv      # generated
│  └─ raw/                    # downloaded source files (gitignored except a README with URLs and dates)
├─ scripts/
│  ├─ build-municipalities.ts # code list + population → municipalities.csv
│  ├─ build-geo.sh            # N03 → simplified TopoJSON via mapshaper
│  ├─ validate.ts
│  ├─ discover.ts             # GitHub crawl → candidates.json
│  └─ healthcheck.ts          # HTTP + repo activity → status.json
├─ public/geo/
│  ├─ prefectures.topojson    # target < 300 KB
│  └─ municipalities/13.topojson … 47 files, one per prefecture, loaded on demand
├─ src/
│  ├─ lib/metrics.ts          # all coverage math lives here, unit-tested
│  ├─ components/Map.ts       # MapLibre island
│  ├─ pages/index.astro
│  ├─ pages/pref/[code].astro
│  ├─ pages/sites.astro
│  ├─ pages/submit.astro
│  └─ pages/about.astro
├─ tests/
└─ .github/
   ├─ workflows/{ci,discover,healthcheck}.yml
   └─ ISSUE_TEMPLATE/register-site.yml
```

## 7. Geo pipeline

1. Download the N03 2026 GeoJSON (or shapefile) into `data/raw/`.
2. With mapshaper:
   - Dissolve designated-city wards into their parent city using the lookup table.
   - Dissolve everything into 47 prefecture polygons for `prefectures.topojson`.
   - Split municipalities by prefecture code into 47 files.
   - Simplify with `-simplify visvalingam weighted keep-shapes`, tuning the percentage until the national file is under 300 KB and the largest prefecture file (北海道) is under about 1 MB. Check that shared borders stay gap-free; TopoJSON's shared arcs handle this if you simplify after converting.
   - Keep only `code5` and `name` as properties. All other attributes join at runtime from the build's JSON.
3. Commit the output files. The pipeline runs only when a new N03 edition comes out, roughly yearly.

Remote islands: MapLibre uses a real projection, so 沖縄 and 小笠原 sit far from Honshu. Instead of insets, add jump buttons (沖縄, 小笠原, 北方) next to the map and set the initial bounds to the main islands plus 沖縄本島.

## 8. Pages and UI

**Home**

- Headline numbers: municipal assemblies covered (x / 1,741, with %), share of population covered, prefectural assemblies covered (y / 47).
- Map colored by the selected metric, with a toggle between population coverage and municipal coverage. Tap or click a prefecture to open its page.
- Ranking table of 47 prefectures: rank, name, population coverage, municipal coverage (x / n), prefectural-assembly badge. Sortable by each column.
- Recently added sites (last five).

**Prefecture page (`/pref/13`)**

- The prefecture's numbers and rank.
- Municipality-level map: covered municipalities filled, uncovered ones outlined. Tap a municipality to see its sites.
- List of covered municipalities with links, then a collapsed list of uncovered ones with a "start one here" link to the fork guidelines and the registration form.

**Directory (`/sites`)**

- All entries, filterable by prefecture and status, searchable by name.

**Submit (`/submit`)**

- Explains inclusion criteria and links to the GitHub issue form.

**About**

- Metric definitions (section 4), data sources and reference dates, update schedule, unofficial disclaimer, repository link.

Design notes:

- Sequential color scale for coverage, with a distinct neutral gray for 0% so "none yet" reads differently from "low." Check the palette in a color-blindness simulator.
- Do not use the upstream primary color `#2aa693` or its gradient. The fork guidelines ask forks to avoid it, and a portal using it would look like an official product.
- Dark mode via CSS variables. Mobile first: the map takes the full width, and the ranking table collapses to name, one metric, and rank.
- The timeline slider (section 10, phase 5) needs `launched_on` for every entry, so collect it from the start.

## 9. Discovery, registration, and health checks

### Discovery (`discover.yml`, weekly)

1. List forks of `team-mirai/mirai-gikai` through the GitHub REST API, paginating and recursing into forks of forks.
2. Run a repository search for `みらい議会` in name, description, and README to catch independent builds and repos that renamed themselves.
3. For each repo, extract candidate site URLs from the `homepage` field and the README, and a candidate assembly name from the pattern `みらい議会[＠@](.+?)(版)?` in the title.
4. Drop anything already in `sites.yaml` or already rejected (keep a `rejected` list in `candidates.json` so they don't resurface).
5. Write new candidates to `candidates.json` and open or update a single GitHub issue listing them.

Nothing enters the registry automatically. Many forks are unfinished experiments, some repos serve several assemblies from separate branches, and some README "about" links point at a different city than the repo name suggests. A person confirms the URL loads, the assembly is correct, and the site shows the unofficial disclaimer.

### Registration

A GitHub issue form asks for site URL, repository URL, assembly (prefecture + municipality), operator display name, and launch date. A maintainer turns it into a `sites.yaml` entry through a PR; CI validation catches code and URL mistakes. Consider a small Action later that drafts the PR from the issue.

Inclusion criteria, stated on `/submit`:

- The site covers one local assembly in Japan (prefectural or municipal).
- It is based on or clearly modeled on みらい議会, and says it is unofficial.
- It is publicly reachable and shows real assembly content, not seed data.

### Health check (`healthcheck.yml`, daily at 06:00 JST)

- HTTP GET each `url` with a 15-second timeout and a descriptive User-Agent; follow redirects.
- Fetch `pushed_at` for each `repo` through the GitHub API.
- Status rules:
  - `dead`: 7 or more consecutive failed checks.
  - `stale`: the site loads but the repo has had no push in 120 days. This is a proxy for "no longer updated"; parsing each site's latest session is not feasible across different forks.
  - `active`: otherwise.
- Commit `status.json` only when something changed, so the history stays readable and rebuilds stay rare.

## 10. Phases

Each phase ends with something deployable.

**Phase 0: Setup (half a day)**
Astro project, Biome or ESLint + Prettier, Vitest, CI running lint, type-check, test, and validate. Deploy an empty page. Done when a PR shows a preview URL.

**Phase 1: Data foundation (1–2 days)**
`build-municipalities.ts`, `validate.ts`, `metrics.ts` with unit tests (include edge cases: two sites for one city, a prefectural-assembly site, a dead site, a prefecture with zero coverage). Seed `sites.yaml` with the list in section 12 after verifying each entry. Done when `pnpm build:data` prints national and per-prefecture numbers that match a hand check for three prefectures.

**Phase 2: MVP (a weekend)**
Prefecture TopoJSON, home page map colored by population coverage, ranking table, directory, About page. Done when the site is public at its final domain and loads under 2 seconds on a mid-range phone over 4G.

**Phase 3: Municipality drill-down (about a week)**
Per-prefecture TopoJSON with designated-city dissolve, prefecture pages, metric toggle, island jump buttons. Done when every prefecture page renders and the municipality counts on the map match `municipalities.csv`.

**Phase 4: Automation (2–3 days)**
Health check workflow, discovery workflow, issue form. Done when a test site added to the registry turns `dead` after being taken down for a week, and a new fork appears in the discovery issue.

**Phase 5: Extras (optional)**
Timeline slider driven by `launched_on`. Per-prefecture OGP images generated at build time for sharing. A small JSON API (`/api/coverage.json`, `/api/sites.json`) so others can reuse the data. A badge site operators can embed ("掲載中").

## 11. Notes for coding agents (copy into CLAUDE.md)

- All coverage math goes in `src/lib/metrics.ts`; pages never compute percentages themselves.
- Never edit `data/municipalities.csv` or `public/geo/*` by hand. Change the script and regenerate.
- Never add a site to `sites.yaml` from discovery output without a human confirming it.
- Codes are strings, not numbers, so leading zeros survive (`"01100"`).
- Keep the unofficial disclaimer in the footer of every page.
- Run `pnpm validate && pnpm test` before every commit.

## 12. Seed list (verify each before adding)

Found through a GitHub search on 2026-09-30. Status, URL, and assembly still need confirming.

| Assembly | Repo | Site URL (if known) | Note |
| --- | --- | --- | --- |
| 新宿区 | OchiK/miraigikai-Shinjuku | miraigikai-shinjuku-web.vercel.app | |
| 世田谷区 | ogukazu7627-sys/setagaya-mirai-gikai | setagaya-mirai-gikai-web.vercel.app | |
| 大田区 | masao-kunii/mirai-gikai-ota | unknown | Repo "about" points to the national site; find the real URL. |
| 川崎市 | GondoTakashi/mirai-gikai-kawasaki | mirai-gikai-kawasaki-web.vercel.app | Referenced as the base schema for other local forks. |
| 福岡県 (prefectural) | bakumon1107/mirai-gikai-fukuoka-pref | mirai-gikai-fukuoka-pref-web.vercel.app | |
| 福岡市 | bakumon1107/mirai-gikai-fukuoka-city | unknown | Repo "about" shows the 川崎 URL; confirm. |
| 安芸高田市 | bakumon1107/mirai-gikai-akitakata-city | mirai-gikai-akitakata-city-web.vercel.app | |
| 沼津市 | seiichi3141/numazugikai | unknown | Same repo is building a 静岡県 version on a separate branch. |
| 田川市 | Suuuisui/mirai-gikai-tagawa | unknown | Has daily automated ingestion. |
| 札幌市 | s-takahashi-hokkaido/mirai-gikai-hokkaido | unknown | Repo aims to cover other 北海道 municipalities later. |
| 遠賀町 | Onga-Mirai-Tech/Onga-Mirai-Gikai | not yet public | Independent static build, early phase; register as `building`. |

The upstream repo had 56 forks at the time of writing, so expect the first discovery run to turn up more.

## 13. Risks and open questions

- **Name and relationship with チームみらい.** The fork guidelines govern forks, not a portal, but a portal that uses "みらい議会" in its own name could still be read as official. Before launch, decide on a name (for example 「みらい議会マップ（非公式）」 or a name without みらい議会) and consider contacting チームみらい; they may welcome it, link to it, or already plan something similar.
- **Political neutrality.** The portal lists sites built on one party's software. Keep the copy descriptive, list every qualifying site regardless of who runs it, and publish the inclusion criteria.
- **Stale counts.** Coverage is only as good as the health check. The `stale` rule is a proxy; revisit it once there are enough sites to see real patterns.
- **Municipal mergers.** None since 2014, but if one happens, the code list and N03 change together. Re-run both pipelines and remap any affected `assembly_code5`.
- **Operator privacy.** Store only the name each operator already shows publicly. Remove an entry promptly on request.
- **Open question:** should sites covering a single committee or a single topic (for example, only the budget) count toward coverage? Suggested answer for v1: list them in the directory but count only sites covering the assembly's bills in general.
