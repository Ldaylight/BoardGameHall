import type { Difficulty } from '../../types.js';
import { rankGroups } from './cards.js';
import { classify, legalPlays } from './rules.js';
import type { DoudizhuAction, DoudizhuView, PokerCard } from './types.js';
const without = (hand: PokerCard[], played: PokerCard[]) =>
  hand.filter((c) => !played.some((p) => p.id === c.id));
function structure(hand: PokerCard[]) {
  const groups = [...rankGroups(hand).values()];
  return groups.length + groups.filter((g) => g.length === 1).length * 0.4;
}
/** Search only our remaining public-view hand. No opponent hand or undeclared bottom cards enter the AI. */
export function aiMove(view: DoudizhuView, playerId: string, difficulty: Difficulty): DoudizhuAction {
  if (view.currentPlayerId !== playerId || !view.hand.length || view.phase === 'finished')
    throw new Error('AI 当前无法行动');
  if (view.phase === 'bidding') {
    const allowed = [0, 1, 2, 3].filter((v) => !v || v > view.highestBid);
    if (difficulty === 'easy')
      return { type: 'bid', value: allowed[Math.floor(Math.random() * allowed.length)] as 0 | 1 | 2 | 3 };
    const power =
      view.hand.reduce((n, c) => n + (c.rank >= 15 ? c.rank - 13 : 0), 0) +
      [...rankGroups(view.hand).values()].filter((g) => g.length === 4).length * 5;
    const wanted = power >= 11 ? 3 : power >= 7 ? 2 : power >= 4 ? 1 : 0;
    const forced = view.bidRound >= 2 && view.bids.length === 2 && !view.highestBid;
    return { type: 'bid', value: (forced ? 1 : wanted > view.highestBid ? wanted : 0) as 0 | 1 | 2 | 3 };
  }
  const plays = legalPlays(view.hand, view.trick?.combination ?? null);
  const finish = plays.find((cards) => cards.length === view.hand.length);
  if (finish) return { type: 'play', cardIds: finish.map((c) => c.id) };
  if (difficulty === 'easy') {
    const options: DoudizhuAction[] = [
      ...plays.map((cards) => ({ type: 'play' as const, cardIds: cards.map((c) => c.id) })),
      ...(view.trick ? [{ type: 'pass' as const }] : []),
    ];
    return options[Math.floor(Math.random() * options.length)];
  }
  // Farmers cooperate using visible team identity and counts, without inspecting the teammate's cards.
  if (view.trick && playerId !== view.landlordId && view.trick.playerId !== view.landlordId)
    return { type: 'pass' };
  if (!plays.length) return { type: 'pass' };
  const danger = view.players.some(
    (p) =>
      p !== playerId && (playerId === view.landlordId || p === view.landlordId) && view.handCounts[p] <= 2,
  );
  const originalGroups = rankGroups(view.hand);
  function grade(cards: PokerCard[]) {
    const combo = classify(cards)!,
      remain = without(view.hand, cards);
    const broken = [...originalGroups]
      .filter(
        ([r, g]) => g.length >= 2 && cards.some((c) => c.rank === r) && remain.some((c) => c.rank === r),
      )
      .reduce((n, [, g]) => n + (g.length === 4 ? 22 : 3), 0);
    const bomb = combo.kind === 'bomb' || combo.kind === 'rocket';
    return (
      cards.length * 7 -
      structure(remain) * 2 -
      broken -
      (bomb && !danger ? 22 : 0) +
      (danger ? combo.mainRank : -combo.mainRank * 0.3)
    );
  }
  const ordered = plays.map((cards) => ({ cards, score: grade(cards) })).sort((a, b) => b.score - a.score);
  if (difficulty === 'hard') {
    const deadline = performance.now() + 80,
      cache = new Map<string, number>();
    function search(hand: PokerCard[], depth: number): number {
      if (!hand.length) return 0;
      if (!depth || performance.now() >= deadline) return structure(hand);
      const key = `${depth}:${[...rankGroups(hand)].map(([r, g]) => `${r}x${g.length}`).join(',')}`;
      if (cache.has(key)) return cache.get(key)!;
      const next = legalPlays(hand, null)
        .sort((a, b) => b.length - a.length)
        .slice(0, 8);
      let best = structure(hand);
      for (const cards of next) {
        best = Math.min(best, 1 + search(without(hand, cards), depth - 1));
        if (best === 1 || performance.now() >= deadline) break;
      }
      cache.set(key, best);
      return best;
    }
    const searched = ordered.slice(0, 12);
    for (const candidate of searched) candidate.score -= search(without(view.hand, candidate.cards), 3) * 9;
    searched.sort((a, b) => b.score - a.score);
    return { type: 'play', cardIds: searched[0].cards.map((c) => c.id) };
  }
  return { type: 'play', cardIds: ordered[0].cards.map((c) => c.id) };
}
