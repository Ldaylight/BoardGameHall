import { describe, expect, it, vi, afterEach } from 'vitest';
import { holdem, createHoldemState, applyHoldemAction, getHoldemView } from '../shared/games/holdem';
import { createDeck } from '../shared/games/holdem/cards';
import { compareRanks, evaluateHand, makeSidePots } from '../shared/games/holdem/rules';
import { equity } from '../shared/games/holdem/ai';
import { applyGameAction } from '../shared/games';
import type { HoldemCard, HoldemState, HoldemAction, Suit } from '../shared/games/holdem/types';
const c = (rank: number, suit: Suit = 'spades'): HoldemCard => ({ id: `poker-${suit}-${rank}`, rank, suit });
const actor = (s: HoldemState) => s.players[s.currentIndex];
const act = (s: HoldemState, a: HoldemAction) => applyHoldemAction(s, actor(s), a);
const passive = (s: HoldemState) =>
  act(s, { type: s.bets[actor(s)] < s.currentBet ? 'poker:call' : 'poker:check' });
const chips = (s: HoldemState) => Object.values(s.stacks).reduce((a, b) => a + b, 0) + s.pot;
function readyAll(s: HoldemState) {
  for (const id of [...s.alive]) s = applyHoldemAction(s, id, { type: 'poker:ready', ready: true });
  return s;
}
function river(
  stacks: number[],
  board = [c(2), c(3, 'hearts'), c(7, 'clubs'), c(9, 'diamonds'), c(11, 'hearts')],
) {
  const s = createHoldemState(stacks.map((_, i) => String.fromCharCode(97 + i)));
  s.street = 'river';
  s.community = board;
  s.stacks = Object.fromEntries(s.players.map((id, i) => [id, stacks[i]]));
  s.bets = Object.fromEntries(s.players.map((id) => [id, 0]));
  s.contributions = { ...s.bets };
  s.currentBet = 0;
  s.pot = 0;
  s.allIn = [];
  s.actedAt = Object.fromEntries(s.players.map((id) => [id, null]));
  s.checked = [];
  s.currentIndex = 0;
  s.hands = {
    a: [c(14), c(14, 'hearts')],
    b: [c(13), c(13, 'hearts')],
    c: [c(12), c(12, 'hearts')],
    d: [c(10), c(10, 'hearts')],
  };
  return s;
}
afterEach(() => vi.restoreAllMocks());
describe('Texas Hold’em hand ranking', () => {
  it('uses exactly 52 unique cards without jokers and deals privately for 2–6 players', () => {
    expect(createDeck()).toHaveLength(52);
    expect(new Set(createDeck().map((c) => c.id)).size).toBe(52);
    for (let n = 2; n <= 6; n++) {
      const s = createHoldemState(Array.from({ length: n }, (_, i) => `p${i}`));
      expect(Object.values(s.hands).every((h) => h.length === 2)).toBe(true);
      const cards = [...s.deck, ...Object.values(s.hands).flat()];
      expect(new Set(cards.map((c) => c.id)).size).toBe(52);
      expect(chips(s)).toBe(1000 * n);
    }
  });
  it.each([
    [0, [c(14), c(11, 'hearts'), c(9), c(7, 'hearts'), c(3)]],
    [1, [c(14), c(14, 'hearts'), c(9), c(7), c(3)]],
    [2, [c(14), c(14, 'hearts'), c(9), c(9, 'hearts'), c(3)]],
    [3, [c(14), c(14, 'hearts'), c(14, 'clubs'), c(9), c(3)]],
    [4, [c(14), c(2, 'hearts'), c(3), c(4), c(5)]],
    [5, [c(14), c(11), c(9), c(7), c(3)]],
    [6, [c(14), c(14, 'hearts'), c(14, 'clubs'), c(9), c(9, 'hearts')]],
    [7, [c(14), c(14, 'hearts'), c(14, 'clubs'), c(14, 'diamonds'), c(9)]],
    [8, [c(14), c(13), c(12), c(11), c(10)]],
  ] as [number, HoldemCard[]][])('ranks category %i', (category, cards) =>
    expect(evaluateHand(cards).category).toBe(category),
  );
  it('selects best five using zero, one or two hole cards, handles two triples and ignores suits in ties', () => {
    const board = [c(14), c(13), c(12), c(11), c(10)],
      r = evaluateHand([...board, c(2, 'hearts'), c(3, 'clubs')]);
    expect(r.cards).toEqual(board);
    expect(r.name).toBe('皇家同花顺');
    expect(
      evaluateHand([c(13), c(13, 'hearts'), c(13, 'clubs'), c(12), c(12, 'hearts'), c(12, 'clubs'), c(2)])
        .values,
    ).toEqual([13, 12]);
    expect(
      compareRanks(
        evaluateHand([c(14), c(2, 'hearts'), c(3), c(4), c(5)]),
        evaluateHand([c(2), c(3, 'hearts'), c(4), c(5), c(6)]),
      ),
    ).toBeLessThan(0);
    const pair = [c(10), c(10, 'hearts'), c(14), c(8), c(3)];
    expect(
      compareRanks(
        evaluateHand(pair),
        evaluateHand(pair.map((p, i) => ({ ...p, suit: i === 1 ? 'clubs' : 'diamonds', id: `tie${i}` }))),
      ),
    ).toBe(0);
    expect(
      compareRanks(evaluateHand(pair), evaluateHand([c(10), c(10, 'hearts'), c(13), c(8), c(3)])),
    ).toBeGreaterThan(0);
  });
});
describe('Texas authority, betting and settlement', () => {
  it('preserves blind progression after eliminated seats and when switching to heads-up', () => {
    let s = createHoldemState(['a', 'b', 'c', 'd']);
    s.alive = ['a', 'c', 'd'];
    s.stacks.b = 0;
    s.phase = 'showdown';
    s.turnDeadline = Date.now() - 1;
    s = readyAll(s);
    expect(s.bigBlindId).toBe('d');
    expect(s.smallBlindId).toBe('c');
    s.alive = ['a', 'd'];
    s.stacks.c = 0;
    s.phase = 'showdown';
    s.turnDeadline = Date.now() - 1;
    s = readyAll(s);
    expect(s.bigBlindId).toBe('a');
    expect(s.smallBlindId).toBe('d');
    expect(s.players[s.dealerIndex]).toBe('d');
  });
  it('rejects wrong turn, observers, foreign actions, under-raises and invalid configs without mutations', () => {
    const s = createHoldemState(['a', 'b', 'c']),
      before = structuredClone(s);
    expect(() => applyHoldemAction(s, 'b', { type: 'poker:call' })).toThrow('轮到');
    expect(() => applyHoldemAction(s, 'x', { type: 'poker:fold' })).toThrow('观战');
    expect(() => act(s, { type: 'poker:check' })).toThrow('不能过牌');
    for (const amount of [21, 39, 1001, NaN, 40.5])
      expect(() => act(s, { type: 'poker:raise', amount })).toThrow();
    expect(() => applyGameAction(s, 'a', { type: 'draw' })).toThrow('不支持');
    expect(s).toEqual(before);
    expect(() => createHoldemState(['a'])).toThrow();
    expect(() => createHoldemState(['a', 'a'])).toThrow();
    expect(() => createHoldemState(['a', 'b'], { startingStack: 100, smallBlind: 51 })).toThrow('配置');
  });
  it('preserves the BB option, burns exactly one per street and finishes four betting rounds', () => {
    let s = createHoldemState(['a', 'b', 'c']);
    expect(actor(s)).toBe('a');
    s = passive(s);
    s = passive(s);
    expect(actor(s)).toBe('c');
    expect(s.street).toBe('preflop');
    expect(holdem.getLegalActions(getHoldemView(s, 'c'), 'c').some((a) => a.type === 'poker:raise')).toBe(
      true,
    );
    s = passive(s);
    expect(s.street).toBe('flop');
    expect(actor(s)).toBe('b');
    expect(s.community).toHaveLength(3);
    const calls = 3 * 3;
    for (let i = 0; i < calls; i++) s = passive(s);
    expect(s.phase).toBe('showdown');
    expect(s.community).toHaveLength(5);
    expect(s.burned).toHaveLength(3);
    expect(chips(s)).toBe(3000);
    expect(s.history).toHaveLength(1);
    expect(
      new Set([...s.deck, ...s.burned, ...s.community, ...Object.values(s.hands).flat()].map((c) => c.id))
        .size,
    ).toBe(52);
  });
  it('heads-up dealer is SB and acts first preflop, last postflop; rotates next hand', () => {
    let s = createHoldemState(['a', 'b']);
    expect(s.smallBlindId).toBe('a');
    expect(actor(s)).toBe('a');
    s = passive(s);
    s = passive(s);
    expect(actor(s)).toBe('b');
    while (s.phase === 'betting') s = passive(s);
    s.turnDeadline = Date.now() - 1;
    s = readyAll(s);
    expect(s.smallBlindId).toBe('b');
    expect(s.bigBlindId).toBe('a');
    expect(actor(s)).toBe('b');
  });
  it('short all-in does not reopen previous callers, but an unacted BB retains raise rights', () => {
    let s = createHoldemState(['a', 'b', 'c']);
    s.stacks.b = 20;
    s = passive(s);
    s = act(s, { type: 'poker:all-in' });
    expect(s.currentBet).toBe(30);
    expect(s.minRaise).toBe(20);
    expect(holdem.getLegalActions(getHoldemView(s, 'c'), 'c').some((a) => a.type === 'poker:raise')).toBe(
      true,
    );
    s = passive(s);
    expect(actor(s)).toBe('a');
    expect(
      holdem
        .getLegalActions(getHoldemView(s, 'a'), 'a')
        .some((a) => a.type === 'poker:raise' || a.type === 'poker:all-in'),
    ).toBe(false);
    expect(() => act(s, { type: 'poker:raise', amount: 50 })).toThrow('未重新');
    s = passive(s);
    expect(s.street).toBe('flop');
  });
  it('cumulative short all-ins reopen when facing a complete increment; checkers can raise a short opening', () => {
    let s = river([1000, 30, 45, 1000]);
    s = act(s, { type: 'poker:raise', amount: 20 });
    s = act(s, { type: 'poker:all-in' });
    s = act(s, { type: 'poker:all-in' });
    s = passive(s);
    expect(actor(s)).toBe('a');
    expect(getHoldemView(s, 'a').canRaise).toBe(true);
    expect(getHoldemView(s, 'a').minRaiseTo).toBe(65);
    s = act(s, { type: 'poker:raise', amount: 65 });
    expect(s.minRaise).toBe(20);
    let t = river([1000, 10, 1000]);
    t = passive(t);
    t = act(t, { type: 'poker:all-in' });
    t = passive(t);
    expect(getHoldemView(t, 'a').canRaise).toBe(true);
    t = act(t, { type: 'poker:raise', amount: 30 });
    expect(t.currentBet).toBe(30);
  });
  it('separates main and side pots, distributes only to eligible players and refunds unmatched excess', () => {
    let s = river([100, 200, 300]);
    s = act(s, { type: 'poker:all-in' });
    s = act(s, { type: 'poker:all-in' });
    s = passive(s);
    expect(s.lastResult!.pots.map((p) => p.amount)).toEqual([300, 200]);
    expect(s.lastResult!.pots.map((p) => p.winners)).toEqual([['a'], ['b']]);
    expect(s.stacks).toEqual({ a: 300, b: 200, c: 100 });
    expect(chips(s)).toBe(600);
    let t = river([100, 300]);
    t = act(t, { type: 'poker:all-in' });
    expect(() => act(t, { type: 'poker:all-in' })).toThrow('对手均');
    t = passive(t);
    expect(t.stacks).toEqual({ a: 200, b: 200 });
    expect(t.lastResult!.pots).toHaveLength(1);
    expect(makeSidePots({ a: 10, b: 20, c: 20 }, ['b'])).toEqual([
      { amount: 30, eligible: ['a', 'c'], winners: [] },
      { amount: 20, eligible: ['c'], winners: [] },
    ]);
  });
  it('splits board-only ties and awards odd chips clockwise left of the button', () => {
    let s = river([100, 100, 100], [c(14), c(13), c(12), c(11), c(10)]);
    s.hands = {
      a: [c(2, 'hearts'), c(3, 'hearts')],
      b: [c(4, 'hearts'), c(5, 'hearts')],
      c: [c(6, 'hearts'), c(7, 'hearts')],
    };
    s.contributions = { a: 1, b: 1, c: 1 };
    s.pot = 3;
    s.stacks = { a: 99, b: 99, c: 99 };
    s.folded = ['c'];
    s = passive(s);
    s = passive(s);
    expect(s.stacks).toEqual({ a: 100, b: 101, c: 99 });
    expect(s.lastResult!.payouts).toEqual({ a: 1, b: 2, c: 0 });
  });
  it('never reveals folded cards, deck or burns, and reveals no hole cards in uncontested wins', () => {
    let s = createHoldemState(['a', 'b', 'c']);
    const secret = s.hands.b[0].id;
    const own = getHoldemView(s, 'a'),
      observer = getHoldemView(s, null);
    expect(observer.hand).toEqual([]);
    for (const key of ['deck', 'hands', 'burned']) expect(key in own).toBe(false);
    expect(JSON.stringify(own)).not.toContain(secret);
    own.hand[0].rank = 99;
    expect(s.hands.a[0].rank).not.toBe(99);
    s = act(s, { type: 'poker:fold' });
    s = act(s, { type: 'poker:fold' });
    expect(s.lastResult!.uncontested).toBe(true);
    expect(s.lastResult!.revealed).toEqual({});
    expect(s.lastResult!.ranks).toEqual({});
    expect(JSON.stringify(getHoldemView(s, null))).not.toContain(secret);
  });
  it('uses nominal BB even when BB is short and returns an unmatched call when no opponent can bet', () => {
    let s = createHoldemState(['a', 'b', 'c']);
    s.phase = 'showdown';
    s.turnDeadline = Date.now() - 1;
    s.bigBlindId = 'b';
    s.dealerIndex = 2;
    s.stacks = { a: 100, b: 100, c: 5 };
    s.alive = ['a', 'b', 'c'];
    s = readyAll(s);
    expect(s.bigBlindId).toBe('c');
    expect(s.bets.c).toBe(5);
    expect(s.currentBet).toBe(20);
  });
  it('plays complete fair AI tournaments with conserved chips, valid actions and escalating blinds', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      let s = createHoldemState(['a', 'b', 'c'], { startingStack: 100, smallBlind: 5, blindEvery: 1 });
      for (let i = 0; i < 1000 && !s.winnerId; i++) {
        if (s.phase === 'showdown') s.turnDeadline = Date.now() - 1;
        const id = actor(s),
          v = getHoldemView(s, id),
          action = holdem.aiMove(v, id, difficulty);
        s = applyHoldemAction(s, id, action);
        expect(chips(s)).toBe(300);
        expect(Object.values(s.stacks).every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
      }
      expect(s.winnerId).toBeTruthy();
      expect(s.stacks[s.winnerId!]).toBe(300);
    }
  });
  it('Monte Carlo uses only public board and own cards, and recognizes an unbeatable royal flush', () => {
    const s = river([1000, 1000], [c(10), c(11), c(12), c(2, 'hearts'), c(3, 'hearts')]);
    s.hands.a = [c(13), c(14)];
    const v = getHoldemView(s, 'a');
    expect(equity(v, 'a', 8)).toBe(1);
    vi.spyOn(Math, 'random').mockReturnValue(0.35);
    const a = holdem.aiMove(v, 'a', 'hard');
    s.deck.reverse();
    s.hands.b = [c(9), c(8)];
    expect(holdem.aiMove(getHoldemView(s, 'a'), 'a', 'hard')).toEqual(a);
  });
});
