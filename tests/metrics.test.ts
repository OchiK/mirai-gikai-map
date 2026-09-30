import { describe, expect, it } from 'vitest';
import {
  type SiteEntry,
  TOTAL_MUNICIPALITIES_NATIONAL,
  computeRate,
  getCoveredAssemblyCodes,
  isCoveredStatus,
} from '../src/lib/metrics';

describe('metrics module', () => {
  it('correctly identifies covered status', () => {
    expect(isCoveredStatus('active')).toBe(true);
    expect(isCoveredStatus('stale')).toBe(true);
    expect(isCoveredStatus('dead')).toBe(false);
    expect(isCoveredStatus('building')).toBe(false);
  });

  it('computes coverage rates properly', () => {
    expect(computeRate(10, 100)).toBe(0.1);
    expect(computeRate(0, 100)).toBe(0);
    expect(computeRate(10, 0)).toBe(0);
  });

  it('aggregates unique covered assembly codes avoiding duplicate counting', () => {
    const mockSites: SiteEntry[] = [
      {
        id: 'site-1',
        assemblyCode5: '13104',
        assemblyLevel: 'municipal',
        name: 'Site 1',
        url: 'https://site1.example.com',
        repo: 'https://github.com/example/site1',
        operator: 'Operator A',
        basedOn: 'fork',
        launchedOn: '2026-06-01',
        addedOn: '2026-09-30',
        status: 'active',
      },
      {
        id: 'site-2',
        assemblyCode5: '13104', // duplicate assembly code
        assemblyLevel: 'municipal',
        name: 'Site 2',
        url: 'https://site2.example.com',
        repo: 'https://github.com/example/site2',
        operator: 'Operator B',
        basedOn: 'fork',
        launchedOn: '2026-07-01',
        addedOn: '2026-09-30',
        status: 'active',
      },
      {
        id: 'site-3',
        assemblyCode5: '14100',
        assemblyLevel: 'municipal',
        name: 'Site 3',
        url: 'https://site3.example.com',
        repo: 'https://github.com/example/site3',
        operator: 'Operator C',
        basedOn: 'fork',
        launchedOn: '2026-08-01',
        addedOn: '2026-09-30',
        status: 'dead', // dead status should not count as covered
      },
    ];

    const covered = getCoveredAssemblyCodes(mockSites);
    expect(covered.size).toBe(1);
    expect(covered.has('13104')).toBe(true);
    expect(covered.has('14100')).toBe(false);
  });

  it('defines national denominators', () => {
    expect(TOTAL_MUNICIPALITIES_NATIONAL).toBe(1741);
  });
});
