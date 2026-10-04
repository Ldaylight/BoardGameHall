import { describe, expect, it } from 'vitest';
import { doudizhu } from '../shared/games/doudizhu';
import { deck } from '../shared/games/doudizhu/cards';
import { beats, classify, legalPlays } from '../shared/games/doudizhu/rules';
import type { ComboKind, DoudizhuState, PokerCard } from '../shared/games/doudizhu/types';
import { applyGameAction, wonGame } from '../shared/games';
const cards = (ranks: number[]) => {
  const available = deck();
  return ranks.map((rank) => {
    const i = available.findIndex((c) => c.rank === rank);
    if (i < 0) throw new Error('invalid fixture');
    return available.splice(i, 1)[0];
  });
};
function playing(): DoudizhuState {
  let s = doudizhu.createState(['a', 'b', 'c']);
  s.currentIndex = 0;
  s = doudizhu.applyAction(s, 'a', { type: 'bid', value: 3 });
  return s;
}
describe('Doudizhu rules and authority', () => {
  const combos: [ComboKind, number[]][] = [
    ['single', [3]],
    ['pair', [4, 4]],
    ['triple', [5, 5, 5]],
    ['triple-single', [6, 6, 6, 8]],
    ['triple-pair', [7, 7, 7, 9, 9]],
    ['straight', [3, 4, 5, 6, 7]],
    ['pair-straight', [3, 3, 4, 4, 5, 5]],
    ['plane', [3, 3, 3, 4, 4, 4]],
    ['plane-single', [3, 3, 3, 4, 4, 4, 7, 8]],
    ['plane-pair', [3, 3, 3, 4, 4, 4, 7, 7, 8, 8]],
    ['four-single', [5, 5, 5, 5, 3, 4]],
    ['four-pair', [5, 5, 5, 5, 3, 3, 4, 4]],
    ['bomb', [15, 15, 15, 15]],
    ['rocket', [16, 17]],
  ];
  it.each(combos)('recognizes %s and enumerates that full-hand play', (kind, ranks) => {
    const hand = cards(ranks);
    expect(classify(hand)?.kind).toBe(kind);
    expect(legalPlays(hand, null).some((p) => p.length === hand.length)).toBe(true);
  });
  it('rejects duplicate cards, short/gapped chains, 2/joker chains and forbidden wing variants', () => {
    for (const ranks of [
      [3, 4, 5, 6],
      [3, 4, 5, 6, 8],
      [11, 12, 13, 14, 15],
      [13, 14, 15, 16, 17],
      [3, 3, 4, 4],
      [3, 3, 3, 4, 4, 4, 8, 8],
      [3, 3, 3, 4, 4, 4, 16, 17],
      [3, 3, 3, 3, 7, 7],
      [3, 3, 3, 3, 5, 16],
      [3, 3, 3, 3, 7, 7, 7, 7],
    ])
      expect(classify(cards(ranks))).toBeNull();
    const duplicate = cards([3])[0];
    expect(classify([duplicate, duplicate])).toBeNull();
  });
  it('compares matching body ranks and lengths; bomb/rocket override normal shapes', () => {
    const c = (r: number[]) => classify(cards(r))!;
    expect(beats(c([4, 4, 4, 3]), c([3, 3, 3, 17]))).toBe(true);
    expect(beats(c([10, 10]), c([9]))).toBe(false);
    expect(beats(c([4, 5, 6, 7, 8, 9]), c([3, 4, 5, 6, 7]))).toBe(false);
    expect(beats(c([3, 3, 3, 3]), c([17]))).toBe(true);
    expect(beats(c([4, 4, 4, 4]), c([3, 3, 3, 3]))).toBe(true);
    expect(beats(c([16, 17]), c([15, 15, 15, 15]))).toBe(true);
    expect(beats(c([15, 15, 15, 15]), c([16, 17]))).toBe(false);
  });
  it('matches exhaustive subset enumeration, including attached/partial groups, up to suit equivalence', () => {
    for (const hand of [cards([3, 3, 3, 4, 4, 4, 5, 6, 7, 8]), cards([3, 3, 3, 3, 4, 4, 5, 5, 16, 17])]) {
      const key = (p: PokerCard[]) =>
        p
          .map((c) => c.rank)
          .sort((a, b) => a - b)
          .join(',');
      const expected = new Set<string>();
      for (let mask = 1; mask < 2 ** hand.length; mask++) {
        const p = hand.filter((_, i) => mask & (1 << i));
        if (classify(p)) expected.add(key(p));
      }
      expect(new Set(legalPlays(hand, null).map(key))).toEqual(expected);
    }
  });
  it('deals all 54 unique cards, hides opponent hands and bottom cards before bidding', () => {
    const s = doudizhu.createState(['a', 'b', 'c']);
    expect(Object.values(s.hands).map((h) => h.length)).toEqual([17, 17, 17]);
    expect(s.kitty).toHaveLength(3);
    expect(new Set([...Object.values(s.hands).flat(), ...s.kitty].map((c) => c.id)).size).toBe(54);
    const v = doudizhu.getView(s, 'a');
    expect(v.hand).toEqual(s.hands.a);
    expect(v.kitty).toEqual([]);
    expect(v).not.toHaveProperty('hands');
    expect(v.revealedHands).toBeNull();
    expect(doudizhu.getView(s, null).hand).toEqual([]);
    expect(() => doudizhu.createState(['a', 'b'])).toThrow('3');
    expect(() => doudizhu.createState(['a', 'a', 'c'])).toThrow('不同');
  });
  it('bids once each, requires an increase, assigns 3 immediately; all passes redeal', () => {
    let s = doudizhu.createState(['a', 'b', 'c']);
    s.currentIndex = 0;
    s.firstBidderIndex = 0;
    s = doudizhu.applyAction(s, 'a', { type: 'bid', value: 1 });
    expect(() => doudizhu.applyAction(s, 'b', { type: 'bid', value: 1 })).toThrow('更高');
    s = doudizhu.applyAction(s, 'b', { type: 'bid', value: 2 });
    s = doudizhu.applyAction(s, 'c', { type: 'bid', value: 0 });
    expect(s.landlordId).toBe('b');
    expect(s.currentIndex).toBe(1);
    expect(s.hands.b).toHaveLength(20);
    expect(doudizhu.getView(s, 'a').kitty).toHaveLength(3);
    s = doudizhu.createState(['a', 'b', 'c']);
    s.currentIndex = 0;
    s.firstBidderIndex = 0;
    for (const id of ['a', 'b', 'c']) s = doudizhu.applyAction(s, id, { type: 'bid', value: 0 });
    expect(s.phase).toBe('bidding');
    expect(s.bidRound).toBe(1);
    expect(s.currentIndex).toBe(1);
    expect(s.bids).toEqual([]);
    expect(Object.values(s.hands).flat()).toHaveLength(51);
    s = doudizhu.applyAction(s, 'b', { type: 'bid', value: 3 });
    expect(s.landlordId).toBe('b');
    expect(s.phase).toBe('playing');
  });
  it('rejects wrong turns, foreign/duplicate/invalid/underpowered plays and cross-game payloads without mutations', () => {
    const s = playing();
    s.hands.a = cards([3, 4, 4, 5]);
    const original = structuredClone(s);
    expect(() => doudizhu.applyAction(s, 'b', { type: 'play', cardIds: [s.hands.b[0].id] })).toThrow('轮到');
    expect(() => doudizhu.applyAction(s, 'a', { type: 'pass' })).toThrow('首出');
    expect(() => doudizhu.applyAction(s, 'a', { type: 'play', cardIds: ['foreign'] })).toThrow('自己的');
    expect(() =>
      doudizhu.applyAction(s, 'a', { type: 'play', cardIds: [s.hands.a[0].id, s.hands.a[0].id] }),
    ).toThrow('请选择');
    expect(() =>
      doudizhu.applyAction(s, 'a', { type: 'play', cardIds: [s.hands.a[0].id, s.hands.a[1].id] }),
    ).toThrow('牌型');
    expect(() => applyGameAction(s, 'a', { type: 'play', cardId: s.hands.a[0].id })).toThrow('不支持');
    expect(s).toEqual(original);
    const next = doudizhu.applyAction(s, 'a', { type: 'play', cardIds: [s.hands.a[3].id] });
    next.hands.b = cards([3, 6]);
    expect(() => doudizhu.applyAction(next, 'b', { type: 'play', cardIds: [next.hands.b[0].id] })).toThrow(
      '压过',
    );
  });
  it('two passes reset the trick and return the lead to the last player', () => {
    let s = playing();
    s.hands.a = cards([3, 4]);
    s = doudizhu.applyAction(s, 'a', { type: 'play', cardIds: [s.hands.a[0].id] });
    s = doudizhu.applyAction(s, 'b', { type: 'pass' });
    s = doudizhu.applyAction(s, 'c', { type: 'pass' });
    expect(s.currentIndex).toBe(0);
    expect(s.trick).toBeNull();
    expect(s.passes).toBe(0);
    expect(() => doudizhu.applyAction(s, 'a', { type: 'pass' })).toThrow('首出');
  });
  it('bomb spring doubles, landlord scores twice each farmer, end is immutable', () => {
    let s = playing();
    s.hands.a = cards([3, 3, 3, 3]);
    s = doudizhu.applyAction(s, 'a', { type: 'play', cardIds: s.hands.a.map((c) => c.id) });
    expect(s.winnerIds).toEqual(['a']);
    expect(s.spring).toBe('spring');
    expect(s.bombs).toBe(1);
    expect(s.multiplier).toBe(4);
    expect(s.scores).toEqual({ a: 24, b: -12, c: -12 });
    expect(() => doudizhu.applyAction(s, 'b', { type: 'pass' })).toThrow('结束');
  });
  it('either farmer finishes: both win, counter-spring doubles and only then hands are revealed', () => {
    let s = playing();
    s.hands.a = cards([3, 7]);
    s.hands.b = cards([4]);
    s = doudizhu.applyAction(s, 'a', { type: 'play', cardIds: [s.hands.a[0].id] });
    s = doudizhu.applyAction(s, 'b', { type: 'play', cardIds: [s.hands.b[0].id] });
    expect(s.winnerIds).toEqual(['b', 'c']);
    expect(s.spring).toBe('counter-spring');
    expect(s.scores).toEqual({ a: -12, b: 6, c: 6 });
    expect(wonGame(s, 'c')).toBe(true);
    expect(wonGame(s, 'a')).toBe(false);
    expect(doudizhu.getView(s, null).revealedHands).toEqual(s.hands);
  });
  it.each(['easy', 'medium', 'hard'] as const)(
    '%s AI completes full games with legal actions and conserved cards',
    (difficulty) => {
      for (let match = 0; match < 3; match++) {
        let s = doudizhu.createState(['a', 'b', 'c']);
        for (let turn = 0; turn < 500 && s.phase !== 'finished'; turn++) {
          const id = s.players[s.currentIndex],
            v = doudizhu.getView(s, id),
            before = structuredClone(v),
            action = doudizhu.aiMove(v, id, difficulty);
          expect(v).toEqual(before);
          s = doudizhu.applyAction(s, id, action);
          const remaining = [
            ...Object.values(s.hands).flat(),
            ...(s.phase === 'bidding' ? s.kitty : []),
            ...s.moves.flatMap((m) => m.cards),
          ];
          expect(remaining).toHaveLength(54);
          expect(new Set(remaining.map((c) => c.id)).size).toBe(54);
        }
        expect(s.phase).toBe('finished');
        expect(Object.values(s.scores).reduce((a, b) => a + b, 0)).toBe(0);
      }
    },
    20000,
  );
  it('farmers cooperate without reading partner cards, unless they can finish immediately', () => {
    let s = playing();
    s.currentIndex = 1;
    s.hands.b = cards([5, 9]);
    s.hands.c = cards([6, 10]);
    s = doudizhu.applyAction(s, 'b', { type: 'play', cardIds: [s.hands.b[0].id] });
    expect(doudizhu.aiMove(doudizhu.getView(s, 'c'), 'c', 'medium')).toEqual({ type: 'pass' });
    s.hands.c = cards([6]);
    expect(doudizhu.aiMove(doudizhu.getView(s, 'c'), 'c', 'hard').type).toBe('play');
  });
});
