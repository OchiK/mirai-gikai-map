/** Shared URLs and labels for the portal UI. No coverage math lives here. */

export const SITE_TITLE = 'みらい議会マップ';
export const REPO_URL = 'https://github.com/OchiK/mirai-gikai-map';
export const REGISTER_ISSUE_URL = `${REPO_URL}/issues/new?template=register-site.yml`;
export const UPSTREAM_DIET_URL = 'https://gikai.team-mir.ai/';
export const GEO_SOURCE_URL = 'https://github.com/dataofjapan/land';
export const GLOBAL_MAP_JAPAN_URL = 'https://www.gsi.go.jp/kankyochiri/gm_jpn.html';

export const STATUS_LABELS = {
  active: '稼働中',
  stale: '更新停止',
  dead: '停止',
  building: '準備中',
} as const;

export const LEVEL_LABELS = {
  prefectural: '都道府県議会',
  municipal: '市区町村議会',
} as const;
