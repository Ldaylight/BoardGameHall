import type { GameDefinition } from '../definition.js';
export interface XiangqiState {
  board: (string | null)[][];
  currentPlayerId: string;
  winnerId: string | null;
}
export type XiangqiAction = { type: 'move'; from: [number, number]; to: [number, number] };
export type XiangqiDefinition = GameDefinition<XiangqiState, XiangqiAction, XiangqiState>;
export const xiangqiEntry = { id: 'xiangqi', status: 'planned' } as const;
