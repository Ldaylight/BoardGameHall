import type { GameDefinition } from '../definition.js';
export interface DoudizhuView {
  hand: string[];
  handCounts: Record<string, number>;
  currentPlayerId: string;
  landlordId: string | null;
}
export interface DoudizhuState extends DoudizhuView {
  hands: Record<string, string[]>;
}
export type DoudizhuAction =
  { type: 'bid'; value: number } | { type: 'play'; cardIds: string[] } | { type: 'pass' };
export type DoudizhuDefinition = GameDefinition<DoudizhuState, DoudizhuAction, DoudizhuView>;
export const doudizhuEntry = { id: 'doudizhu', status: 'planned' } as const;
