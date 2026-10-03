import type { GameDefinition } from '../definition.js';
export interface GomokuState {
  board: (string | null)[][];
  players: string[];
  currentPlayerId: string;
  winnerId: string | null;
}
export type GomokuAction = { type: 'place'; x: number; y: number };
// Implement a complete definition here before setting catalog.available=true.
export type GomokuDefinition = GameDefinition<GomokuState, GomokuAction, GomokuState>;
export const gomokuEntry = { id: 'gomoku', status: 'planned', boardSize: 15 } as const;
