import type { XiangqiState, Side } from './types.js';
/** Compare two complete repeated cycles; a position alone is never a check/chase verdict. */
export function repetitionResult(
  s: XiangqiState,
): { draw: boolean; loser?: Side; reason: 'perpetual-check' | 'perpetual-chase' | 'repetition' } | null {
  const key = s.positionKeys.at(-1),
    occurrences = s.positionKeys.flatMap((k, i) => (k === key ? [i] : []));
  if (occurrences.length < 3) return null;
  const start = occurrences.at(-3)!,
    end = occurrences.at(-1)!;
  const cycle = s.moves.slice(start, end);
  const checkers: Side[] = [],
    chasers: Side[] = [];
  for (const side of ['red', 'black'] as const) {
    const moves = cycle.filter((m) => m.piece.side === side);
    if (moves.length >= 2 && moves.every((m) => m.check)) {
      checkers.push(side);
      continue;
    }
    if (moves.length >= 2 && moves.every((m) => !m.check && m.chaseIds.length)) {
      const common = moves[0].chaseIds.filter((id) => moves.every((m) => m.chaseIds.includes(id)));
      if (common.length) chasers.push(side);
    }
  }
  if (checkers.length === 1) return { draw: false, loser: checkers[0], reason: 'perpetual-check' };
  if (!checkers.length && chasers.length === 1)
    return { draw: false, loser: chasers[0], reason: 'perpetual-chase' };
  return { draw: true, reason: 'repetition' };
}
