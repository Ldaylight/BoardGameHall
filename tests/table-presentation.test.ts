import { describe, expect, it } from 'vitest';
import { sortHand } from '../client/src/lib/table-presentation';
import { uno } from '../shared/games/uno';

describe('table presentation from authoritative public state', () => {
  it('groups colors, puts wild cards at the left and does not mutate the authoritative hand', () => {
    const state = uno.createState(['a', 'b']);
    const before = structuredClone(state.hands.a);
    const sorted = sortHand(state.hands.a);
    expect(state.hands.a).toEqual(before);
    const rank = { wild: 0, red: 1, yellow: 2, green: 3, blue: 4 };
    expect(sorted.map((card) => rank[card.color])).toEqual(
      sorted.map((card) => rank[card.color]).sort((a, b) => a - b),
    );
    expect(new Set(sorted.map((card) => card.id))).toEqual(new Set(before.map((card) => card.id)));
  });
  it('preserves a skip marker until the skipped player can act, including after reverse and refresh', () => {
    let state = uno.createState(['a', 'b', 'c', 'd']);
    state.color = 'red';
    state.hands.a = [
      { id: 'skip', color: 'red', value: 'skip' },
      { id: 'a2', color: 'red', value: '8' },
      { id: 'a3', color: 'blue', value: '7' },
    ];
    state.hands.c = [
      { id: 'reverse', color: 'red', value: 'reverse' },
      { id: 'c2', color: 'blue', value: '5' },
      { id: 'c3', color: 'blue', value: '6' },
    ];
    state = uno.applyAction(state, 'a', { type: 'play', cardId: 'skip' });
    expect(state.players[state.currentIndex]).toBe('c');
    expect(uno.getView(structuredClone(state), 'b').blockedPlayers).toEqual(['b']);
    state = uno.applyAction(state, 'c', { type: 'play', cardId: 'reverse' });
    expect(state.direction).toBe(-1);
    expect(state.players[state.currentIndex]).toBe('b');
    expect(uno.getView(state, 'b').blockedPlayers).toEqual([]);
  });
  it('central discard pile shows only public discard history, keeps the current top and copies state', () => {
    const state = uno.createState(['a', 'b']);
    const publicPile = uno.getView(state, 'a').discardPile;
    expect(publicPile).toEqual(state.discard);
    expect(publicPile.at(-1)).toEqual(uno.getView(state, 'b').topCard);
    publicPile[0].value = 'wild4';
    expect(state.discard[0].value).not.toBe('wild4');
    expect(uno.getView(state, null).hand).toEqual([]);
  });
});
