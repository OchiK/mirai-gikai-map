import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type Candidate,
  buildIssueBody,
  buildRegistrationLink,
  collectKnownKeys,
  extractAssemblyName,
  fetchGithub,
  isKnownRepo,
  isKnownUrl,
  mentionsMiraiGikai,
  pickSiteUrl,
  pruneRegistered,
  readmeTitle,
  rememberCandidate,
} from '../scripts/discover';

afterEach(() => vi.restoreAllMocks());

const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  repo: 'someone/mirai-gikai-example',
  name: '例示市',
  url: 'https://example-gikai.vercel.app/',
  detected_at: '2026-10-01T00:00:00.000Z',
  stars: 0,
  pushed_at: '2026-09-30T00:00:00Z',
  ...overrides,
});

describe('extractAssemblyName', () => {
  it('extracts the full assembly name', () => {
    expect(extractAssemblyName('みらい議会＠神奈川県')).toBe('神奈川県');
    expect(extractAssemblyName('みらい議会@福岡県版')).toBe('福岡県');
    expect(extractAssemblyName('非公式 みらい議会＠新宿区 (fork)')).toBe('新宿区');
    expect(extractAssemblyName('みらい議会＠世田谷区 | 区議会の議案をわかりやすく')).toBe(
      '世田谷区',
    );
  });

  it('returns null without the pattern', () => {
    expect(extractAssemblyName('みらい議会')).toBeNull();
    expect(extractAssemblyName(null)).toBeNull();
  });

  it('reads the first README heading', () => {
    expect(readmeTitle('intro\n# みらい議会＠所沢市\n## sub')).toBe('みらい議会＠所沢市');
    expect(extractAssemblyName(readmeTitle('# みらい議会＠所沢市'))).toBe('所沢市');
  });
});

describe('mentionsMiraiGikai', () => {
  it('requires the literal name or upstream slug', () => {
    const repo = (full_name: string, description: string | null = null) => ({
      full_name,
      description,
    });
    expect(mentionsMiraiGikai(repo('a/mirai-gikai-kuwana'), null)).toBe(true);
    expect(mentionsMiraiGikai(repo('a/x', 'みらい議会＠桑名市'), null)).toBe(true);
    expect(mentionsMiraiGikai(repo('a/x'), '# みらい議会のフォーク')).toBe(true);
    expect(mentionsMiraiGikai(repo('a/minutes', '議会の議事録'), '未来の議会')).toBe(false);
  });
});

describe('pickSiteUrl', () => {
  const upstream = new Set(['mirai-gikai.example.org']);

  it('prefers the homepage field', () => {
    expect(pickSiteUrl('https://a.vercel.app/', 'see https://b.vercel.app', upstream)).toBe(
      'https://a.vercel.app/',
    );
  });

  it('skips code hosts and URLs inherited from the upstream README', () => {
    const readme =
      '[upstream](https://mirai-gikai.example.org/) ![b](https://img.shields.io/x) https://github.com/x/y\nSite: https://my-city.vercel.app/.';
    expect(pickSiteUrl(null, readme, upstream)).toBe('https://my-city.vercel.app/');
    expect(pickSiteUrl('https://mirai-gikai.example.org', readme, upstream)).toBe(
      'https://my-city.vercel.app/',
    );
  });

  it('stops at non-ASCII text and markdown punctuation', () => {
    expect(pickSiteUrl(null, '本番（https://my-city.vercel.app/）を参照', upstream)).toBe(
      'https://my-city.vercel.app/',
    );
    expect(pickSiteUrl(null, '**https://my-city.vercel.app/**', upstream)).toBe(
      'https://my-city.vercel.app/',
    );
  });

  it('returns null when nothing usable is found', () => {
    expect(pickSiteUrl(null, 'https://github.com/x/y', upstream)).toBeNull();
    expect(pickSiteUrl('', null, upstream)).toBeNull();
  });
});

