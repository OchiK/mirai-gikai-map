import { describe, expect, it } from 'vitest';
import { dissolveByCode5 } from '../scripts/build-municipalities-geo';

const ward = (name: string, code5: string, arcs: number[]) => ({
  type: 'Polygon' as const,
  arcs: [arcs],
  properties: {
    N03_001: '神奈川県',
    N03_002: null,
    N03_003: '横浜市',
    N03_004: name,
    N03_007: code5,
  },
});

const adjacentWards = () => ({
  type: 'Topology' as const,
  objects: {
    source: {
      type: 'GeometryCollection' as const,
      geometries: [ward('青葉区', '14117', [0, 1, 2, 3]), ward('緑区', '14113', [4, 5, 6, -2])],
    },
  },
  // Two adjacent squares. Arc 1 is their shared ward boundary; -2 is its reverse.
  arcs: [
    [
      [0, 0],
      [1, 0],
    ],
    [
      [1, 0],
      [1, 1],
    ],
    [
      [1, 1],
      [0, 1],
    ],
    [
      [0, 1],
      [0, 0],
    ],
    [
      [1, 0],
      [2, 0],
    ],
    [
      [2, 0],
      [2, 1],
    ],
    [
      [2, 1],
      [1, 1],
    ],
  ],
});

const arcIndexes = (value: unknown): number[] => {
  if (typeof value === 'number') return [value < 0 ? ~value : value];
  return Array.isArray(value) ? value.flatMap(arcIndexes) : [];
};

describe('dissolveByCode5', () => {
  it('merges adjacent designated-city wards and removes their shared boundary', () => {
    const usedParents = new Set<string>();
    const result = JSON.parse(
      dissolveByCode5(
        '14',
        JSON.stringify(adjacentWards()),
        new Map([['横浜市', '14100']]),
        usedParents,
      ),
    );
    const geometries = result.objects.municipalities.geometries;

    expect(geometries).toHaveLength(1);
    expect(geometries[0].properties).toEqual({ code5: '14100' });
    expect(usedParents).toEqual(new Set(['14100']));
    expect(arcIndexes(geometries[0].arcs)).not.toContain(1);
    expect(new Set(arcIndexes(geometries[0].arcs))).toEqual(new Set([0, 2, 3, 4, 5, 6]));
  });

  it('rejects an unexpected feature without N03_007', () => {
    const source = adjacentWards();
    source.objects.source.geometries[0].properties.N03_007 = null as unknown as string;

    expect(() =>
      dissolveByCode5('14', JSON.stringify(source), new Map([['横浜市', '14100']]), new Set()),
    ).toThrow('14: unexpected features without N03_007');
  });

  it("accepts only the pinned source's explicit unassigned-area record", () => {
    const source = adjacentWards();
    const unassigned = {
      type: 'Polygon',
      arcs: [[0, 1, 2, 3]],
      properties: {
        N03_001: '千葉県',
        N03_002: null,
        N03_003: null,
        N03_004: '不明',
        N03_007: null,
      },
    } as unknown as (typeof source.objects.source.geometries)[number];
    source.objects.source.geometries.push(unassigned);

    expect(() =>
      dissolveByCode5('12', JSON.stringify(source), new Map([['横浜市', '14100']]), new Set()),
    ).toThrow('12: unexpected features without N03_007');

    unassigned.properties.N03_004 = '所属未定地';

    expect(() =>
      dissolveByCode5('12', JSON.stringify(source), new Map([['横浜市', '14100']]), new Set()),
    ).not.toThrow();
  });
});
