import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  kittens,
  createKittensState,
  applyKittensAction,
  getKittensView,
  resolveKittensPending,
} from '../shared/games/exploding-kittens';
import { createDeck } from '../shared/games/exploding-kittens/cards';
import type { KittenKind, KittensState, KittensAction } from '../shared/games/exploding-kittens/types';
import { applyGameAction, gameFinished } from '../shared/games';
import { eventCues } from '../client/src/lib/game-audio';
const card = (kind: KittenKind, id = Math.random().toString(36).slice(2)) => ({ kind, id });
function fixture(
  hands: Record<string, KittenKind[]> = {
    a: ['attack', 'skip', 'future', 'shuffle', 'favor', 'nope', 'defuse'],
    b: ['attack', 'nope', 'defuse'],
    c: ['defuse', 'taco'],
  },
): KittensState {
  const s = createKittensState(Object.keys(hands));
  s.hands = Object.fromEntries(Object.entries(hands).map(([id, kinds]) => [id, kinds.map((k) => card(k))]));
  s.deck = ['taco', 'rainbow', 'explode', 'skip', 'nope'].map((k) => card(k as KittenKind));
  return s;
}
function play(
  s: KittensState,
  id: string,
  kind: KittenKind,
  extra: Partial<Extract<KittensAction, { type: 'ek:play' }>> = {},
) {
  return applyKittensAction(s, id, {
    type: 'ek:play',
    cardIds: [s.hands[id].find((c) => c.kind === kind)!.id],
    ...extra,
  });
}
function settle(s: KittensState) {
  for (const id of s.alive)
    if (s.phase === 'reaction' && !s.pending!.allowed.includes(id))
      s = applyKittensAction(s, id, { type: 'ek:allow', pendingId: s.pending!.id });
  return s;
}
const pool = (s: KittensState) =>
  [
    ...s.deck,
    ...s.discard,
    ...Object.values(s.hands).flat(),
    ...Object.values(s.eliminatedHands).flat(),
    ...(s.bomb ? [s.bomb] : []),
  ]
    .map((c) => c.id)
    .sort();
