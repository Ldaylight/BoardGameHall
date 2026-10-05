import type { HandRank, HoldemCard, HoldemState, HoldemView, SidePot } from './types.js';
const names = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];
export function compareRanks(a: HandRank, b: HandRank) {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < a.values.length; i++) if (a.values[i] !== b.values[i]) return a.values[i] - b.values[i];
  return 0;
}
function five(cards: HoldemCard[]): HandRank {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a),
    distinct = [...new Set(ranks)];
  const groups = [...new Set(ranks)]
    .map((rank) => ({ rank, count: ranks.filter((r) => r === rank).length }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const straight =
    distinct.length === 5
      ? distinct[0] - distinct[4] === 4
        ? distinct[0]
        : distinct.join(',') === '14,5,4,3,2'
          ? 5
          : 0
      : 0;
  let category = 0,
    values = ranks;
  if (flush && straight) {
    category = 8;
    values = [straight];
  } else if (groups[0].count === 4) {
    category = 7;
    values = groups.map((g) => g.rank);
  } else if (groups[0].count === 3 && groups[1].count === 2) {
    category = 6;
    values = groups.map((g) => g.rank);
  } else if (flush) {
    category = 5;
  } else if (straight) {
    category = 4;
    values = [straight];
  } else if (groups[0].count === 3) {
    category = 3;
    values = groups.map((g) => g.rank);
  } else if (groups[0].count === 2 && groups[1].count === 2) {
    category = 2;
    values = groups.map((g) => g.rank);
  } else if (groups[0].count === 2) {
    category = 1;
    values = groups.map((g) => g.rank);
  }
  return {
    category,
    values,
    name: category === 8 && straight === 14 ? '皇家同花顺' : names[category],
    cards: [...cards],
  };
}
/** Best five out of 5–7 cards; suits never break ties. */
export function evaluateHand(cards: HoldemCard[]): HandRank {
  if (cards.length < 5 || cards.length > 7 || new Set(cards.map((c) => c.id)).size !== cards.length)
    throw Error('评牌需要 5–7 张不同牌');
  let best: HandRank | null = null;
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const rank = five([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareRanks(rank, best) > 0) best = rank;
          }
  return best!;
}
/** Cumulative short all-ins reopen action once the total faced reaches a full raise. */
export function raiseAllowed(
  s: Pick<HoldemState, 'actedAt' | 'currentBet' | 'minRaise' | 'checked'>,
  id: string,
) {
  return s.actedAt[id] === null || s.checked.includes(id) || s.currentBet - s.actedAt[id]! >= s.minRaise;
}
export function makeSidePots(contributions: Record<string, number>, folded: string[]): SidePot[] {
  const levels = [...new Set(Object.values(contributions).filter((n) => n > 0))].sort((a, b) => a - b);
  let previous = 0;
  return levels.map((level) => {
    const contributors = Object.keys(contributions).filter((id) => contributions[id] >= level);
    const pot = {
      amount: (level - previous) * contributors.length,
      eligible: contributors.filter((id) => !folded.includes(id)),
      winners: [],
    };
    previous = level;
    return pot;
  });
}
export function canBet(view: HoldemView, id: string) {
  return (
    !view.winnerId &&
    view.phase === 'betting' &&
    view.currentPlayerId === id &&
    view.alive.includes(id) &&
    !view.folded.includes(id) &&
    view.stacks[id] > 0
  );
}