describe('deduplication', () => {
  const sites = [
    { url: 'https://mirai-gikai-tokorozawa.vercel.app/', repo: null },
    {
      url: 'https://shinjuku.example.app/',
      repo: 'https://github.com/OchiK/miraigikai-Shinjuku',
    },
  ];
  const known = collectKnownKeys(
    sites,
    { candidates: [candidate()], rejected: ['spam/Mirai-Gikai-Test'] },
    ['team-mirai/mirai-gikai'],
  );

  it('skips repos already registered, rejected, pending, or excluded (case-insensitive)', () => {
    expect(isKnownRepo('ochik/MiraiGikai-shinjuku', known)).toBe(true);
    expect(isKnownRepo('spam/mirai-gikai-test', known)).toBe(true);
    expect(isKnownRepo('someone/mirai-gikai-example', known)).toBe(true);
    expect(isKnownRepo('team-mirai/mirai-gikai', known)).toBe(true);
    expect(isKnownRepo('new/mirai-gikai-osaka', known)).toBe(false);
  });

  it('matches registered sites by URL when sites.yaml has no repo', () => {
    expect(isKnownUrl('https://MIRAI-GIKAI-TOKOROZAWA.vercel.app', known)).toBe(true);
    expect(isKnownUrl('https://example-gikai.vercel.app', known)).toBe(true);
    expect(isKnownUrl('https://new.vercel.app/', known)).toBe(false);
    expect(isKnownUrl(null, known)).toBe(false);
  });

  it('drops pending candidates once they are registered', () => {
    const pending = [
      candidate({ repo: 'OchiK/miraigikai-Shinjuku', url: null }),
      candidate({ repo: 'x/tokorozawa', url: 'https://mirai-gikai-tokorozawa.vercel.app' }),
      candidate(),
    ];
    expect(pruneRegistered(pending, sites).map((c) => c.repo)).toEqual([
      'someone/mirai-gikai-example',
    ]);
  });

  it('deduplicates repositories and URLs added during the current run', () => {
    const current = collectKnownKeys([], { candidates: [], rejected: [] }, []);
    rememberCandidate(current, 'owner/first', 'https://shared.example/');
    expect(isKnownRepo('OWNER/FIRST', current)).toBe(true);
    expect(isKnownUrl('https://shared.example', current)).toBe(true);
  });
});

describe('GitHub requests', () => {
  it('retries transient HTTP failures', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('temporary', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const response = await fetchGithub('https://api.github.com/example', {}, 3);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries rejected requests and then returns a successful response', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('network reset'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const response = await fetchGithub('https://api.github.com/example', {}, 3);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('issue body', () => {
  it('prefills the registration form fields', () => {
    const link = new URL(buildRegistrationLink('OchiK/mirai-gikai-map', candidate()));
    expect(link.pathname).toBe('/OchiK/mirai-gikai-map/issues/new');
    expect(link.searchParams.get('template')).toBe('register-site.yml');
    expect(link.searchParams.get('site_url')).toBe('https://example-gikai.vercel.app/');
    expect(link.searchParams.get('repo_url')).toBe(
      'https://github.com/someone/mirai-gikai-example',
    );
    expect(link.searchParams.get('assembly_name')).toBe('例示市');
  });

  it('lists every candidate with a checkbox and marks new ones', () => {
    const body = buildIssueBody(
      'OchiK/mirai-gikai-map',
      [candidate(), candidate({ repo: 'b/c', name: null, url: null })],
      new Set(['b/c']),
    );
    expect(body).toContain('- [ ] [someone/mirai-gikai-example]');
    expect(body).toContain('- [ ] [b/c](https://github.com/b/c) 🆕: 議会名不明 — サイトURL不明');
  });

  it('stays under the GitHub issue body limit', () => {
    const many = Array.from({ length: 500 }, (_, i) => candidate({ repo: `owner/repo-${i}` }));
    const body = buildIssueBody('OchiK/mirai-gikai-map', many, new Set());
    expect(body.length).toBeLessThan(65_536);
    expect(body).toContain('件は `data/candidates.json` を参照してください。');
  });
});
