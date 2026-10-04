import type { GameLog } from '../../types.js';
export type Side = 'red' | 'black';
export type PieceKind = 'general' | 'advisor' | 'elephant' | 'horse' | 'chariot' | 'cannon' | 'soldier';
export interface Piece {
  id: string;
  side: Side;
  kind: PieceKind;
}
export interface Point {
  x: number;
  y: number;
}
export type Board = (Piece | null)[][];
export interface XiangqiOptions {
  mode: 'standard' | 'puzzle';
  puzzleId?: string;
  turnSeconds: number;
  timeoutLoss: boolean;
}
export const defaultXiangqiOptions: XiangqiOptions = {
  mode: 'standard',
  turnSeconds: 60,
  timeoutLoss: false,
};
export type MoveAction = { type: 'move'; from: Point; to: Point };
export type XiangqiAction = MoveAction | { type: 'resign' };
export interface XiangqiMove extends MoveAction {
  number: number;
  piece: Piece;
  captured: Piece | null;
  check: boolean;
  chaseIds: string[];
}
export interface XiangqiState {
  kind: 'xiangqi';
  board: Board;
  players: string[];
  currentIndex: number;
  winnerId: string | null;
  draw: boolean;
  endReason:
    | 'checkmate'
    | 'stalemate'
    | 'general'
    | 'resign'
    | 'timeout'
    | 'repetition'
    | 'perpetual-check'
    | 'perpetual-chase'
    | 'no-progress'
    | null;
  checkedSide: Side | null;
  options: XiangqiOptions;
  moves: XiangqiMove[];
  captured: Piece[];
  positionKeys: string[];
  quietPlies: number;
  turnDeadline: number;
  turnNumber: number;
  logs: GameLog[];
  logSequence: number;
}
export interface XiangqiView extends XiangqiState {
  currentPlayerId: string;
}
export interface Endgame {
  id: string;
  name: string;
  level: '入门' | '进阶';
  theme: string;
  description: string;
  pieces: (Piece & Point)[];
  solution: MoveAction[];
  hint: string;
  source: string;
}
export const otherSide = (side: Side): Side => (side === 'red' ? 'black' : 'red');
export const pieceNames: Record<Side, Record<PieceKind, string>> = {
  red: {
    general: '帅',
    advisor: '仕',
    elephant: '相',
    horse: '马',
    chariot: '车',
    cannon: '炮',
    soldier: '兵',
  },
  black: {
    general: '将',
    advisor: '士',
    elephant: '象',
    horse: '马',
    chariot: '车',
    cannon: '砲',
    soldier: '卒',
  },
};
