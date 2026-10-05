import type { GameLog } from '../../types.js';
export type Suit = 'spades' | 'hearts' | 'clubs' | 'diamonds';
export interface HoldemCard {
  id: string;
  rank: number;
  suit: Suit;
}
export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type HoldemAction =
  | { type: 'poker:fold' | 'poker:check' | 'poker:call' | 'poker:all-in' | 'poker:next' }
  | { type: 'poker:raise'; amount: number }
  | { type: 'poker:ready'; ready: boolean };
export interface HoldemOptions {
  startingStack: number;
  smallBlind: number;
  blindEvery: number;
  turnSeconds: number;
}
export const defaultHoldemOptions: HoldemOptions = {
  startingStack: 1000,
  smallBlind: 10,
  blindEvery: 4,
  turnSeconds: 45,
};
export interface HandRank {
  category: number;
  values: number[];
  name: string;
  cards: HoldemCard[];
}
export interface SidePot {
  amount: number;
  eligible: string[];
  winners: string[];
}
export interface HoldemEvent {
  number: number;
  type: 'deal' | 'blind' | 'fold' | 'check' | 'call' | 'raise' | 'all-in' | 'board' | 'payout';
  playerId: string;
  amount?: number;
  street?: Street;
  cards?: HoldemCard[];
  winners?: string[];
}
export interface HandResult {
  handNumber: number;
  community: HoldemCard[];
  payouts: Record<string, number>;
  pots: SidePot[];
  ranks: Record<string, HandRank>;
  revealed: Record<string, HoldemCard[]>;
  uncontested: boolean;
  stacks: Record<string, number>;
}
export interface HoldemState {
  kind: 'holdem';
  players: string[];
  alive: string[];
  folded: string[];
  allIn: string[];
  deck: HoldemCard[];
  hands: Record<string, HoldemCard[]>;
  burned: HoldemCard[];
  community: HoldemCard[];
  stacks: Record<string, number>;
  contributions: Record<string, number>;
  bets: Record<string, number>;
  actedAt: Record<string, number | null>;
  checked: string[];
  dealerIndex: number;
  smallBlindId: string;
  bigBlindId: string;
  currentIndex: number;
  street: Street;
  phase: 'betting' | 'showdown' | 'finished';
  currentBet: number;
  minRaise: number;
  smallBlind: number;
  bigBlind: number;
  pot: number;
  handNumber: number;
  turnNumber: number;
  turnDeadline: number;
  readyPlayers: string[];
  winnerId: string | null;
  options: HoldemOptions;
  lastResult: HandResult | null;
  history: HandResult[];
  events: HoldemEvent[];
  logs: GameLog[];
  logSequence: number;
}
export interface HoldemView extends Omit<HoldemState, 'deck' | 'hands' | 'burned'> {
  hand: HoldemCard[];
  currentPlayerId: string;
  dealerId: string;
  callAmount: number;
  minRaiseTo: number;
  maxRaiseTo: number;
  canRaise: boolean;
  handCounts: Record<string, number>;
  revealed: Record<string, HoldemCard[]>;
  deckCount: number;
}
export const streetNames: Record<Street, string> = {
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
};
export const suitSymbols: Record<Suit, string> = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' };
export const rankLabel = (rank: number) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[rank] ?? String(rank);
