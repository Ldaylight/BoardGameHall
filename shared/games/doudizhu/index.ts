import type { GameDefinition } from '../definition.js';
import type { DoudizhuState, DoudizhuView, DoudizhuAction } from './types.js';
import { deck, shuffle, sortCards } from './cards.js';
import { beats, classify, legalPlays } from './rules.js';
import { aiMove } from './ai.js';
import { comboNames } from './types.js';
export * from './types.js';
export const doudizhuEntry = { id: 'doudizhu', status: 'available' } as const;
const clock = (s: DoudizhuState) => {
  s.turnDeadline = Date.now() + (s.phase === 'bidding' ? 20000 : 45000);
};
function log(s: DoudizhuState, text: string, event?: import('../../types.js').GameLog['event']) {
  s.logs.push({ id: `ddz-${++s.logSequence}`, text, event });
  s.logs = s.logs.slice(-60);
}
function deal(s: DoudizhuState) {
  const cards = shuffle(deck());
  s.hands = Object.fromEntries(s.players.map((id, i) => [id, sortCards(cards.slice(i * 17, (i + 1) * 17))]));
  s.kitty = cards.slice(51);
  s.bids = [];
  s.highestBid = 0;
  s.highestBidder = null;
  s.currentIndex = s.firstBidderIndex;
  clock(s);
}
export const doudizhu: GameDefinition<DoudizhuState, DoudizhuAction, DoudizhuView> = {
  id: 'doudizhu',
  name: '斗地主',
  minPlayers: 3,
  maxPlayers: 3,
  createState(players) {
    if (players.length !== 3 || new Set(players).size !== 3) throw new Error('斗地主需要 3 位不同玩家');
    const state: DoudizhuState = {
      kind: 'doudizhu',
      players: [...players],
      hands: {},
      kitty: [],
      phase: 'bidding',
      currentIndex: 0,
      firstBidderIndex: Math.floor(Math.random() * 3),
      bidRound: 0,
      bids: [],
      highestBid: 0,
      highestBidder: null,
      landlordId: null,
      trick: null,
      passes: 0,
      moves: [],
      playCounts: Object.fromEntries(players.map((p) => [p, 0])),
      bombs: 0,
      multiplier: 1,
      spring: null,
      winnerId: null,
      winnerIds: [],
      winningTeam: null,
      scores: {},
      turnNumber: 0,
      turnDeadline: 0,
      logs: [],
      logSequence: 0,
    };
    deal(state);
    log(state, '每人 17 张，三张底牌暂不公开。开始叫分。');
    return state;
  },
  applyAction(state, playerId, action) {
    if (state.phase === 'finished') throw new Error('对局已结束');
    if (state.players[state.currentIndex] !== playerId) throw new Error('还没有轮到你');
    const s = structuredClone(state);
    if (s.phase === 'bidding') {
      if (
        action.type !== 'bid' ||
        ![0, 1, 2, 3].includes(action.value) ||
        (action.value !== 0 && action.value <= s.highestBid)
      )
        throw new Error('请选择不叫，或比当前更高的分数');
      s.bids.push({ playerId, value: action.value });
      if (action.value > 0) {
        s.highestBid = action.value;
        s.highestBidder = playerId;
      }
      log(s, `座位 ${s.currentIndex + 1} ${action.value ? `叫 ${action.value} 分` : '不叫'}`, {
        type: 'ddz-bid',
        playerId,
      });
      s.turnNumber++;
      if (action.value === 3 || s.bids.length === 3) {
        if (!s.highestBidder) {
          s.firstBidderIndex = (s.firstBidderIndex + 1) % 3;
          s.bidRound++;
          deal(s);
          log(s, '三家不叫，重新洗牌并轮换首叫者。', { type: 'ddz-deal', playerId });
          return s;
        }
        s.landlordId = s.highestBidder;
        s.currentIndex = s.players.indexOf(s.landlordId);
        s.hands[s.landlordId] = sortCards([...s.hands[s.landlordId], ...s.kitty]);
        s.phase = 'playing';
        log(s, `座位 ${s.currentIndex + 1} 成为地主，获得三张底牌并先出。`, {
          type: 'ddz-landlord',
          playerId: s.landlordId,
        });
      } else s.currentIndex = (s.currentIndex + 1) % 3;
      clock(s);
      return s;
    }
    if (action.type === 'pass') {
      if (!s.trick || s.trick.playerId === playerId) throw new Error('首出时不能不出');
      s.passes++;
      s.turnNumber++;
      s.moves.push({ number: s.turnNumber, playerId, cards: [], combination: null });
      log(s, `座位 ${s.currentIndex + 1} 不出`, { type: 'ddz-pass', playerId });
      if (s.passes === 2) {
        s.currentIndex = s.players.indexOf(s.trick.playerId);
        s.trick = null;
        s.passes = 0;
      } else s.currentIndex = (s.currentIndex + 1) % 3;
      clock(s);
      return s;
    }
    if (
      action.type !== 'play' ||
      !Array.isArray(action.cardIds) ||
      !action.cardIds.length ||
      new Set(action.cardIds).size !== action.cardIds.length
    )
      throw new Error('请选择要出的手牌');
    const cards = action.cardIds.map((id) => s.hands[playerId].find((c) => c.id === id));
    if (cards.some((c) => !c)) throw new Error('只能打出自己的手牌');
    const selected = sortCards(cards as import('./types.js').PokerCard[]),
      combo = classify(selected);
    if (!combo || !beats(combo, s.trick?.combination ?? null)) throw new Error('牌型无效，或无法压过上一手');
    s.hands[playerId] = s.hands[playerId].filter((c) => !action.cardIds.includes(c.id));
    s.trick = { playerId, cards: selected, combination: combo };
    s.passes = 0;
    s.playCounts[playerId]++;
    s.turnNumber++;
    s.moves.push({ number: s.turnNumber, playerId, cards: selected, combination: combo });
    if (combo.kind === 'bomb' || combo.kind === 'rocket') {
      s.bombs++;
      s.multiplier *= 2;
    }
    log(s, `座位 ${s.currentIndex + 1} 打出${comboNames[combo.kind]}，剩 ${s.hands[playerId].length} 张`, {
      type: 'ddz-play',
      playerId,
      combo: combo.kind,
      count: selected.length,
    });
    if (!s.hands[playerId].length) {
      s.phase = 'finished';
      s.winnerId = playerId;
      const landlordWins = playerId === s.landlordId;
      s.winningTeam = landlordWins ? 'landlord' : 'farmers';
      s.winnerIds = s.players.filter((p) => (landlordWins ? p === s.landlordId : p !== s.landlordId));
      if (landlordWins && s.players.filter((p) => p !== s.landlordId).every((p) => s.playCounts[p] === 0))
        s.spring = 'spring';
      if (!landlordWins && s.playCounts[s.landlordId!] === 1) s.spring = 'counter-spring';
      if (s.spring) s.multiplier *= 2;
      const points = s.highestBid * s.multiplier;
      s.scores = Object.fromEntries(
        s.players.map((p) => [p, (p === s.landlordId ? 2 : 1) * points * (s.winnerIds.includes(p) ? 1 : -1)]),
      );
      log(s, `${landlordWins ? '地主' : '农民'} 获胜${s.spring ? '，春天翻倍' : ''}`, {
        type: 'ddz-win',
        playerId,
      });
    } else {
      s.currentIndex = (s.currentIndex + 1) % 3;
      clock(s);
    }
    return s;
  },
  getView(state, playerId) {
    const { hands, kitty, ...publicState } = structuredClone(state);
    return {
      ...publicState,
      hand: playerId ? (hands[playerId] ?? []) : [],
      handCounts: Object.fromEntries(state.players.map((p) => [p, hands[p].length])),
      kitty: state.phase === 'bidding' ? [] : kitty,
      currentPlayerId: state.players[state.currentIndex],
      revealedHands: state.phase === 'finished' ? hands : null,
    };
  },
  getLegalActions(view, playerId) {
    if (view.phase === 'finished' || view.currentPlayerId !== playerId || !view.hand.length) return [];
    if (view.phase === 'bidding')
      return [0, 1, 2, 3]
        .filter((v) => !v || v > view.highestBid)
        .map((value) => ({ type: 'bid', value: value as 0 | 1 | 2 | 3 }));
    return [
      ...legalPlays(view.hand, view.trick?.combination ?? null).map((cards) => ({
        type: 'play' as const,
        cardIds: cards.map((c) => c.id),
      })),
      ...(view.trick ? [{ type: 'pass' as const }] : []),
    ];
  },
  aiMove,
};
