/** Shared URLs and labels for the portal UI. No coverage math lives here. */

export const SITE_TITLE = 'みらい議会マップ';
export const REPO_URL = 'https://github.com/OchiK/mirai-gikai-map';
export const REGISTER_ISSUE_URL = `${REPO_URL}/issues/new?template=register-site.yml`;
export const UPSTREAM_DIET_URL = 'https://gikai.team-mir.ai/';
export const UPSTREAM_REPO_URL = 'https://github.com/team-mirai/mirai-gikai';
export const N03_URL = 'https://nlftp.mlit.go.jp/ksj/';
export const N03_TERMS_URL = 'https://nlftp.mlit.go.jp/ksj/other/agreement_02.html';
export const MUNICIPALITY_GEO_SOURCE_URL = 'https://github.com/smartnews-smri/japan-topography';
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

type Bounds = [[number, number], [number, number]];

/**
 * Jump buttons for prefectures whose islands sit far from the main territory.
 * The first view is the initial map view; a "全域" button is always added.
 */
export const ISLAND_VIEWS: Record<string, { label: string; bounds: Bounds }[]> = {
  '13': [
    {
      label: '本土',
      bounds: [
        [138.9, 35.48],
        [139.95, 35.9],
      ],
    },
    {
      label: '伊豆諸島',
      bounds: [
        [139.05, 32.4],
        [140.0, 34.85],
      ],
    },
    {
      label: '小笠原',
      bounds: [
        [141.1, 26.5],
        [142.35, 27.8],
      ],
    },
  ],
  '47': [
    {
      label: '本島',
      bounds: [
        [126.6, 25.9],
        [128.4, 27.1],
      ],
    },
    {
      label: '先島',
      bounds: [
        [122.9, 24.0],
        [125.5, 25.0],
      ],
    },
  ],
};
