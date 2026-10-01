# みらい議会マップ（非公式）

[![CI](https://github.com/OchiK/mirai-gikai-map/actions/workflows/ci.yml/badge.svg)](https://github.com/OchiK/mirai-gikai-map/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

全国の自治体議会における「みらい議会」インスタンスの開設状況を可視化・集約する非公式ポータルサイトです。

**公開サイト**: https://mirai-gikai-map.vercel.app

> [!NOTE]
> 本プロジェクトは有志が運営する非公式のポータルです。チームみらい、および各地方議会の公式サービスではなく、これらの団体とは一切関係ありません。

## 主な機能

- **全国マップ**: 都道府県ごとの議会カバー率・人口カバー率を塗り分け表示（MapLibre GL JS + TopoJSON）
- **都道府県別ページ（47ページ）**: 市区町村単位のドリルダウンマップと、その都道府県内のサイト一覧
- **サイトディレクトリ**: 登録済みの「みらい議会」サイト（現在21件）の一覧・検索
- **ランキング**: 都道府県ごとの議会カバー率・人口カバー率ランキング
- **掲載申請**: GitHub Issue テンプレートから新しいサイトの掲載を申請可能

## アーキテクチャ

| 項目 | 内容 |
| --- | --- |
| フレームワーク | Astro（静的出力 / SSG） |
| 地図 | MapLibre GL JS + TopoJSON（`public/geo/`） |
| データ | Git 管理のファイル（`data/sites.yaml`, `data/municipalities.csv`） |
| 指標計算 | `src/lib/metrics.ts` に集約（ページ・コンポーネントでは計算しない） |
| ホスティング | Vercel |
| CI | GitHub Actions（lint / typecheck / test / validate / build） |

```
data/
  sites.yaml            # 登録サイト一覧（手動キュレーション）
  municipalities.csv    # 自治体マスタ（pnpm build:data で生成、手編集禁止）
  raw/                  # 総務省・地理データの元ファイル
public/geo/             # TopoJSON（pnpm build:geo* で生成、手編集禁止）
scripts/                # データ生成・検証スクリプト
src/
  lib/                  # データ読み込み・指標計算
  components/           # 地図・ランキング・カードなど
  pages/                # トップ、/pref/[code]、/sites、/submit、/about
tests/                  # Vitest テスト
```

## 開発

### 前提条件

- Node.js 22+
- pnpm 10+

### セットアップ

```bash
pnpm install
pnpm dev
```

### コマンド一覧

| コマンド | 内容 |
| --- | --- |
| `pnpm dev` | 開発サーバーを起動 |
| `pnpm build` | 型チェック（`astro check`）と静的ビルド |
| `pnpm preview` | ビルド結果をローカルで確認 |
| `pnpm validate` | `data/sites.yaml` のスキーマと自治体コードの整合性を検証 |
| `pnpm test` | ユニットテストを実行（Vitest、128件） |
| `pnpm lint` | Biome による lint / フォーマットチェック |
| `pnpm typecheck` | `astro check` と `tsc --noEmit` |
| `pnpm build:data` | 総務省の住民基本台帳人口・全国地方公共団体コードから `data/municipalities.csv` を再生成 |
| `pnpm build:geo` | `public/geo/prefectures.topojson` を再生成 |
| `pnpm build:geo:municipalities` | `public/geo/municipalities/*.topojson` を再生成 |

元データの入手先は [data/raw/README.md](data/raw/README.md) を参照してください。

## コントリビューション

- **サイトの掲載申請**: [Issue テンプレート「サイト掲載申請」](https://github.com/OchiK/mirai-gikai-map/issues/new/choose)から申請してください。内容を確認のうえ、管理者が `data/sites.yaml` に登録します。
- **Pull Request**: PR テンプレートのチェックリストに沿って、`pnpm validate` と `pnpm test` が通ることを確認してください。
- **データの扱い**:
  - `data/municipalities.csv` と `public/geo/*` は手で編集せず、生成スクリプトを修正して再生成してください。
  - 自治体コード（全国地方公共団体コード）は常に文字列として扱います（例: `"01100"`）。

運営ルールの詳細は [PLAN.md](PLAN.md) と [CLAUDE.md](CLAUDE.md) を参照してください。

## ライセンス

ソースコードは [MIT License](LICENSE) で公開しています。

地図・統計データはそれぞれの提供元の利用条件に従います（総務省「住民基本台帳に基づく人口」「全国地方公共団体コード」、地球地図日本、国土数値情報 行政区域）。
