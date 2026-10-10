# Knowledge Log: Mirai Gikai Map

All modifications, creations, and updates to the knowledge documents within this repository are recorded here in reverse-chronological order.

---

### [2026-10-11T05:50:00+09:00] - Add Kuwana & Tachikawa Sites, Backfill Repositories, Candidate Triage
- **Action**: Registered two new live sites (桑名市 and 立川市), bringing total to 23 sites. Backfilled verified GitHub source repositories for 5 existing sites (沼津市, 田川市, 大分市, 石垣市, 葉山町). Triaged candidate queue and rejected 5 false positives.
- **Files Modified**:
  - `data/sites.yaml`: Added `kuwana-shi` (24205) and `tachikawa-shi` (13202); updated `repo` field for 5 existing sites.
  - `data/candidates.json`: Pruned registered entries, added false positives to `rejected`.
  - `README.md`, `_handoff.md`, `knowledge/handoff.md`: Updated site count from 21 to 23.

### [2026-10-01T20:45:00+09:00] - SEO Optimization for "みらい議会 まとめ"
- **Action**: Enhanced SEO metadata, titles, descriptions, headings, structured data (Schema.org JSON-LD), and on-page directory search for "みらい議会 まとめ" queries.
- **Files Modified**:
  - `src/layouts/Layout.astro`: Updated homepage fallback `<title>` to include "まとめ", added meta `keywords`, canonical URL, full OGP and Twitter meta tags, and Schema.org `WebSite` JSON-LD with `alternateName` including "みらい議会まとめ".
  - `src/pages/index.astro`: Updated hero `<h1>` and description copy to "全国の「みらい議会」マップ・まとめ".
  - `src/pages/sites.astro`: Updated title, `<h1>`, and intro lead to "掲載一覧・まとめ", and improved on-page filter to handle generic "まとめ" search query.
  - `src/pages/about.astro`: Added "まとめ" context to description and intro copy.
  - `tests/pages.test.ts`: Added automated test suite for SEO metadata verification.

### [2026-10-01T12:55:00+09:00] - Initial Knowledge Bundle & Project Handover
- **Action**: Created in-project OKF bundle (`knowledge/`).
- **Files Added**:
  - `knowledge/handoff.md`: Snapshot of project state following completion of Phases 0 through 4 and production deployment to Vercel.
  - `knowledge/index.md`: Catalog of knowledge concepts.
  - `knowledge/log.md`: Changelog.
