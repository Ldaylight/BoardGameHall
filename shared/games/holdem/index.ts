import type { GameDefinition } from '../definition.js';
import type {
  HoldemAction,
  HoldemState,
  HoldemView,
  HoldemOptions,
  HoldemEvent,
  HandResult,
} from './types.js';
import { defaultHoldemOptions } from './types.js';
import { createDeck, shuffle } from './cards.js';
import { evaluateHand, compareRanks, makeSidePots, raiseAllowed, canBet } from './rules.js';
import { aiMove } from './ai.js';
const zero = (players: string[]) => Object.fromEntries(players.map((id) => [id, 0]));
const nextIndex = (s: HoldemState, index: number, ids = s.alive) => {
  for (let i = 1; i <= s.players.length; i++) {
    const n = (index + i) % s.players.length;
    if (ids.includes(s.players[n])) return n;
  }
  throw Error('没有可行动的玩家');
};
const contenders = (s: HoldemState) => s.alive.filter((id) => !s.folded.includes(id));
const bettors = (s: HoldemState) => contenders(s).filter((id) => s.stacks[id] > 0);
function touch(s: HoldemState, seconds = s.options.turnSeconds) {
  s.turnNumber++;
  s.turnDeadline = Date.now() + seconds * 1000;
}
function emit(s: HoldemState, e: Omit<HoldemEvent, 'number'>, text: string) {
  const number = ++s.logSequence;
  s.events.push({ ...e, number });
  s.events = s.events.slice(-60);
  s.logs.push({
    id: `poker-log-${number}`,
    text,
    event: { type: `poker-${e.type}`, playerId: e.playerId, count: e.amount },
  });
  s.logs = s.logs.slice(-100);
}
function invest(s: HoldemState, id: string, amount: number) {
  const paid = Math.min(amount, s.stacks[id]);
  s.stacks[id] -= paid;
  s.bets[id] += paid;
  s.contributions[id] += paid;
  s.pot += paid;
  if (!s.stacks[id] && !s.allIn.includes(id)) s.allIn.push(id);
  return paid;
}
/** Unmatched excess is returned before side pots, including against a folded opponent. */
function refund(s: HoldemState) {
  const entries = Object.entries(s.contributions).sort((a, b) => b[1] - a[1]);
  if (entries[0][1] > entries[1][1]) {
    const [id, amount] = entries[0],
      extra = amount - entries[1][1];
    s.contributions[id] -= extra;
    s.bets[id] = Math.max(0, s.bets[id] - extra);
    s.stacks[id] += extra;
    s.pot -= extra;
    s.allIn = s.allIn.filter((p) => p !== id);
  }
}
function finishHand(s: HoldemState) {
  refund(s);
  const live = contenders(s),
    uncontested = live.length === 1;
  const ranks = Object.fromEntries(
    uncontested ? [] : live.map((id) => [id, evaluateHand([...s.hands[id], ...s.community])]),
  );
  const revealed = Object.fromEntries(uncontested ? [] : live.map((id) => [id, [...s.hands[id]]]));
  const pots = makeSidePots(s.contributions, s.folded),
    payouts = zero(s.players);
  for (const pot of pots) {
    if (!pot.eligible.length) throw Error('底池没有合法获奖者');
    const best = uncontested
      ? live[0]
      : [...pot.eligible].sort((a, b) => compareRanks(ranks[b], ranks[a]))[0];
    pot.winners = uncontested
      ? [best]
      : pot.eligible.filter((id) => compareRanks(ranks[id], ranks[best]) === 0);
    const ordered = Array.from(
      { length: s.players.length },
      (_, i) => s.players[(s.dealerIndex + i + 1) % s.players.length],
    ).filter((id) => pot.winners.includes(id));
    const share = Math.floor(pot.amount / ordered.length),
      remainder = pot.amount % ordered.length;
    ordered.forEach((id, i) => (payouts[id] += share + (i < remainder ? 1 : 0)));
  }
  for (const id of s.players) s.stacks[id] += payouts[id];
  const result: HandResult = {
    handNumber: s.handNumber,
    community: [...s.community],
    payouts,
    pots,
    ranks,
    revealed,
    uncontested,
    stacks: { ...s.stacks },
  };
  s.readyPlayers = [];
  s.lastResult = result;
  s.history.push(result);
  s.pot = 0;
  s.alive = s.players.filter((id) => s.stacks[id] > 0);
  emit(
    s,
    {
      type: 'payout',
      playerId: live[0],
      winners: s.players.filter((id) => payouts[id] > 0),
      amount: Object.values(payouts).reduce((a, b) => a + b, 0),
    },
    uncontested ? '其余玩家弃牌，本手无需亮牌' : '摊牌结算，主池与边池分别分配',
  );
  if (s.alive.length === 1) {
    s.winnerId = s.alive[0];
    s.phase = 'finished';
    touch(s);
  } else {
    s.phase = 'showdown';
    s.currentIndex = nextIndex(s, s.dealerIndex);
    touch(s);
    s.turnDeadline = 0;
  }
}
function dealStreet(s: HoldemState) {
  s.burned.push(s.deck.shift()!);
  const count = s.street === 'preflop' ? 3 : 1;
  s.street = s.street === 'preflop' ? 'flop' : s.street === 'flop' ? 'turn' : 'river';
  const cards = s.deck.splice(0, count);
  s.community.push(...cards);
  s.bets = zero(s.players);
  s.actedAt = Object.fromEntries(s.players.map((id) => [id, null]));
  s.checked = [];
  s.currentBet = 0;
  s.minRaise = s.bigBlind;
  emit(
    s,
    { type: 'board', playerId: s.players[s.dealerIndex], street: s.street, cards },
    `发出${count}张公共牌`,
  );
}
function advance(s: HoldemState) {
  if (contenders(s).length === 1) {
    finishHand(s);
    return;
  }
  const active = bettors(s),
    owing = active.filter((id) => s.bets[id] < s.currentBet);
  if (active.length <= 1 && owing.length === 0) {
    while (s.community.length < 5) dealStreet(s);
    finishHand(s);
    return;
  }
  if (active.every((id) => s.actedAt[id] !== null && s.bets[id] === s.currentBet)) {
    if (s.street === 'river') {
      finishHand(s);
      return;
    }
    dealStreet(s);
    s.currentIndex = nextIndex(s, s.dealerIndex, bettors(s));
  } else
    s.currentIndex = nextIndex(
      s,
      s.currentIndex,
      active.filter((id) => s.actedAt[id] === null || s.bets[id] < s.currentBet),
    );
  touch(s);
}
function beginHand(s: HoldemState, first = false) {
  if (!first) {
    // Preserve the next big blind through eliminations, including the transition to heads-up.
    const bb = nextIndex(s, s.players.indexOf(s.bigBlindId));
    const previousAlive = (index: number) => {
      for (let n = 1; n <= s.players.length; n++) {
        const previous = (index - n + s.players.length) % s.players.length;
        if (s.alive.includes(s.players[previous])) return previous;
      }
      throw Error('没有存活玩家');
    };
    const sb = previousAlive(bb);
    s.dealerIndex = s.alive.length === 2 ? sb : previousAlive(sb);
  }
  s.readyPlayers = [];
  s.handNumber++;
  const multiplier = 2 ** Math.min(14, Math.floor((s.handNumber - 1) / s.options.blindEvery));
  s.smallBlind = s.options.smallBlind * multiplier;
  s.bigBlind = s.smallBlind * 2;
  s.deck = shuffle(createDeck());
  s.burned = [];
  s.community = [];
  s.hands = Object.fromEntries(s.players.map((id) => [id, []]));
  s.folded = [];
  s.allIn = [];
  s.bets = zero(s.players);
  s.contributions = zero(s.players);
  s.actedAt = Object.fromEntries(s.players.map((id) => [id, null]));
  s.checked = [];
  s.phase = 'betting';
  s.street = 'preflop';
  s.currentBet = s.bigBlind;
  s.minRaise = s.bigBlind;
  s.pot = 0;
  const sb = s.alive.length === 2 ? s.dealerIndex : nextIndex(s, s.dealerIndex),
    bb = nextIndex(s, sb);
  s.smallBlindId = s.players[sb];
  s.bigBlindId = s.players[bb];
  let index = s.dealerIndex;
  for (let round = 0; round < 2; round++)
    for (let n = 0; n < s.alive.length; n++) {
      index = nextIndex(s, index);
      s.hands[s.players[index]].push(s.deck.shift()!);
    }
  emit(
    s,
    { type: 'deal', playerId: s.players[s.dealerIndex] },
    `第 ${s.handNumber} 手发牌，盲注 ${s.smallBlind}/${s.bigBlind}`,
  );
  for (const [id, blind] of [
    [s.smallBlindId, s.smallBlind],
    [s.bigBlindId, s.bigBlind],
  ] as [string, number][])
    emit(s, { type: 'blind', playerId: id, amount: invest(s, id, blind) }, '自动投入盲注');
  s.currentIndex = bb;
  const active = bettors(s);
  if (active.length <= 1 && active.every((id) => s.bets[id] >= Math.max(...Object.values(s.bets)))) {
    while (s.community.length < 5) dealStreet(s);
    finishHand(s);
  } else {
    s.currentIndex = nextIndex(s, bb, active);
    touch(s);
  }
}
export function normalizeHoldemOptions(options?: Partial<HoldemOptions>): HoldemOptions {
  const config = { ...defaultHoldemOptions, ...options };
  if (
    !Number.isInteger(config.startingStack) ||
    config.startingStack < 100 ||
    config.startingStack > 10000 ||
    !Number.isInteger(config.smallBlind) ||
    config.smallBlind < 1 ||
    config.smallBlind * 2 > config.startingStack ||
    !Number.isInteger(config.blindEvery) ||
    config.blindEvery < 1 ||
    config.blindEvery > 20 ||
    !Number.isInteger(config.turnSeconds) ||
    config.turnSeconds < 15 ||
    config.turnSeconds > 120
  )
    throw Error('德州牌桌配置无效');
  return config;
}
export function createHoldemState(players: string[], options?: Partial<HoldemOptions>): HoldemState {
  if (players.length < 2 || players.length > 6 || new Set(players).size !== players.length)
    throw Error('德州扑克需要 2–6 位不同玩家');
  const config = normalizeHoldemOptions(options);
  const s: HoldemState = {
    kind: 'holdem',
    players: [...players],
    alive: [...players],
    folded: [],
    allIn: [],
    deck: [],
    hands: {},
    burned: [],
    community: [],
    stacks: Object.fromEntries(players.map((id) => [id, config.startingStack])),
    contributions: {},
    bets: {},
    actedAt: {},
    checked: [],
    dealerIndex: 0,
    smallBlindId: '',
    bigBlindId: '',
    currentIndex: 0,
    street: 'preflop',
    phase: 'betting',
    currentBet: 0,
    minRaise: 0,
    smallBlind: 0,
    bigBlind: 0,
    pot: 0,
    handNumber: 0,
    turnNumber: 0,
    turnDeadline: 0,
    readyPlayers: [],
    winnerId: null,
    options: config,
    lastResult: null,
    history: [],
    events: [],
    logs: [],
    logSequence: 0,
  };
  beginHand(s, true);
  return s;
}
export function applyHoldemAction(state: HoldemState, id: string, action: HoldemAction): HoldemState {
  if (!state.players.includes(id)) throw Error('观战玩家不能操作');
  if (action.type === 'poker:ready') {
    if (state.phase === 'betting') throw Error('本手尚未结束');
    if (!state.winnerId && !state.alive.includes(id)) throw Error('已淘汰玩家无需准备下一手');
    const s = structuredClone(state);
    s.readyPlayers = action.ready
      ? [...new Set([...s.readyPlayers, id])]
      : s.readyPlayers.filter((p) => p !== id);
    if (!s.winnerId && s.alive.every((p) => s.readyPlayers.includes(p))) beginHand(s);
    else if (!s.winnerId)
      s.currentIndex = s.players.indexOf(s.alive.find((p) => !s.readyPlayers.includes(p))!);
    return s;
  }
  if (state.winnerId) throw Error('比赛已经结束');
  const s = structuredClone(state);
  if (action.type === 'poker:next') {
    if (s.phase !== 'showdown') throw Error('本手尚未结束');
    if (!s.alive.every((p) => s.readyPlayers.includes(p))) throw Error('请等待所有存活玩家准备');
    beginHand(s);
    return s;
  }
  if (
    s.phase !== 'betting' ||
    s.players[s.currentIndex] !== id ||
    s.folded.includes(id) ||
    !s.alive.includes(id) ||
    !s.stacks[id]
  )
    throw Error('还没轮到你行动');
  const owed = Math.max(0, s.currentBet - s.bets[id]),
    max = s.bets[id] + s.stacks[id];
  const type = action.type.slice(6) as HoldemEvent['type'];
  let paid = 0;
  if (action.type === 'poker:fold') s.folded.push(id);
  else if (action.type === 'poker:check') {
    if (owed) throw Error('需要跟注，不能过牌');
    s.checked.push(id);
  } else if (action.type === 'poker:call') {
    if (!owed) throw Error('当前无需跟注，请过牌');
    paid = invest(s, id, owed);
    s.checked = s.checked.filter((p) => p !== id);
  } else if (action.type === 'poker:raise' || action.type === 'poker:all-in') {
    const target = action.type === 'poker:raise' ? action.amount : max;
    if (
      !Number.isInteger(target) ||
      target > max ||
      target <= s.bets[id] ||
      (action.type === 'poker:raise' && target <= s.currentBet)
    )
      throw Error('加注金额无效，请输入本轮总额');
    if (target > s.currentBet) {
      if (!raiseAllowed(s, id) || bettors(s).filter((p) => p !== id).length === 0)
        throw Error('短码全下未重新开放加注，或对手均已全下');
      const increase = target - s.currentBet;
      if (increase < s.minRaise && target !== max) throw Error('未达到最小加注，只能全下例外');
      if (increase >= s.minRaise) {
        s.minRaise = increase;
        s.actedAt = Object.fromEntries(s.players.map((p) => [p, null]));
        s.checked = [];
      }
      s.currentBet = target;
    }
    paid = invest(s, id, target - s.bets[id]);
    s.checked = s.checked.filter((p) => p !== id);
  } else throw Error('德州扑克不支持此动作');
  const labels: Partial<Record<HoldemEvent['type'], string>> = {
    fold: '弃牌',
    check: '过牌',
    call: '跟注',
    raise: '加注',
    'all-in': '全下',
  };
  s.actedAt[id] = s.currentBet;
  emit(s, { type, playerId: id, amount: paid, street: s.street }, `${labels[type]}${paid ? ` ${paid}` : ''}`);
  advance(s);
  return s;
}
export function getHoldemView(s: HoldemState, id: string | null): HoldemView {
  const { deck, hands, burned: _burned, ...publicState } = s;
  const own = id && s.players.includes(id) ? hands[id] : [],
    pid = id ?? '';
  return structuredClone({
    ...publicState,
    hand: own,
    currentPlayerId: s.players[s.currentIndex],
    dealerId: s.players[s.dealerIndex],
    callAmount: Math.min(s.stacks[pid] ?? 0, Math.max(0, s.currentBet - (s.bets[pid] ?? 0))),
    minRaiseTo: s.currentBet + s.minRaise,
    maxRaiseTo: (s.bets[pid] ?? 0) + (s.stacks[pid] ?? 0),
    canRaise: !!id && s.phase === 'betting' && raiseAllowed(s, id) && bettors(s).some((p) => p !== id),
    handCounts: Object.fromEntries(s.players.map((p) => [p, hands[p].length])),
    revealed: s.phase !== 'betting' ? (s.lastResult?.revealed ?? {}) : {},
    deckCount: deck.length,
  });
}
export function holdemLegalActions(v: HoldemView, id: string): HoldemAction[] {
  if (v.phase !== 'betting' && v.players.includes(id) && (v.winnerId || v.alive.includes(id)))
    return v.readyPlayers.includes(id) ? [] : [{ type: 'poker:ready', ready: true }];
  if (!canBet(v, id)) return [];
  const actions: HoldemAction[] = [
    { type: 'poker:fold' },
    { type: v.callAmount ? 'poker:call' : 'poker:check' },
  ];
  if (v.maxRaiseTo <= v.currentBet || v.canRaise) actions.push({ type: 'poker:all-in' });
  if (v.canRaise && v.maxRaiseTo >= v.minRaiseTo) actions.push({ type: 'poker:raise', amount: v.minRaiseTo });
  return actions;
}
export const holdem: GameDefinition<HoldemState, HoldemAction, HoldemView, Partial<HoldemOptions>> = {
  id: 'holdem',
  name: '德州扑克',
  minPlayers: 2,
  maxPlayers: 6,
  createState: createHoldemState,
  applyAction: applyHoldemAction,
  getView: getHoldemView,
  getLegalActions: holdemLegalActions,
  aiMove,
};
export const holdemEntry = { id: 'holdem', status: 'available', realMoney: false } as const;
