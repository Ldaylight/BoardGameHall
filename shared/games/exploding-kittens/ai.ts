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
    return { type: 'ek:insert', index: view.turnsRemaining > 1 ? view.deckCount : 0 };
  if (view.phase !== 'playing') return legal[0];
  const defuses = view.hand.filter((c) => c.kind === 'defuse').length;
  const danger = view.future.length
    ? view.future[0].kind === 'explode'
    : view.deckCount <= view.alive.length * (difficulty === 'hard' ? 4 : 2) || view.turnsRemaining > 1;
  const score = (action: KittensAction) => {
    if (action.type === 'ek:draw') return danger && !defuses ? 0 : 5;
    if (action.type !== 'ek:play') return 0;
    const kind = view.hand.find((c) => c.id === action.cardIds[0])!.kind;
    if (action.cardIds.length > 1)
      return kind === 'defuse' || kind === 'nope'
        ? -20
        : action.cardIds.length === 3 && action.requestKind === 'defuse'
          ? 14
          : 7;
    return (
      (
        {
          attack: danger ? 12 : 1,
          skip: danger ? 10 : 0,
          favor: 8,
          future: !view.future.length && danger ? 11 : 1,
          shuffle: danger ? 6 : 0,
        } as Record<string, number>
      )[kind] ?? -10
    );
  };
  return [...legal].sort((a, b) => score(b) - score(a))[0];
}
