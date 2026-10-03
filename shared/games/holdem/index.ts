import type { GameDefinition } from '../definition.js';
export interface HoldemView {
  hand: string[];
  community: string[];
  pot: number;
  stacks: Record<string, number>;
  currentPlayerId: string;
}
export interface HoldemState extends HoldemView {
  deck: string[];
  hands: Record<string, string[]>;
}
export type HoldemAction = { type: 'fold' | 'check' | 'call' } | { type: 'raise'; amount: number };
export type HoldemDefinition = GameDefinition<HoldemState, HoldemAction, HoldemView>;
export const holdemEntry = { id: 'holdem', status: 'planned', realMoney: false } as const;
