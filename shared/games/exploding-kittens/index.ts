import type { GameDefinition } from '../definition.js';
import type { KittensAction, KittensState, KittensView, KittenCard, KittenEvent } from './types.js';
import { RESPONSE_MS, isCat, kittenInfo, kittenKinds } from './types.js';
import { createDeck, shuffle } from './cards.js';
import { kittensAI } from './ai.js';
export const kittensActor = (s: KittensState) =>
  s.phase === 'favor' ? s.favor!.from : s.players[s.currentIndex];
function touch(s: KittensState, seconds = 45) {
  s.turnNumber++;
  s.turnDeadline = Date.now() + seconds * 1000;
}
function emit(s: KittensState, event: Omit<KittenEvent, 'number'>, text: string) {
  const number = ++s.logSequence;
  s.events.push({ ...event, number });
  s.events = s.events.slice(-40);
  const type =
    event.type === 'play'
      ? 'kitten-play'
      : event.type === 'draw'
        ? 'kitten-draw'
        : event.type === 'explode'
          ? 'kitten-explode'
          : event.type === 'defuse'
            ? 'kitten-defuse'
            : event.type === 'insert'
              ? 'kitten-insert'
              : 'kitten-effect';
  s.logs.push({
    id: `ek-log-${number}`,
    text,
    event: {
      type,
      playerId: event.playerId,
      kittenKind: event.kind,
      count: event.cards?.length,
      canceled: event.type === 'effect' && event.canceled === true,
    },
  });
  s.logs = s.logs.slice(-80);
}
const nextSeat = (s: KittensState) => {
  for (let i = 1; i <= s.players.length; i++) {
    const index = (s.currentIndex + i) % s.players.length;
    if (s.alive.includes(s.players[index])) return index;
  }
  throw new Error('没有存活玩家');
};
function endUnit(s: KittensState) {
  if (s.turnsRemaining > 1) s.turnsRemaining--;
  else {
    s.currentIndex = nextSeat(s);
    s.turnsRemaining = 1;
    s.underAttack = false;
  }
  s.phase = 'playing';
  touch(s);
}
function requireTurn(s: KittensState, id: string) {
  if (s.players[s.currentIndex] !== id) throw new Error('还没轮到你');
}
function ownCards(s: KittensState, id: string, ids: string[]): KittenCard[] {
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error('请选择不同的手牌');
  const cards = ids.map((cardId) => s.hands[id].find((c) => c.id === cardId));
  if (cards.some((c) => !c)) throw new Error('只能使用自己的手牌');
  return cards as KittenCard[];
}
function consume(s: KittensState, id: string, cards: KittenCard[]) {
  const ids = new Set(cards.map((c) => c.id));
  s.hands[id] = s.hands[id].filter((c) => !ids.has(c.id));
  s.discard.push(...cards);
}
function transfer(s: KittensState, from: string, to: string, card: KittenCard) {
  s.hands[from] = s.hands[from].filter((c) => c.id !== card.id);
  s.hands[to].push(card);
}
export function createKittensState(players: string[]): KittensState {
  if (players.length < 2 || players.length > 5 || new Set(players).size !== players.length)
    throw new Error('炸弹猫需要 2–5 位不同玩家');
  const all = createDeck(),
    pool = shuffle(all.filter((c) => c.kind !== 'explode' && c.kind !== 'defuse'));
  const defuses = all.filter((c) => c.kind === 'defuse');
  const hands = Object.fromEntries(players.map((id, i) => [id, [defuses[i], ...pool.splice(0, 7)]]));
  const deck = shuffle([
    ...pool,
    ...defuses.slice(players.length, players.length + 2),
    ...all.filter((c) => c.kind === 'explode').slice(0, players.length - 1),
  ]);
  return {
    kind: 'exploding-kittens',
    players: [...players],
    alive: [...players],
    hands,
    deck,
    discard: [],
    eliminatedHands: {},
    currentIndex: 0,
    phase: 'playing',
    turnsRemaining: 1,
    underAttack: false,
    pending: null,
    favor: null,
    bomb: null,
    future: [],
    futureOwner: null,
    winnerId: null,
    turnNumber: 0,
    turnDeadline: Date.now() + 45000,
    logs: [],
    logSequence: 0,
    events: [],
  };
}
/** Timer resolution never sees or broadcasts private views. */
export function resolveKittensPending(state: KittensState): KittensState {
  if (state.phase !== 'reaction' || !state.pending) throw new Error('当前没有待处理卡牌');
  const s = structuredClone(state),
    p = s.pending!;
  s.pending = null;
  s.phase = 'playing';
  touch(s);
  const kind = p.cards[0].kind;
  emit(
    s,
    {
      type: 'effect',
      playerId: p.playerId,
      kind,
      cards: p.cards,
      targetId: p.targetId ?? undefined,
      canceled: p.nopes % 2 === 1,
    },
    p.nopes % 2 ? '卡牌效果被否决' : `${kittenInfo[kind].name}的效果生效`,
  );
  if (p.nopes % 2) return s;
  if (p.cards.length >= 2) {
    const hand = s.hands[p.targetId!];
    const card =
      p.cards.length === 2
        ? hand[Math.floor(Math.random() * hand.length)]
        : hand.find((c) => c.kind === p.requestKind);
    if (card) transfer(s, p.targetId!, p.playerId, card);
    emit(
      s,
      { type: 'give', playerId: p.targetId!, targetId: p.playerId },
      card ? '组合成功，转移了一张手牌' : '指定牌未找到，组合未获得手牌',
    );
    return s;
  }
  switch (kind) {
    case 'skip':
      endUnit(s);
      break;
    case 'attack': {
      const debt = s.underAttack ? s.turnsRemaining + 2 : 2;
      s.currentIndex = nextSeat(s);
      s.turnsRemaining = debt;
      s.underAttack = true;
      touch(s);
      break;
    }
    case 'shuffle':
      s.deck = shuffle(s.deck);
      s.future = [];
      s.futureOwner = null;
      break;
    case 'future':
      s.future = s.deck.slice(0, 3);
      s.futureOwner = p.playerId;
      s.phase = 'future';
      touch(s, 20);
      break;
    case 'favor':
      s.favor = { from: p.targetId!, to: p.playerId };
      s.phase = 'favor';
      touch(s, 20);
      break;
  }
  return s;
}
export function applyKittensAction(
  state: KittensState,
  playerId: string,
  action: KittensAction,
): KittensState {
  if (state.winnerId) throw new Error('对局已经结束');
  if (!state.alive.includes(playerId)) throw new Error('观战或已淘汰玩家无法操作');
  const s = structuredClone(state);
  if (action.type === 'ek:allow' || action.type === 'ek:nope') {
    if (s.phase !== 'reaction' || !s.pending || action.pendingId !== s.pending.id)
      throw new Error('响应窗口已结束');
    if (Date.now() >= s.pending.deadline) throw new Error('响应窗口已结束，请等待同步');
    if (action.type === 'ek:nope') {
      const cards = ownCards(s, playerId, [action.cardId]);
      if (cards[0].kind !== 'nope') throw new Error('只能用否决牌响应');
      consume(s, playerId, cards);
      s.pending.nopes++;
      s.pending.allowed = [playerId];
      s.pending.deadline = Date.now() + RESPONSE_MS;
      s.turnNumber++;
      s.turnDeadline = s.pending.deadline;
      emit(
        s,
        { type: 'nope', playerId, kind: 'nope', cards, canceled: s.pending.nopes % 2 === 1 },
        s.pending.nopes % 2 ? '否决！效果暂停' : '反否决！恢复效果',
      );
    } else {
      if (!s.pending.allowed.includes(playerId)) s.pending.allowed.push(playerId);
      if (s.alive.every((id) => s.pending!.allowed.includes(id))) return resolveKittensPending(s);
    }
    return s;
  }
  if (action.type === 'ek:give') {
    if (s.phase !== 'favor' || !s.favor || s.favor.from !== playerId) throw new Error('现在不是你赠予手牌');
    const card = ownCards(s, playerId, [action.cardId])[0],
      to = s.favor.to;
    transfer(s, playerId, to, card);
    s.favor = null;
    s.phase = 'playing';
    touch(s);
    emit(s, { type: 'give', playerId, targetId: to }, '完成索取，赠予了一张手牌');
    return s;
  }
  requireTurn(s, playerId);
  if (action.type === 'ek:continue') {
    if (s.phase !== 'future') throw new Error('没有等待确认的预知结果');
    s.phase = 'playing';
    touch(s);
    return s;
  }
  if (action.type === 'ek:defuse') {
    if (s.phase !== 'defuse' || !s.bomb) throw new Error('现在不需要拆弹');
    const cards = ownCards(s, playerId, [action.cardId]);
    if (cards[0].kind !== 'defuse') throw new Error('需要一张拆弹牌');
    consume(s, playerId, cards);
    s.phase = 'insert';
    touch(s, 20);
    emit(s, { type: 'defuse', playerId, kind: 'defuse', cards }, '拆弹成功，正在秘密放回炸弹');
    return s;
  }
  if (action.type === 'ek:insert') {
    if (s.phase !== 'insert' || !s.bomb) throw new Error('没有可放回的炸弹');
    if (!Number.isInteger(action.index) || action.index < 0 || action.index > s.deck.length)
      throw new Error('放回位置无效');
    s.deck.splice(action.index, 0, s.bomb);
    s.bomb = null;
    s.future = [];
    s.futureOwner = null;
    emit(s, { type: 'insert', playerId, kind: 'explode' }, '炸弹已秘密放回牌堆');
    endUnit(s);
    return s;
  }
  if (s.phase !== 'playing') throw new Error('请先完成当前响应或选择');
  if (action.type === 'ek:draw') {
    const card = s.deck.shift();
    if (!card) throw new Error('牌堆状态异常');
    s.future = [];
    s.futureOwner = null;
    emit(s, { type: 'draw', playerId }, '摸了一张牌');
    if (card.kind !== 'explode') {
      s.hands[playerId].push(card);
      endUnit(s);
      return s;
    }
    s.bomb = card;
    if (s.hands[playerId].some((c) => c.kind === 'defuse')) {
      s.phase = 'defuse';
      touch(s, 20);
      return s;
    }
    s.bomb = null;
    s.discard.push(card);
    s.alive = s.alive.filter((id) => id !== playerId);
    s.eliminatedHands[playerId] = s.hands[playerId];
    s.hands[playerId] = [];
    emit(
      s,
      { type: 'explode', playerId, kind: 'explode', cards: [card] },
      '摸到炸弹猫且没有拆弹牌，淘汰出局',
    );
    if (s.alive.length === 1) {
      s.winnerId = s.alive[0];
      s.phase = 'finished';
      touch(s);
      s.logs.push({
        id: `ek-log-${++s.logSequence}`,
        text: '最后一位幸存者获胜',
        event: { type: 'kitten-win', playerId: s.winnerId },
      });
    } else {
      s.currentIndex = nextSeat(s);
      s.turnsRemaining = 1;
      s.underAttack = false;
      s.phase = 'playing';
      touch(s);
    }
    return s;
  }
  if (action.type !== 'ek:play') throw new Error('动作不适用于当前阶段');
  const cards = ownCards(s, playerId, action.cardIds),
    kind = cards[0].kind;
  if (cards.length > 3 || cards.some((c) => c.kind !== kind)) throw new Error('组合需要两张或三张同名牌');
  if (cards.length === 1 && (kind === 'nope' || kind === 'defuse' || kind === 'explode' || isCat(kind)))
    throw new Error('这张牌不能单独主动出牌');
  const needsTarget = cards.length > 1 || kind === 'favor';
  if (
    needsTarget &&
    (!action.targetId ||
      action.targetId === playerId ||
      !s.alive.includes(action.targetId) ||
      !s.hands[action.targetId].length)
  )
    throw new Error('请选择有手牌的其他存活玩家');
  if (cards.length === 3 && (!action.requestKind || !kittenKinds.includes(action.requestKind)))
    throw new Error('三张组合需要指定索取牌型');
  if ((!needsTarget && action.targetId) || (cards.length !== 3 && action.requestKind))
    throw new Error('该动作不需要此目标参数');
  consume(s, playerId, cards);
  s.phase = 'reaction';
  s.turnNumber++;
  s.pending = {
    id: `ek-pending-${s.turnNumber}`,
    playerId,
    cards,
    targetId: action.targetId ?? null,
    requestKind: action.requestKind ?? null,
    nopes: 0,
    allowed: [playerId],
    deadline: Date.now() + RESPONSE_MS,
  };
  s.turnDeadline = s.pending.deadline;
  emit(
    s,
    { type: 'play', playerId, kind, cards, targetId: action.targetId },
    `打出${cards.length > 1 ? `${cards.length}张同名组合` : kittenInfo[kind].name}，等待否决响应`,
  );
  return s;
}
export function getKittensView(s: KittensState, id: string | null): KittensView {
  const { hands, deck, eliminatedHands: _grave, bomb, future, ...visible } = s;
  return structuredClone({
    ...visible,
    hand: id && s.alive.includes(id) ? hands[id] : [],
    handCounts: Object.fromEntries(s.players.map((p) => [p, hands[p].length])),
    deckCount: deck.length,
    currentPlayerId: s.players[s.currentIndex],
    actorId: kittensActor(s),
    future: id !== null && id === s.futureOwner && s.alive.includes(id) ? future : [],
    hasBomb: !!bomb,
  });
}
export function kittensLegalActions(view: KittensView, id: string): KittensAction[] {
  if (view.winnerId || !view.alive.includes(id)) return [];
  if (view.phase === 'reaction' && view.pending)
    return [
      ...(!view.pending.allowed.includes(id)
        ? [{ type: 'ek:allow' as const, pendingId: view.pending.id }]
        : []),
      ...view.hand
        .filter((c) => c.kind === 'nope')
        .map((c) => ({ type: 'ek:nope' as const, cardId: c.id, pendingId: view.pending!.id })),
    ];
  if (id !== view.actorId) return [];
  if (view.phase === 'favor') return view.hand.map((c) => ({ type: 'ek:give', cardId: c.id }));
  if (view.phase === 'defuse')
    return view.hand.filter((c) => c.kind === 'defuse').map((c) => ({ type: 'ek:defuse', cardId: c.id }));
  if (view.phase === 'insert')
    return Array.from({ length: view.deckCount + 1 }, (_, index) => ({ type: 'ek:insert', index }));
  if (view.phase === 'future') return [{ type: 'ek:continue' }];
  const actions: KittensAction[] = [{ type: 'ek:draw' }];
  const targets = view.alive.filter((p) => p !== id && view.handCounts[p] > 0);
  for (const kind of kittenKinds) {
    const cards = view.hand.filter((c) => c.kind === kind);
    if (!cards.length) continue;
    if (['attack', 'skip', 'shuffle', 'future'].includes(kind))
      actions.push({ type: 'ek:play', cardIds: [cards[0].id] });
    if (kind === 'favor')
      for (const targetId of targets) actions.push({ type: 'ek:play', cardIds: [cards[0].id], targetId });
    if (cards.length >= 2)
      for (const targetId of targets) {
        actions.push({ type: 'ek:play', cardIds: cards.slice(0, 2).map((c) => c.id), targetId });
        if (cards.length >= 3)
          for (const requestKind of kittenKinds.filter((k) => k !== 'explode'))
            actions.push({
              type: 'ek:play',
              cardIds: cards.slice(0, 3).map((c) => c.id),
              targetId,
              requestKind,
            });
      }
  }
  return actions;
}
export const kittens: GameDefinition<KittensState, KittensAction, KittensView> = {
  id: 'exploding-kittens',
  name: '炸弹猫',
  minPlayers: 2,
  maxPlayers: 5,
  createState: createKittensState,
  applyAction: applyKittensAction,
  getView: getKittensView,
  getLegalActions: kittensLegalActions,
  aiMove: kittensAI,
};
