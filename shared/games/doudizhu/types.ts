import type { GameLog } from '../../types.js';
export type Suit = 'spades' | 'hearts' | 'clubs' | 'diamonds' | 'joker';
export interface PokerCard {
  id: string;
  rank: number;
  suit: Suit;
}
export type ComboKind =
  | 'single'
  | 'pair'
  | 'triple'
  | 'triple-single'
  | 'triple-pair'
  | 'straight'
  | 'pair-straight'
  | 'plane'
  | 'plane-single'
  | 'plane-pair'
  | 'four-single'
  | 'four-pair'
  | 'bomb'
  | 'rocket';
export interface Combination {
  kind: ComboKind;
  mainRank: number;
  length: number;
  chainLength: number;
}
export type DoudizhuAction =
  { type: 'bid'; value: 0 | 1 | 2 | 3 } | { type: 'play'; cardIds: string[] } | { type: 'pass' };
export interface DoudizhuMove {
  number: number;
  playerId: string;
  cards: PokerCard[];
  combination: Combination | null;
}
export interface Trick {
  playerId: string;
  cards: PokerCard[];
  combination: Combination;
}
export interface DoudizhuState {
  kind: 'doudizhu';
  players: string[];
  hands: Record<string, PokerCard[]>;
  kitty: PokerCard[];
  phase: 'bidding' | 'playing' | 'finished';
  currentIndex: number;
  firstBidderIndex: number;
  bidRound: number;
  bids: { playerId: string; value: number }[];
  highestBid: number;
  highestBidder: string | null;
  landlordId: string | null;
  trick: Trick | null;
  passes: number;
  moves: DoudizhuMove[];
  playCounts: Record<string, number>;
  bombs: number;
  multiplier: number;
  spring: 'spring' | 'counter-spring' | null;
  winnerId: string | null;
  winnerIds: string[];
  winningTeam: 'landlord' | 'farmers' | null;
  scores: Record<string, number>;
  turnNumber: number;
  turnDeadline: number;
  logs: GameLog[];
  logSequence: number;
}
export interface DoudizhuView extends Omit<DoudizhuState, 'hands' | 'kitty'> {
  hand: PokerCard[];
  handCounts: Record<string, number>;
  kitty: PokerCard[];
  currentPlayerId: string;
  revealedHands: Record<string, PokerCard[]> | null;
}
export const comboNames: Record<ComboKind, string> = {
  single: '单张',
  pair: '对子',
  triple: '三张',
  'triple-single': '三带一',
  'triple-pair': '三带二',
  straight: '顺子',
  'pair-straight': '连对',
  plane: '飞机',
  'plane-single': '飞机带单张',
  'plane-pair': '飞机带对子',
  'four-single': '四带二',
  'four-pair': '四带两对',
  bomb: '炸弹',
  rocket: '火箭',
};
export const rankName = (rank: number) =>
  (({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王' }) as Record<number, string>)[
    rank
  ] ?? String(rank);
