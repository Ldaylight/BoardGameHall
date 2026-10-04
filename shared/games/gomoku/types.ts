import type { GameLog } from '../../types.js';
export const BOARD_SIZE = 15;
export type Stone = 0 | 1 | 2;
export type Board = Stone[][];
export interface Point {
  x: number;
  y: number;
}
export interface GomokuOptions {
  blackForbidden: boolean;
  overlineForbidden: boolean;
  allowUndo: boolean;
  allowResign: boolean;
  timeoutLoss: boolean;
  turnSeconds: number;
}
export const defaultGomokuOptions: GomokuOptions = {
  blackForbidden: false,
  overlineForbidden: false,
  allowUndo: false,
  allowResign: true,
  timeoutLoss: false,
  turnSeconds: 45,
};
export interface Move extends Point {
  stone: 1 | 2;
  playerId: string;
}
export interface GomokuState {
  kind: 'gomoku';
  board: Board;
  players: string[];
  currentIndex: number;
  winnerId: string | null;
  draw: boolean;
  endReason: 'five' | 'draw' | 'resign' | 'timeout' | 'no-legal-move' | null;
  winningLine: Point[];
  moves: Move[];
  options: GomokuOptions;
  undoRequest: { playerId: string; moveCount: number } | null;
  undoUsed: string[];
  turnDeadline: number;
  turnNumber: number;
  logs: GameLog[];
  logSequence: number;
}
export interface GomokuView extends GomokuState {
  currentPlayerId: string;
}
export type GomokuAction =
  | ({ type: 'place' } & Point)
  | { type: 'resign' }
  | { type: 'undo:request' }
  | { type: 'undo:respond'; accept: boolean };