afterEach(() => vi.restoreAllMocks());
describe('Exploding Kittens classic rules, authority and visibility', () => {
  it('builds the official 56 card multiset and deals eight including a guaranteed Defuse for 2–5 players', () => {
    expect(createDeck()).toHaveLength(56);
    for (const n of [2, 3, 4, 5]) {
      const s = createKittensState(Array.from({ length: n }, (_, i) => `p${i}`));
      for (const hand of Object.values(s.hands)) {
        expect(hand).toHaveLength(8);
        expect(hand.filter((c) => c.kind === 'defuse')).toHaveLength(1);
        expect(hand.some((c) => c.kind === 'explode')).toBe(false);
      }
      expect(s.deck.filter((c) => c.kind === 'explode')).toHaveLength(n - 1);
      expect(s.deck.filter((c) => c.kind === 'defuse')).toHaveLength(Math.min(2, 6 - n));
      expect(new Set(pool(s)).size).toBe(pool(s).length);
    }
    expect(() => createKittensState(['a'])).toThrow('2–5');
    expect(() => createKittensState(['a', 'a'])).toThrow('不同');
  });
  it('never exposes deck, opponents, eliminated hands, bomb IDs or future to spectators', () => {
    const s = fixture(),
      own = getKittensView(s, 'a'),
      spectator = getKittensView(s, null);
    expect(own.hand).toEqual(s.hands.a);
    expect(spectator.hand).toEqual([]);
    for (const field of ['hands', 'deck', 'eliminatedHands', 'bomb']) expect(field in own).toBe(false);
    expect(JSON.stringify(own)).not.toContain(s.deck[0].id);
    expect(JSON.stringify(own)).not.toContain(s.hands.b[0].id);
    own.hand[0].kind = 'explode';
    expect(s.hands.a[0].kind).toBe('attack');
  });
  it('rejects out-of-turn, spectators, duplicate, stolen, mixed and cross-game actions without mutating state', () => {
    const s = fixture(),
      before = structuredClone(s);
    expect(() => applyKittensAction(s, 'b', { type: 'ek:draw' })).toThrow('轮到');
    expect(() => applyKittensAction(s, 'guest', { type: 'ek:draw' })).toThrow('观战');
    expect(() => applyKittensAction(s, 'a', { type: 'ek:play', cardIds: [s.hands.b[0].id] })).toThrow('自己');
    expect(() =>
      applyKittensAction(s, 'a', { type: 'ek:play', cardIds: [s.hands.a[0].id, s.hands.a[0].id] }),
    ).toThrow('不同');
    expect(() =>
      applyKittensAction(s, 'a', { type: 'ek:play', cardIds: s.hands.a.slice(0, 2).map((c) => c.id) }),
    ).toThrow('同名');
    expect(() => applyGameAction(s, 'a', { type: 'draw' })).toThrow('不支持');
    expect(s).toEqual(before);
  });
  it('drawing a safe card ends exactly one turn and permits empty hands', () => {
    let s = fixture({ a: [], b: [] });
    const drawn = s.deck[0];
    s = applyKittensAction(s, 'a', { type: 'ek:draw' });
    expect(s.hands.a).toEqual([drawn]);
    expect(s.currentIndex).toBe(1);
    expect(s.phase).toBe('playing');
  });
  it('Attack transfers and stacks current/remaining debt; Skip only ends one owed turn', () => {
    let s = settle(play(fixture(), 'a', 'attack'));
    expect(s.currentIndex).toBe(1);
    expect(s.turnsRemaining).toBe(2);
    s = settle(play(s, 'b', 'attack'));
    expect(s.currentIndex).toBe(2);
    expect(s.turnsRemaining).toBe(4);
    s.hands.c.push(card('skip'));
    s = settle(play(s, 'c', 'skip'));
    expect(s.currentIndex).toBe(2);
    expect(s.turnsRemaining).toBe(3);
    s = applyKittensAction(s, 'c', { type: 'ek:draw' });
    expect(s.turnsRemaining).toBe(2);
    expect(s.currentIndex).toBe(2);
  });
  it('an Attack after fulfilling one of two rounds transfers three rounds', () => {
    let s = settle(play(fixture(), 'a', 'attack'));
    s = applyKittensAction(s, 'b', { type: 'ek:draw' });
    expect(s.turnsRemaining).toBe(1);
    expect(s.underAttack).toBe(true);
    s = settle(play(s, 'b', 'attack'));
    expect(s.turnsRemaining).toBe(3);
  });
  it('Nope works out of turn, cancels cards, and counter-Nope restores effects', () => {
    let s = play(fixture(), 'a', 'attack'),
      pendingId = s.pending!.id;
    s = applyKittensAction(s, 'b', {
      type: 'ek:nope',
      cardId: s.hands.b.find((c) => c.kind === 'nope')!.id,
      pendingId,
    });
    expect(s.pending!.nopes).toBe(1);
    expect(settle(s).currentIndex).toBe(0);
    s = applyKittensAction(s, 'a', {
      type: 'ek:nope',
      cardId: s.hands.a.find((c) => c.kind === 'nope')!.id,
      pendingId,
    });
    s = settle(s);
    expect(s.currentIndex).toBe(1);
    expect(s.turnsRemaining).toBe(2);
    expect(s.discard.map((c) => c.kind)).toEqual(['attack', 'nope', 'nope']);
  });
  it('expired/wrong response IDs, active draws during reactions and fake Nope cards are rejected', () => {
    let s = play(fixture(), 'a', 'skip');
    expect(() => applyKittensAction(s, 'a', { type: 'ek:draw' })).toThrow('完成');
    expect(() => applyKittensAction(s, 'b', { type: 'ek:allow', pendingId: 'old' })).toThrow('结束');
    expect(() =>
      applyKittensAction(s, 'b', { type: 'ek:nope', pendingId: s.pending!.id, cardId: s.hands.b[0].id }),
    ).toThrow('否决牌');
    s.pending!.deadline = Date.now() - 1;
    expect(() => applyKittensAction(s, 'b', { type: 'ek:allow', pendingId: s.pending!.id })).toThrow('结束');
    s = resolveKittensPending(s);
    expect(s.currentIndex).toBe(1);
  });
  it('future is private, survives refresh/acknowledgement and invalidates when the deck changes', () => {
    let s = settle(play(fixture(), 'a', 'future'));
    expect(getKittensView(s, 'a').future).toEqual(s.deck.slice(0, 3));
    expect(getKittensView(s, 'b').future).toEqual([]);
    expect(getKittensView(s, null).future).toEqual([]);
    expect(JSON.stringify(s.logs)).not.toContain(s.deck[0].id);
    s = applyKittensAction(s, 'a', { type: 'ek:continue' });
    expect(getKittensView(s, 'a').future).toHaveLength(3);
    s = settle(play(s, 'a', 'shuffle'));
    expect(getKittensView(s, 'a').future).toHaveLength(0);
  });
  it('Favor lets only the target choose a card; transfer identity is private', () => {
    let s = settle(play(fixture(), 'a', 'favor', { targetId: 'b' }));
    expect(s.phase).toBe('favor');
    expect(getKittensView(s, 'b').actorId).toBe('b');
    expect(() => applyKittensAction(s, 'a', { type: 'ek:give', cardId: s.hands.a[0].id })).toThrow('赠予');
    const id = s.hands.b[0].id;
    s = applyKittensAction(s, 'b', { type: 'ek:give', cardId: id });
    expect(s.hands.a.some((c) => c.id === id)).toBe(true);
    expect(s.hands.b.some((c) => c.id === id)).toBe(false);
    expect(JSON.stringify(s.logs)).not.toContain(id);
    expect(JSON.stringify(getKittensView(s, 'c'))).not.toContain(id);
    expect(s.currentIndex).toBe(0);
  });
  it('pairs of any title steal a server-random card; three of a kind request a type and may miss', () => {
    let s = fixture({
      a: ['shuffle', 'shuffle', 'taco', 'taco', 'taco'],
      b: ['defuse', 'nope'],
      c: ['taco'],
    });
    const pair = s.hands.a.filter((c) => c.kind === 'shuffle').map((c) => c.id);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    s = settle(applyKittensAction(s, 'a', { type: 'ek:play', cardIds: pair, targetId: 'b' }));
    expect(s.hands.a.some((c) => c.kind === 'defuse')).toBe(true);
    const before = s.hands.a.length;
    s = settle(
      applyKittensAction(s, 'a', {
        type: 'ek:play',
        cardIds: s.hands.a.filter((c) => c.kind === 'taco').map((c) => c.id),
        targetId: 'c',
        requestKind: 'defuse',
      }),
    );
    expect(s.hands.a).toHaveLength(before - 3);
  });
  it('Nope can stop a combo; cat, Defuse and Nope cannot be proactively played alone', () => {
    let s = fixture({ a: ['taco', 'taco', 'defuse', 'nope'], b: ['nope', 'defuse'] });
    for (const kind of ['taco', 'defuse', 'nope'] as const) expect(() => play(s, 'a', kind)).toThrow('单独');
    s = applyKittensAction(s, 'a', {
      type: 'ek:play',
      cardIds: s.hands.a.filter((c) => c.kind === 'taco').map((c) => c.id),
      targetId: 'b',
    });
    s = applyKittensAction(s, 'b', { type: 'ek:nope', pendingId: s.pending!.id, cardId: s.hands.b[0].id });
    s = settle(s);
    expect(s.hands.b).toHaveLength(1);
    expect(s.hands.a).toHaveLength(2);
  });
  it('Defuse consumes a real card, secret insertion is bounds checked and changes no other card order', () => {
    let s = fixture();
    s.deck.unshift(card('explode'));
    const bombId = s.deck[0].id;
    s = applyKittensAction(s, 'a', { type: 'ek:draw' });
    expect(s.phase).toBe('defuse');
    expect(getKittensView(s, 'b').hasBomb).toBe(true);
    expect(JSON.stringify(getKittensView(s, 'b'))).not.toContain(bombId);
    expect(() => applyKittensAction(s, 'a', { type: 'ek:defuse', cardId: s.hands.a[0].id })).toThrow(
      '拆弹牌',
    );
    s = applyKittensAction(s, 'a', {
      type: 'ek:defuse',
      cardId: s.hands.a.find((c) => c.kind === 'defuse')!.id,
    });
    expect(s.phase).toBe('insert');
    const order = s.deck.map((c) => c.id);
    expect(() => applyKittensAction(s, 'a', { type: 'ek:insert', index: -1 })).toThrow('无效');
    expect(() => applyKittensAction(s, 'b', { type: 'ek:insert', index: 0 })).toThrow('轮到');
    s = applyKittensAction(s, 'a', { type: 'ek:insert', index: 2 });
    expect(s.deck[2].id).toBe(bombId);
    expect(s.deck.filter((c) => c.id !== bombId).map((c) => c.id)).toEqual(order);
    expect(s.currentIndex).toBe(1);
    expect(JSON.stringify(s.events)).not.toContain('"index"');
  });
  it('Defuse fulfills only one attacked turn and elimination cancels all debt', () => {
    let s = fixture();
    s.currentIndex = 1;
    s.turnsRemaining = 4;
    s.underAttack = true;
    s.deck.unshift(card('explode'));
    s = applyKittensAction(s, 'b', { type: 'ek:draw' });
    s = applyKittensAction(s, 'b', {
      type: 'ek:defuse',
      cardId: s.hands.b.find((c) => c.kind === 'defuse')!.id,
    });
    s = applyKittensAction(s, 'b', { type: 'ek:insert', index: 0 });
    expect(s.currentIndex).toBe(1);
    expect(s.turnsRemaining).toBe(3);
    s = applyKittensAction(s, 'b', { type: 'ek:draw' });
    expect(s.alive).toEqual(['a', 'c']);
    expect(s.currentIndex).toBe(2);
    expect(s.turnsRemaining).toBe(1);
  });
  it('elimination preserves face-down cards privately and the final survivor wins', () => {
    let s = fixture({ a: ['taco'], b: ['melon'], c: ['rainbow'] });
    const privateId = s.hands.a[0].id;
    s.deck.unshift(card('explode'));
    s = applyKittensAction(s, 'a', { type: 'ek:draw' });
    expect(s.hands.a).toHaveLength(0);
    expect(s.eliminatedHands.a[0].id).toBe(privateId);
    expect(JSON.stringify(getKittensView(s, 'b'))).not.toContain(privateId);
    expect(() => applyKittensAction(s, 'a', { type: 'ek:draw' })).toThrow('淘汰');
    s.deck.unshift(card('explode'));
    s = applyKittensAction(s, 'b', { type: 'ek:draw' });
    expect(s.winnerId).toBe('c');
    expect(gameFinished(s)).toBe(true);
    expect(s.phase).toBe('finished');
  });
  for (const difficulty of ['easy', 'medium', 'hard'] as const)
    it(`${difficulty} AI finishes fair games without losing or duplicating cards`, () => {
      for (const n of [2, 3, 5]) {
        let s = createKittensState(Array.from({ length: n }, (_, i) => `p${i}`)),
          steps = 0;
        const initial = pool(s);
        while (!s.winnerId && steps++ < 2000) {
          const actor =
            s.phase === 'reaction'
              ? s.alive.find((id) => !s.pending!.allowed.includes(id))
              : s.phase === 'favor'
                ? s.favor!.from
                : s.players[s.currentIndex];
          if (!actor) {
            s = resolveKittensPending(s);
            continue;
          }
          const v = getKittensView(s, actor),
            action = kittens.aiMove(v, actor, difficulty);
          expect(kittens.getLegalActions(v, actor)).toContainEqual(action);
          s = applyKittensAction(s, actor, action);
          expect(pool(s)).toEqual(initial);
        }
        expect(s.winnerId).toBeTruthy();
        expect(steps).toBeLessThan(2000);
      }
    });
  it('maps all card types to authoritative audio and keeps plain draws anonymous', () => {
    for (const c of createDeck())
      expect(eventCues({ type: 'kitten-effect', playerId: 'a', kittenKind: c.kind })).toEqual([
        { effect: `ek-${c.kind}` },
      ]);
    expect(eventCues({ type: 'kitten-draw', playerId: 'a' })).toEqual([{ effect: 'ek-draw' }]);
    expect(eventCues({ type: 'kitten-effect', playerId: 'a', kittenKind: 'attack', canceled: true })).toEqual(
      [],
    );
  });
  it('AI saves attacks on safe draws and chooses equal opponents without a first-seat bias', () => {
    let s = fixture({ a: ['attack', 'skip', 'defuse'], b: ['taco'], c: ['melon'] });
    s.deck = Array.from({ length: 30 }, (_, i) => card('taco', `safe${i}`));
    for (const difficulty of ['medium', 'hard'] as const)
      expect(kittens.aiMove(getKittensView(s, 'a'), 'a', difficulty).type).toBe('ek:draw');
    s = fixture({ a: ['favor'], b: ['taco', 'melon', 'defuse'], c: ['taco', 'melon', 'defuse'] });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const first = kittens.aiMove(getKittensView(s, 'a'), 'a', 'hard');
    vi.mocked(Math.random).mockReturnValue(0.999);
    const second = kittens.aiMove(getKittensView(s, 'a'), 'a', 'hard');
    expect(first).toMatchObject({ type: 'ek:play', targetId: 'b' });
    expect(second).toMatchObject({ type: 'ek:play', targetId: 'c' });
    // Unknown opponents' private cards/deck order do not affect the selected strategy.
    s.hands.b = s.hands.b.map((c) => ({ ...c, kind: 'nope' }));
    s.deck.reverse();
    expect(kittens.aiMove(getKittensView(s, 'a'), 'a', 'hard')).toEqual(second);
  });
});
