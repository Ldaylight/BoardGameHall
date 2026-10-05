import type { Difficulty } from '../../types.js';
import type { HoldemAction, HoldemView } from './types.js';
import { createDeck, shuffle } from './cards.js';
import { evaluateHand, compareRanks } from './rules.js';
import { holdemLegalActions } from './index.js';
/** Opponent cards and future board are sampled from unknown cards, never the actual deck. */
export function equity(v: HoldemView, id: string, samples = 64) {
  if (v.hand.length !== 2) return 0;
  const known = new Set([...v.hand, ...v.community].map((c) => c.id)),
    pool = createDeck().filter((c) => !known.has(c.id));
  const opponents = v.alive.filter((p) => p !== id && !v.folded.includes(p)).length;
  let wins = 0;
  for (let i = 0; i < samples; i++) {
    const cards = shuffle(pool),
      board = [...v.community, ...cards.splice(0, 5 - v.community.length)],
      mine = evaluateHand([...v.hand, ...board]);
    let better = false,
      ties = 1;
    for (let n = 0; n < opponents; n++) {
      const other = evaluateHand([...cards.splice(0, 2), ...board]),
        cmp = compareRanks(other, mine);
      if (cmp > 0) better = true;
      else if (!cmp) ties++;
    }
    if (!better) wins += 1 / ties;
  }
  return wins / samples;
}
export function aiMove(v: HoldemView, id: string, difficulty: Difficulty): HoldemAction {
  const legal = holdemLegalActions(v, id);
  if (!legal.length) throw Error('没有合法德州动作');
  if (v.phase === 'showdown') return legal[0];
  if (difficulty === 'easy') return legal[Math.floor(Math.random() * legal.length)];
  let strength: number;
  if (difficulty === 'hard') strength = equity(v, id);
  else if (v.community.length >= 3) {
    const rank = evaluateHand([...v.hand, ...v.community]);
    strength = Math.min(0.92, 0.28 + rank.category * 0.12 + rank.values[0] / 100);
  } else {
    const [a, b] = v.hand;
    strength =
      a.rank === b.rank
        ? 0.5 + a.rank / 35
        : 0.18 +
          (a.rank + b.rank) / 70 +
          (a.suit === b.suit ? 0.08 : 0) +
          (Math.abs(a.rank - b.rank) === 1 ? 0.04 : 0);
  }
  const price = v.callAmount / (v.pot + v.callAmount || 1),
    pressure = v.callAmount / (v.stacks[id] || 1);
  const raise = legal.find((a) => a.type === 'poker:raise');
  if (raise && strength > 0.72) {
    const amount = Math.min(
      v.maxRaiseTo,
      Math.max(v.minRaiseTo, v.currentBet + Math.round((v.pot || v.bigBlind) * 0.65)),
    );
    return { type: 'poker:raise', amount };
  }
  if (v.callAmount && ((strength < price + 0.06 && pressure > 0.08) || (strength < 0.4 && pressure > 0.5)))
    return { type: 'poker:fold' };
  return legal.find((a) => a.type === 'poker:check' || a.type === 'poker:call') ?? legal[0];
}
