# Raw Data Sources

Downloaded government master data and raw GIS files are stored here and ignored by Git (except this README).

## Data Sources:
1. **全国地方公共団体コード (総務省)**
   - Source: 総務省
   - File: `code_master.xlsx` / `code_master.csv`
2. **住民基本台帳に基づく人口、人口動態及び世帯数 (総務省)**
   - Source: 総務省
   - Reference Date: 2026-01-01
3. **国土数値情報 行政区域データ (N03)**
   - Source: 国土交通省 国土数値情報ダウンロードサイト
   - Edition: 2026

## Files read by `pnpm build:data`
Download these into `data/raw/` (git-ignored) before running the generator:

| Local file | URL | Edition |
| --- | --- | --- |
| `code_list.xlsx` | https://www.soumu.go.jp/main_content/000925835.xlsx | 令和6年1月1日現在 (latest published; linked from https://www.soumu.go.jp/denshijiti/code.html) |
| `population.xlsx` | https://www.soumu.go.jp/main_content/000892952.xlsx | 令和8年1月1日 住民基本台帳人口 (市区町村別, 総計 incl. foreign residents) |

The population table is linked from https://www.soumu.go.jp/main_sosiki/jichi_gyousei/daityo/jinkou_jinkoudoutai-setaisuu.html.

## Files read by `pnpm build:geo`
`scripts/build-geo.ts` downloads this file automatically if it is missing:

| Local file | URL | Notes |
| --- | --- | --- |
| `japan.topojson` | https://raw.githubusercontent.com/dataofjapan/land/01d9c03b92c4b7280cefd3da6b7c76e8b7a746e5/japan.topojson | Prefecture boundaries from 地球地図日本 (GSI Global Map Japan, https://www.gsi.go.jp/kankyochiri/gm_jpn.html), converted by dataofjapan/land. Attribution to 地球地図日本 is required; it is shown in the site footer, on `/about`, and in the map's attribution control. |
