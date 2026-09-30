# みらい議会マップ（非公式）

全国の自治体で展開されている「みらい議会」インスタンスの開設状況を可視化・集約する非公式ポータルサイトです。

## 主な機能
- **全国・都道府県別カバー率マップ**: 自治体議会および人口カバー率を可視化（MapLibre GL JS）
- **都道府県ランキング & 一覧**: 各都道府県の展開状況ランキング
- **インスタンスディレクトリ**: 全国の稼働中サイト一覧・検索
- **自動ヘルスチェック & 候補発見**: サイトの生存確認および新規フォークの自動検知

## 開発環境 (Phase 0: Setup)

### 前提条件
- Node.js 20+ (推奨: Node 22+)
- pnpm 9+

### セットアップ
```bash
# 依存パッケージのインストール
pnpm install

# 開発サーバー起動
pnpm dev

# データ検証とテスト
pnpm validate
pnpm test
```

## アーキテクチャ
- **Framework**: Astro (Static Output / SSG)
- **Map**: MapLibre GL JS (TopoJSON)
- **Data**: Git-managed files (`data/sites.yaml`, `data/municipalities.csv`, etc.)
- **Hosting**: Cloudflare Pages / Vercel

## コントリビューション・運営ルール
詳細は [PLAN.md](PLAN.md) および [CLAUDE.md](CLAUDE.md) を参照してください。
