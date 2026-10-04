import { expect, it } from 'vitest';
import { frameStats, sameRoomSummaries } from '../client/src/lib/performance';
import type { RoomSummary } from '../shared/types';
it('reports real intervals, retains stalls and handles invalid/background samples', () => {
  expect(frameStats(Array(60).fill(1000 / 60)).fps).toBe(60);
  expect(frameStats([])).toEqual({ fps: null, p95: null });
  expect(frameStats([0, NaN, -1])).toEqual({ fps: null, p95: null });
  expect(frameStats([16, 16, 16, 100]).fps).toBe(27);
  expect(frameStats([16, 16, 16, 100]).p95).toBe(100);
});
it('deduplicates identical lobby snapshots but never hides membership, status, permission or metadata changes', () => {
  const a: RoomSummary[] = [
    {
      id: 'a',
      code: 'ABC123',
      name: 'hello',
      gameId: 'uno',
      maxPlayers: 4,
      playerCount: 2,
      status: 'waiting',
      allowSpectators: true,
    },
  ];
  expect(sameRoomSummaries(a, structuredClone(a))).toBe(true);
  for (const change of [
    { playerCount: 3 },
    { status: 'playing' as const },
    { name: 'new' },
    { allowSpectators: false },
    { code: 'XYZ123' },
    { maxPlayers: 3 },
    { gameId: 'doudizhu' as const },
    { id: 'b' },
  ])
    expect(sameRoomSummaries(a, [{ ...a[0], ...change }])).toBe(false);
  expect(sameRoomSummaries(a, [])).toBe(false);
});
