import type { Difficulty } from '../../types.js';
import { canPlace, directions, inside, winningLine } from './rules.js';
import {
  BOARD_SIZE,
  type Board,
  type GomokuAction,
  type GomokuOptions,
  type GomokuView,
  type Point,
} from './types.js';
type Placement = Extract<GomokuAction, { type: 'place' }>;
const WIN = 10_000_000;
export function candidates(board: Board): Point[] {
  const points = new Map<number, Point>();
  for (let y = 0; y < BOARD_SIZE; y++)
    for (let x = 0; x < BOARD_SIZE; x++)
      if (board[y][x]) {
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const q = { x: x + dx, y: y + dy };
            if (inside(q.x, q.y) && !board[q.y][q.x]) points.set(q.y * 15 + q.x, q);
          }
      }
  return points.size ? [...points.values()] : [{ x: 7, y: 7 }];
}
function potential(board: Board, p: Point, stone: 1 | 2) {
  board[p.y][p.x] = stone;
  let score = 0;
  for (const [dx, dy] of directions) {
    for (let start = -4; start <= 0; start++) {
      let count = 0,
        blocked = false;
      for (let n = start; n < start + 5; n++) {
        const x = p.x + n * dx,
          y = p.y + n * dy;
        if (!inside(x, y) || (board[y][x] && board[y][x] !== stone)) {
          blocked = true;
          break;
        }
        if (board[y][x] === stone) count++;
      }
      if (!blocked) score += [0, 2, 24, 350, 18_000, WIN][count];
    }
  }
  board[p.y][p.x] = 0;
  return score;
}
function ordered(board: Board, stone: 1 | 2, options: GomokuOptions) {
  const opponent = (3 - stone) as 1 | 2;
  return candidates(board)
    .filter((p) => canPlace(board, p, stone, options))
    .map((p) => {
      const attack = potential(board, p, stone);
      const defense = canPlace(board, p, opponent, options) ? potential(board, p, opponent) : 0;
      return {
        ...p,
        score:
          attack >= WIN
            ? WIN * 3
            : defense >= WIN
              ? WIN * 2 + attack
              : attack + defense * 1.12 + (14 - Math.abs(p.x - 7) - Math.abs(p.y - 7)) * 0.1,
      };
    })
    .sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
}
function evaluation(board: Board, root: 1 | 2) {
  let total = 0;
  for (let y = 0; y < 15; y++)
    for (let x = 0; x < 15; x++)
      for (const [dx, dy] of directions) {
        if (!inside(x + dx * 4, y + dy * 4)) continue;
        let a = 0,
          b = 0;
        for (let n = 0; n < 5; n++) {
          const c = board[y + n * dy][x + n * dx];
          if (c === root) a++;
          else if (c) b++;
        }
        if (!b) total += [0, 2, 22, 300, 12_000, WIN][a];
        if (!a) total -= [0, 2, 22, 330, 14_000, WIN][b];
      }
  return total;
}
export interface SearchResult {
  action: Placement;
  depth: number;
  nodes: number;
  cutoffs: number;
}
/** Public-board-only minimax. Candidate radius=2; ordered beam bounds branching. */
export function searchMove(view: GomokuView, playerId: string): SearchResult {
  const board = view.board.map((row) => [...row]);
  const root = (view.players.indexOf(playerId) + 1) as 1 | 2;
  const moves = ordered(board, root, view.options);
  if (!moves.length) throw new Error('没有合法落点');
  let best = moves[0],
    nodes = 0,
    cutoffs = 0,
    completedDepth = 0;
  if (best.score >= WIN * 2)
    return { action: { type: 'place', x: best.x, y: best.y }, depth: 0, nodes: 0, cutoffs: 0 };
  const started = performance.now();
  const exhausted = Symbol('search budget');
  function minimax(depth: number, stone: 1 | 2, alpha: number, beta: number, ply: number): number {
    nodes++;
    // Always complete depth 4. Additional depths use a bounded budget.
    if (completedDepth >= 4 && (nodes > 8_000 || performance.now() - started > 250)) throw exhausted;
    if (!depth) return evaluation(board, root);
    const children = ordered(board, stone, view.options).slice(0, ply <= 2 ? 7 : 5);
    if (!children.length) return 0;
    const maximizing = stone === root;
    let score = maximizing ? -Infinity : Infinity;
    for (const p of children) {
      board[p.y][p.x] = stone;
      let value: number;
      try {
        value = winningLine(board, p.x, p.y).length
          ? maximizing
            ? WIN - ply
            : -WIN + ply
          : minimax(depth - 1, (3 - stone) as 1 | 2, alpha, beta, ply + 1);
      } finally {
        board[p.y][p.x] = 0;
      }
      score = maximizing ? Math.max(score, value) : Math.min(score, value);
      if (maximizing) alpha = Math.max(alpha, score);
      else beta = Math.min(beta, score);
      if (beta <= alpha) {
        cutoffs++;
        break;
      }
    }
    return score;
  }
  for (let depth = 4; depth <= 6; depth++) {
    let value = -Infinity,
      iterationBest = best;
    try {
      const roots = [best, ...moves.filter((p) => p.x !== best.x || p.y !== best.y)].slice(0, 10);
      for (const p of roots) {
        board[p.y][p.x] = root;
        let next: number;
        try {
          next = minimax(depth - 1, (3 - root) as 1 | 2, value, Infinity, 1);
        } finally {
          board[p.y][p.x] = 0;
        }
        if (next > value) {
          value = next;
          iterationBest = p;
        }
      }
      best = iterationBest;
      completedDepth = depth;
      if (Math.abs(value) > WIN / 2) break;
    } catch (error) {
      if (error !== exhausted) throw error;
      break;
    }
  }
  return { action: { type: 'place', x: best.x, y: best.y }, depth: completedDepth, nodes, cutoffs };
}
export function aiMove(view: GomokuView, playerId: string, difficulty: Difficulty): GomokuAction {
  if (view.endReason || !view.players.includes(playerId)) throw new Error('AI 无法行动');
  if (view.undoRequest && view.undoRequest.playerId !== playerId)
    return { type: 'undo:respond', accept: true };
  if (view.currentPlayerId !== playerId) throw new Error('AI 尚未轮到落子');
  const stone = (view.players.indexOf(playerId) + 1) as 1 | 2;
  if (difficulty === 'easy') {
    const legal: Point[] = [];
    for (let y = 0; y < 15; y++)
      for (let x = 0; x < 15; x++)
        if (canPlace(view.board, { x, y }, stone, view.options)) legal.push({ x, y });
    const p = legal[Math.floor(Math.random() * legal.length)];
    if (!p) throw new Error('没有合法落点');
    return { type: 'place', ...p };
  }
  if (difficulty === 'hard') return searchMove(view, playerId).action;
  const p = ordered(view.board, stone, view.options)[0];
  if (!p) throw new Error('没有合法落点');
  return { type: 'place', x: p.x, y: p.y };
}
