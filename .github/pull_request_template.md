## 概要 (Overview)

<!-- この PR で何を変更したか、なぜ変更したかを簡潔に書いてください。 -->

## 変更の種類 (Type of change)

- [ ] サイト掲載 (New site registration)
- [ ] バグ修正 (Bug fix)
- [ ] ドキュメント (Documentation)
- [ ] その他・保守 (Chore)

## サイト掲載の場合 (For site registration)

<!-- サイト掲載以外の PR ではこのセクションを削除してください。 -->

- サイトURL (Site URL):
- 自治体・議会名 (Municipality name):
- 全国地方公共団体コード 5桁 (Code5):
- 運営者 (Operator):
- リポジトリ (Repository):

## チェックリスト (Checklist)

- [ ] `pnpm validate` が通る（`data/sites.yaml` を変更した場合）
- [ ] `pnpm test` が通る
- [ ] `pnpm lint` が通る
- [ ] 掲載サイトに非公式である旨の表示がある (Unofficial disclaimer is present on the site)
- [ ] `data/municipalities.csv` や `public/geo/*` を手で編集していない（生成スクリプト経由で再生成した）
