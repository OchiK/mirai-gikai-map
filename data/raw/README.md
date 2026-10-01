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
   - Edition: 2021 (令和3年1月1日), as converted to TopoJSON by smartnews-smri/japan-topography

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

## Files read by `pnpm build:geo:municipalities`
`scripts/build-municipalities-geo.ts` downloads these files automatically if they are missing:

| Local file | URL | Notes |
| --- | --- | --- |
| `municipalities/{01..47}.json` | https://raw.githubusercontent.com/smartnews-smri/japan-topography/b403e71eb97f1fdf32f63d16bd485129f703855e/data/municipality/topojson/s0010/N03-21_{pref}_210101.json | Municipality boundaries from 国土数値情報 行政区域データ (N03, 2021-01-01 edition, 国土交通省, https://nlftp.mlit.go.jp/ksj/), converted and simplified by smartnews-smri/japan-topography. The repository states that credit follows the N03 terms; attribution is shown in the site footer, on `/about`, and in the municipality map's attribution control. |

The upstream repository records 2021-09-28 as its acquisition date. The 2021 edition is used because it is the newest per-prefecture TopoJSON available from this source. The script checks that, after designated-city wards are dissolved into their parent city, the code set for each prefecture matches `data/municipalities.csv` exactly (1,741 municipalities). It drops only the four explicitly allowlisted no-code features (所属未定地 in prefectures 12, 13, 23, and 47) and the six 北方領土 villages (01695–01700), which are not in the CSV. Any additional no-code feature fails the build.

The processed boundary data may contain positional or temporal errors and omissions. It is not intended for navigation, surveying, certification, or other uses that require high accuracy. Downstream users should review the [N03 terms and applicability limits](https://nlftp.mlit.go.jp/ksj/other/agreement_02.html).
