import type { RoomSummary } from '../../../shared/types';
export function frameStats(intervals: number[]) {
  const valid = intervals.filter((n) => Number.isFinite(n) && n > 0);
  if (!valid.length) return { fps: null, p95: null };
  const sorted = [...valid].sort((a, b) => a - b);
  return {
    fps: Math.round((1000 * valid.length) / valid.reduce((a, b) => a + b, 0)),
    p95: Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)].toFixed(1)),
  };
}
/** Server revisions/chat/card actions do not change a room summary. Preserve its array identity. */
export function sameRoomSummaries(a: RoomSummary[], b: RoomSummary[]) {
  const keys: (keyof RoomSummary)[] = [
    'id',
    'code',
    'name',
    'gameId',
    'maxPlayers',
    'playerCount',
    'status',
    'allowSpectators',
  ];
  return a.length === b.length && a.every((room, i) => keys.every((key) => room[key] === b[i][key]));
}
