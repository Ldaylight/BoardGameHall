import { describe, expect, it } from 'vitest';
import { uno, type Card, type UnoState } from '../shared/games/uno/index';
function state(overrides: Partial<UnoState> = {}): UnoState {
  return {
    players: ['a', 'b', 'c'],
    hands: {
      a: [
        { id: 'r1', color: 'red', value: '1' },
        { id: 'b1', color: 'blue', value: '1' },
      ],
      b: [{ id: 'g1', color: 'green', value: '2' }],
      c: [{ id: 'y1', color: 'yellow', value: '2' }],
    },
    deck: [
      { id: 'd1', color: 'green', value: '3' },
      { id: 'd2', color: 'blue', value: '4' },
      { id: 'd3', color: 'yellow', value: '5' },
      { id: 'd4', color: 'blue', value: '6' },
    ],
    discard: [{ id: 'top', color: 'red', value: '7' }],
    lastPlays: {},
    unoDeclared: null,
    color: 'red',
    currentIndex: 0,
    direction: 1,
    winnerId: null,
    drawnCardId: null,
    logs: [],
    turnDeadline: Date.now() + 45000,
    turnNumber: 0,
    ...overrides,
  };
}
describe('UNO server authority and visible AI', () => {
  it('retains only the latest two distinct players, replaces own card and restores public history', () => {
    let s = state({
      hands: {
        a: [
          { id: 'a1', color: 'red', value: '1' },
          { id: 'a2', color: 'red', value: '2' },
          { id: 'a3', color: 'red', value: '3' },
        ],
        b: [
          { id: 'b1', color: 'red', value: '4' },
          { id: 'b2', color: 'red', value: '5' },
        ],
        c: [
          { id: 'c1', color: 'red', value: '6' },
          { id: 'c2', color: 'red', value: '7' },
        ],
      },
    });
    expect(uno.getView(s, null).lastPlays).toEqual({});
    s = uno.applyAction(s, 'a', { type: 'play', cardId: 'a1', uno: true });
    s = uno.applyAction(s, 'b', { type: 'play', cardId: 'b1', uno: true });
    expect(s.lastPlays.a.card.id).toBe('a1');
    s = uno.applyAction(s, 'c', { type: 'play', cardId: 'c1', uno: true });
    expect(s.lastPlays.a).toBeUndefined();
    expect(Object.keys(s.lastPlays).sort()).toEqual(['b', 'c']);
    s = uno.applyAction(s, 'a', { type: 'play', cardId: 'a2', uno: true });
    expect(Object.keys(s.lastPlays)).toHaveLength(2);
    expect(s.lastPlays.a.card.id).toBe('a2');
    expect(s.lastPlays.b).toBeUndefined();
    expect(s.lastPlays.c.card.id).toBe('c1');
    const spectator = uno.getView(structuredClone(s), null);
    expect(spectator.lastPlays).toEqual(s.lastPlays);
    expect(spectator.hand).toEqual([]);
    expect(JSON.stringify(spectator.lastPlays)).not.toContain('a3');
    spectator.lastPlays.a.card.value = '9';
    expect(s.lastPlays.a.card.value).toBe('2');
    const afterDraw = uno.applyAction(s, 'b', { type: 'draw' });
    expect(afterDraw.lastPlays).toEqual(s.lastPlays);
    expect(uno.createState(['a', 'b']).lastPlays).toEqual({});
  });
  it('UNO is server-authoritative, only allowed with two cards, and expires after drawing or advancing', () => {
    const s = state();
    const declared = uno.applyAction(s, 'a', { type: 'uno' });
    expect(declared.currentIndex).toBe(0);
    expect(declared.turnNumber).toBe(0);
    expect(uno.getView(declared, 'a').unoDeclared?.playerId).toBe('a');
    expect(uno.applyAction(declared, 'a', { type: 'play', cardId: 'r1' }).hands.a).toHaveLength(1);
    expect(uno.applyAction(s, 'a', { type: 'play', cardId: 'r1' }).hands.a).toHaveLength(3);
    expect(uno.applyAction(declared, 'a', { type: 'draw' }).unoDeclared).toBeNull();
    const three = state();
    three.hands.a.push({ id: 'third', color: 'red', value: '8' });
    expect(() => uno.applyAction(three, 'a', { type: 'uno' })).toThrow();
    const one = state();
    one.hands.a.pop();
    expect(() => uno.applyAction(one, 'a', { type: 'uno' })).toThrow();
    expect(() => uno.applyAction(s, 'b', { type: 'uno' })).toThrow();
    const next = uno.applyAction(declared, 'a', { type: 'play', cardId: 'r1' });
    expect(next.unoDeclared).toBeNull();
  });
  it('creates exactly 108 unique cards, deals seven each, and hides deck and opponents', () => {
    const s = uno.createState(['a', 'b', 'c']);
    const all = [...s.deck, ...s.discard, ...Object.values(s.hands).flat()];
    expect(all).toHaveLength(108);
    expect(new Set(all.map((c) => c.id)).size).toBe(108);
    expect(s.hands.a).toHaveLength(7);
    const view = uno.getView(s, 'a');
    expect(view.hand).toHaveLength(7);
    expect(view).not.toHaveProperty('deck');
    expect(view).not.toHaveProperty('hands');
    expect(uno.getView(s, null).hand).toEqual([]);
  });
  it('rejects wrong turn and illegal color without changing input', () => {
    const s = state();
    const before = structuredClone(s);
    expect(() => uno.applyAction(s, 'b', { type: 'draw' })).toThrow();
    expect(() => uno.applyAction(s, 'a', { type: 'play', cardId: 'b1' })).toThrow();
    expect(s).toEqual(before);
  });
  it('applies draw2, skips the next player, and requires UNO call', () => {
    const s = state();
    s.hands.a[0] = { id: 'r1', color: 'red', value: 'draw2' };
    const n = uno.applyAction(s, 'a', { type: 'play', cardId: 'r1', uno: true });
    expect(n.hands.b).toHaveLength(3);
    expect(n.currentIndex).toBe(2);
    expect(n.hands.a).toHaveLength(1);
    const penalty = uno.applyAction(s, 'a', { type: 'play', cardId: 'r1' });
    expect(penalty.hands.a).toHaveLength(3);
  });
  it('does not permit wild4 with a matching color and requires color on wild', () => {
    const s = state();
    s.hands.a.push({ id: 'w4', color: 'wild', value: 'wild4' }, { id: 'w', color: 'wild', value: 'wild' });
    const legal = uno.getLegalActions(uno.getView(s, 'a'), 'a');
    expect(legal.some((a) => a.type === 'play' && a.cardId === 'w4')).toBe(false);
    expect(() => uno.applyAction(s, 'a', { type: 'play', cardId: 'w' })).toThrow();
    const n = uno.applyAction(s, 'a', { type: 'play', cardId: 'w', color: 'green' });
    expect(n.color).toBe('green');
  });
  it('two player reverse skips opponent; clearing hand wins', () => {
    const s = state({
      players: ['a', 'b'],
      hands: {
        a: [
          { id: 'r', color: 'red', value: 'reverse' },
          { id: 'b', color: 'blue', value: '2' },
        ],
        b: [{ id: 'g', color: 'green', value: '3' }],
      },
    });
    const n = uno.applyAction(s, 'a', { type: 'play', cardId: 'r', uno: true });
    expect(n.currentIndex).toBe(0);
    const win = state({
      players: ['a', 'b'],
      hands: { ...s.hands, a: [{ id: 'r', color: 'red', value: '1' }] },
    });
    expect(uno.applyAction(win, 'a', { type: 'play', cardId: 'r' }).winnerId).toBe('a');
  });
  it('drawn playable card can be played or passed; existing cards cannot be played after draw', () => {
    const s = state();
    s.deck.push({ id: 'new', color: 'red', value: '4' });
    const n = uno.applyAction(s, 'a', { type: 'draw' });
    expect(n.currentIndex).toBe(0);
    expect(n.drawnCardId).toBe('new');
    expect(uno.getLegalActions(uno.getView(n, 'a'), 'a').filter((a) => a.type === 'play')).toHaveLength(1);
    expect(() => uno.applyAction(n, 'a', { type: 'play', cardId: 'r1' })).toThrow();
    expect(uno.applyAction(n, 'a', { type: 'pass' }).currentIndex).toBe(1);
  });
  it('reshuffles discard keeping top card and preserves card uniqueness', () => {
    const s = state({
      deck: [],
      discard: [
        { id: 'old', color: 'blue', value: '3' },
        { id: 'top', color: 'red', value: '7' },
      ],
    });
    const n = uno.applyAction(s, 'a', { type: 'draw' });
    expect(n.discard.at(-1)?.id).toBe('top');
    expect(n.hands.a.some((c) => c.id === 'old')).toBe(true);
  });
  it('AI returns legal decisions solely from a projected view for every difficulty', () => {
    for (const d of ['easy', 'medium', 'hard'] as const)
      for (let i = 0; i < 100; i++) {
        const s = uno.createState(['a', 'b']);
        const v = uno.getView(s, 'a');
        const a = uno.aiMove(v, 'a', d);
        expect(uno.getLegalActions(v, 'a')).toContainEqual(a);
        expect(() => uno.applyAction(s, 'a', a)).not.toThrow();
      }
  });
  it('runs full simulated games without duplicates, negative cards or stalled turns', () => {
    for (let round = 0; round < 12; round++) {
      let s = uno.createState(['a', 'b', 'c', 'd']);
      let turns = 0;
      while (!s.winnerId && turns++ < 3000) {
        const id = s.players[s.currentIndex];
        s = uno.applyAction(s, id, uno.aiMove(uno.getView(s, id), id, 'medium'));
        const all = [...s.deck, ...s.discard, ...Object.values(s.hands).flat()];
        expect(all).toHaveLength(108);
        expect(new Set(all.map((c) => c.id)).size).toBe(108);
      }
      expect(s.winnerId).toBeTruthy();
    }
  });
});
