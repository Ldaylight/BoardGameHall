import type { Difficulty } from '../../types.js';
import type { KittensAction, KittensView } from './types.js';
import { isCat } from './types.js';
import { kittensLegalActions } from './index.js';
const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];
/** Only own cards, public counts and an explicitly acquired future are available. */
export function kittensAI(view: KittensView, id: string, difficulty: Difficulty): KittensAction {
  const legal = kittensLegalActions(view, id);
  if (!legal.length) throw new Error('没有可执行动作');
  if (difficulty === 'easy') return pick(legal);
  if (view.phase === 'reaction' && view.pending) {
    const p = view.pending,
      harmful =
        p.targetId === id ||
        (p.cards[0].kind === 'attack' &&
          view.alive[(view.alive.indexOf(p.playerId) + 1) % view.alive.length] === id);
    const wantNope = harmful ? p.nopes % 2 === 0 : p.playerId === id && p.nopes % 2 === 1;
    return legal.find((a) => a.type === (wantNope ? 'ek:nope' : 'ek:allow')) ?? legal[0];
  }
  if (view.phase === 'favor') {
    const card = [...view.hand].sort(
      (a, b) =>
        (isCat(a.kind) ? 0 : a.kind === 'defuse' ? 10 : 2) -
        (isCat(b.kind) ? 0 : b.kind === 'defuse' ? 10 : 2),
    )[0];
    return { type: 'ek:give', cardId: card.id };
  }
  if (view.phase === 'insert')
    return {
      type: 'ek:insert',
      index:
        view.turnsRemaining > 1
          ? view.deckCount
          : Math.floor(Math.random() * Math.min(view.alive.length - 1, view.deckCount + 1)),
    };
  if (view.phase !== 'playing') return legal[0];
  const defuses = view.hand.filter((c) => c.kind === 'defuse').length;
  const knownBomb = view.future[0]?.kind === 'explode';
  const risk = view.future.length
    ? knownBomb
      ? 1
      : 0
    : Math.min(1, (view.alive.length - 1) / Math.max(1, view.deckCount));
  const danger = risk * Math.max(1, view.turnsRemaining);
  const drawValue = 8 - danger * (defuses ? 9 : 28);
  const targetValue = (target?: string) => {
    if (!target) return 0;
    // Estimate resources from public hand counts only. No preference for seat, name or human/AI.
    const count = view.handCounts[target] ?? 0;
    return Math.min(3, count / 4);
  };
  const score = (action: KittensAction) => {
    if (action.type === 'ek:draw') return drawValue;
    if (action.type !== 'ek:play') return -100;
    const cards = action.cardIds.map((cardId) => view.hand.find((c) => c.id === cardId)!);
    const kind = cards[0].kind;
    if (cards.length > 1) {
      const cost = cards.reduce(
        (n, c) => n + (c.kind === 'defuse' ? 16 : c.kind === 'nope' ? 8 : isCat(c.kind) ? 0.4 : 3),
        0,
      );
      if (cards.length === 3 && action.requestKind !== 'defuse') return -10 - cost;
      return (cards.length === 3 ? (defuses ? 7 : 13) : 8) + targetValue(action.targetId) - cost;
    }
    switch (kind) {
      case 'attack':
        return -2 + danger * (defuses ? 13 : 33) + Math.min(4, view.turnsRemaining - 1);
      case 'skip':
        return -3 + risk * (defuses ? 12 : 34);
      case 'future':
        return view.future.length ? -20 : 2 + danger * (defuses ? 5 : 13);
      case 'shuffle':
        return knownBomb ? 20 : -6;
      case 'favor':
        return 6 + targetValue(action.targetId) + (view.hand.length < 4 ? 2 : 0);
      default:
        return -100;
    }
  };
  const scored = legal.map((action) => ({ action, value: score(action) }));
  const best = Math.max(...scored.map((item) => item.value));
  // Randomize equal strategic choices, so bots cannot gang up on a fixed first seat.
  return pick(scored.filter((item) => item.value >= best - 0.15)).action;
}
