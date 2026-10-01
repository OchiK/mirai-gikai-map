import fs from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadMunicipalities, loadSites } from '../src/lib/data';
import { calculatePrefectureMetrics, formatPercent, formatPopulation } from '../src/lib/metrics';
import PrefPage, { getStaticPaths } from '../src/pages/pref/[code].astro';

const municipalities = loadMunicipalities('data/municipalities.csv');
const sites = loadSites('data/sites.yaml');
const prefectures = calculatePrefectureMetrics(sites, municipalities);
// astro check types .astro imports with a `never` props signature; the container needs the factory type.
const prefPage = PrefPage as unknown as AstroComponentFactory;
const prefCodes = prefectures.map((p) => p.prefCode).sort();

interface MuniProps {
  code5: string;
  name: string;
}
type MuniTopo = Topology<{ municipalities: GeometryCollection<MuniProps> }>;
const props = (g: { properties?: unknown }) => g.properties as MuniProps;

describe('public/geo/municipalities', () => {
  it.each(prefCodes)('%s.topojson has exactly the CSV municipalities', (prefCode) => {
    const topo = JSON.parse(
      fs.readFileSync(`public/geo/municipalities/${prefCode}.topojson`, 'utf-8'),
    ) as MuniTopo;
    const geometries = topo.objects.municipalities.geometries;
    const expected = municipalities
      .filter((m) => m.prefCode === prefCode && m.kind !== 'prefecture')
      .map((m) => `${m.code5}:${m.name}`)
      .sort();

    expect(geometries.map((g) => `${props(g).code5}:${props(g).name}`).sort()).toEqual(expected);
    for (const g of geometries)
      expect(Object.keys(g.properties ?? {}).sort()).toEqual(['code5', 'name']);

    const shapes = feature(topo, topo.objects.municipalities);
    for (const f of shapes.features) {
      expect(['Polygon', 'MultiPolygon']).toContain(f.geometry?.type);
    }
  });

  it('dissolves designated-city wards into the parent city', () => {
    const designated = municipalities.filter((m) => m.kind === 'designated_city');
    expect(designated).toHaveLength(20);
    for (const city of designated) {
      const topo = JSON.parse(
        fs.readFileSync(`public/geo/municipalities/${city.prefCode}.topojson`, 'utf-8'),
      ) as MuniTopo;
      const matches = topo.objects.municipalities.geometries.filter(
        (g) => props(g).code5 === city.code5,
      );
      expect(matches, city.name).toHaveLength(1);
    }
  });
});

describe('/pref/[code] routes', () => {
  let container: AstroContainer;

  beforeAll(async () => {
    container = await AstroContainer.create();
  });

  it('generates one static path per prefecture', () => {
    const paths = getStaticPaths();
    expect(paths.map((p) => p.params.code).sort()).toEqual(prefCodes);
    expect(paths).toHaveLength(47);
  });

  it.each(prefectures.map((p) => [p.prefCode, p] as const))(
    'renders /pref/%s with metrics from metrics.ts',
    async (code, p) => {
      const html = await container.renderToString(prefPage, {
        params: { code },
      });
      expect(html).toContain(`<title>${p.prefName} | みらい議会マップ（非公式）</title>`);
      expect(html).toContain(formatPercent(p.populationCoverageRate));
      expect(html).toContain(
        `${formatPopulation(p.coveredPopulation)} / ${formatPopulation(p.totalPopulation)} 人`,
      );
      expect(html).toContain(
        `${p.coveredMunicipalitiesCount} / ${p.totalMunicipalitiesCount} 自治体`,
      );
      expect(html).toMatch(new RegExp(`全国 <strong[^>]*>${p.rank}</strong> 位 / 47`));
      expect(html).toContain(p.hasPrefecturalAssembly ? '開設済' : '未開設');
      expect(html).toContain('data-muni-map-root');
      expect(html).toContain(`/submit?pref=${code}`);
      expect(html).toContain('非公式のポータルサイト');
    },
  );
});
