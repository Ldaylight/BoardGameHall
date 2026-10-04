import type { Difficulty } from '../../types.js';
import { inCheck, legalMoves, findGeneral } from './rules.js';
import {
  otherSide,
  type Board,
  type Side,
  type PieceKind,
  type MoveAction,
  type XiangqiView,
} from './types.js';
export const pieceValue: Record<PieceKind, number> = {
  general: 100_000,
  chariot: 900,
  cannon: 450,
  horse: 400,
  elephant: 200,
  advisor: 200,
  soldier: 100,
};
const WIN = 1_000_000;
function evaluate(board: Board, side: Side) {
  let value = 0;
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (!p) continue;
      const progress = p.side === 'red' ? 9 - y : y;
      const mobility =
        p.kind === 'soldier'
          ? progress * 9 + (progress >= 5 ? 80 : 0)
          : ['horse', 'cannon', 'chariot'].includes(p.kind)
            ? (4 - Math.abs(x - 4)) * 3
            : 0;
      value += (p.side === side ? 1 : -1) * (pieceValue[p.kind] + mobility);
    }
  return value;
}
function play<T>(board: Board, a: MoveAction, fn: () => T): T {
  const piece = board[a.from.y][a.from.x],
    target = board[a.to.y][a.to.x];
  board[a.to.y][a.to.x] = piece;
  board[a.from.y][a.from.x] = null;
  try {
    return fn();
  } finally {
    board[a.to.y][a.to.x] = target;
    board[a.from.y][a.from.x] = piece;
  }
}
function ordered(board: Board, side: Side) {
  return legalMoves(board, side)
    .map((a) => ({
      a,
      score:
        (board[a.to.y][a.to.x]
          ? pieceValue[board[a.to.y][a.to.x]!.kind] * 12 - pieceValue[board[a.from.y][a.from.x]!.kind]
          : 0) + play(board, a, () => (inCheck(board, otherSide(side)) ? 160 : 0)),
    }))
    .sort((a, b) => b.score - a.score)
    .map((m) => m.a);
}
export function aiMove(view: XiangqiView, playerId: string, difficulty: Difficulty): MoveAction {
  if (view.endReason || view.currentPlayerId !== playerId) throw new Error('AI 尚未轮到走棋');
  const side: Side = view.currentIndex === 0 ? 'red' : 'black',
    board = structuredClone(view.board),
    moves = ordered(board, side);
  if (!moves.length) throw new Error('无合法着法');
  if (difficulty === 'easy') return moves[Math.floor(Math.random() * moves.length)];
  // Immediate mate is a tactical fact, independent of a heuristic score.
  for (const a of moves)
    if (
      play(board, a, () => !findGeneral(board, otherSide(side)) || !legalMoves(board, otherSide(side)).length)
    )
      return a;
  let best = moves[0],
    bestScore = -Infinity;
  for (const a of moves) {
    const score = play(
      board,
      a,
      () =>
        evaluate(board, side) -
        Math.max(
          0,
          ...legalMoves(board, otherSide(side)).map((b) =>
            board[b.to.y][b.to.x]?.side === side ? pieceValue[board[b.to.y][b.to.x]!.kind] * 0.7 : 0,
          ),
        ),
    );
    if (score > bestScore) {
      best = a;
      bestScore = score;
    }
  }
  if (difficulty === 'medium') return best;
  const start = performance.now(),
    budget = Symbol('budget');
  let nodes = 0,
    completed = 0;
  function search(depth: number, turn: Side, alpha: number, beta: number, ply: number): number {
    if (++nodes > 8_000 || (completed >= 2 && performance.now() - start > 300)) throw budget;
    if (!findGeneral(board, turn)) return turn === side ? -WIN + ply : WIN - ply;
    const next = ordered(board, turn);
    if (!next.length) return turn === side ? -WIN + ply : WIN - ply;
    if (!depth) return evaluate(board, side);
    const maximizing = turn === side;
    let value = maximizing ? -Infinity : Infinity;
    for (const a of next.slice(0, 10)) {
      const score = play(board, a, () => search(depth - 1, otherSide(turn), alpha, beta, ply + 1));
      value = maximizing ? Math.max(value, score) : Math.min(value, score);
      if (maximizing) alpha = Math.max(alpha, value);
      else beta = Math.min(beta, value);
      if (beta <= alpha) break;
    }
    return value;
  }
  for (let depth = 2; depth <= 4; depth++) {
    let score = -Infinity,
      nextBest = best;
    try {
      for (const a of [best, ...moves.filter((a) => a !== best)].slice(0, 20)) {
        const v = play(board, a, () => search(depth - 1, otherSide(side), score, Infinity, 1));
        if (v > score) {
          score = v;
          nextBest = a;
        }
      }
      best = nextBest;
      completed = depth;
      if (score > WIN / 2) break;
    } catch (e) {
      if (e !== budget) throw e;
      break;
    }
  }
  return best;
}
