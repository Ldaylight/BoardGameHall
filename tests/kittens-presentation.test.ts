import { describe, expect, it } from 'vitest';
import { sortedKittenHand, kittenHandSpacing } from '../shared/games/exploding-kittens/presentation';
import { kittens } from '../shared/games/exploding-kittens';
import { eventCues } from '../client/src/lib/game-audio';
describe('Kittens presentation and public effects', () => {
  it('places all ordinary cats first, groups kinds, and preserves hand identity without mutating', () => {
    const hand = kittens.createState(['a', 'b']).hands.a;
    hand.push(
      { id: 'taco-last', kind: 'taco' },
      { id: 'taco-first', kind: 'taco' },
      { id: 'rainbow', kind: 'rainbow' },
    );
    const before = structuredClone(hand),
      sorted = sortedKittenHand(hand),
      cats = ['taco', 'melon', 'potato', 'beard', 'rainbow'];
    expect(hand).toEqual(before);
    expect(new Set(sorted.map((c) => c.id))).toEqual(new Set(hand.map((c) => c.id)));
    const kinds = sorted.map((c) => c.kind);
    const firstSpecial = kinds.findIndex((k) => !cats.includes(k));
    expect(kinds.slice(0, firstSpecial).every((k) => cats.includes(k))).toBe(true);
    expect(kinds.lastIndexOf('taco') - kinds.indexOf('taco') + 1).toBe(
      kinds.filter((k) => k === 'taco').length,
    );
  });
  it('uses flat spacing when cards fit; compresses then permits scrolling with visible strips', () => {
    expect(kittenHandSpacing(8, 1200, 108).step).toBe(120);
    const small = kittenHandSpacing(8, 500, 108);
    expect(small.step).toBeLessThan(108);
    expect(small.width).toBe(500);
    const many = kittenHandSpacing(30, 320, 108);
    expect(many.step).toBeCloseTo(108 * 0.42);
    expect(many.width).toBeGreaterThan(320);
  });
  it('publishes attack direction and a longer Nope response without exposing cards', () => {
    const s = kittens.createState(['a', 'b', 'c']);
    s.hands.a.push({ id: 'attack-fixture', kind: 'attack' });
    const next = kittens.applyAction(s, 'a', { type: 'ek:play', cardIds: ['attack-fixture'] });
    expect(next.pending!.targetId).toBe('b');
    expect(next.pending!.deadline - Date.now()).toBeGreaterThan(11500);
    expect(next.events.at(-1)!.targetId).toBe('b');
    expect(eventCues({ type: 'poker-all-in', playerId: 'a', count: 10000 })).toEqual([
      { effect: 'poker-all-in' },
    ]);
  });
});
