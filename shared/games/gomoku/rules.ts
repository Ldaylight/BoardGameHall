import { BOARD_SIZE, type Board, type GomokuOptions, type Point } from './types.js';
export const directions = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;
export const inside = (x: number, y: number) =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE;
export function lineAt(board: Board, x: number, y: number, dx: number, dy: number): Point[] {
  const stone = board[y][x];
  if (!stone) return [];
  const points: Point[] = [{ x, y }];
  for (const sign of [-1, 1])
    for (let n = 1; inside(x + n * dx * sign, y + n * dy * sign); n++) {
      const p = { x: x + n * dx * sign, y: y + n * dy * sign };
      if (board[p.y][p.x] !== stone) break;
      if (sign < 0) points.unshift(p);
      else points.push(p);
    }
  return points;
}
export function winningLine(board: Board, x: number, y: number): Point[] {
  return directions.map(([dx, dy]) => lineAt(board, x, y, dx, dy)).find((line) => line.length >= 5) ?? [];
}
// Count four-stone sets, not endpoints: an open four counts once.
function fours(board: Board, p: Point, dx: number, dy: number) {
  const groups = new Map<string, { stones: Point[]; ends: Point[] }>();
  for (let start = -4; start <= 0; start++) {
    const stones: Point[] = [],
      empties: Point[] = [];
    for (let n = start; n < start + 5; n++) {
      const q = { x: p.x + n * dx, y: p.y + n * dy };
      if (!inside(q.x, q.y) || board[q.y][q.x] === 2) break;
      (board[q.y][q.x] === 1 ? stones : empties).push(q);
    }
    if (stones.length !== 4 || empties.length !== 1) continue;
    const e = empties[0];
    board[e.y][e.x] = 1;
    const exact = lineAt(board, e.x, e.y, dx, dy).length === 5;
    const overline = directions.some(([a, b]) => lineAt(board, e.x, e.y, a, b).length > 5);
    board[e.y][e.x] = 0;
    if (!exact || overline) continue;
    const key = stones
      .map((q) => `${q.x},${q.y}`)
      .sort()
      .join(';');
    const group = groups.get(key) ?? { stones, ends: [] };
    group.ends.push(e);
    groups.set(key, group);
  }
  return [...groups.values()];
}
function blackFoul(board: Board, p: Point, memo: Map<string, string | null>): string | null {
  const key = `${p.x},${p.y}:${board.map((row) => row.join('')).join('')}`;
  if (memo.has(key)) return memo.get(key)!;
  const lines = directions.map(([dx, dy]) => lineAt(board, p.x, p.y, dx, dy));
  if (lines.some((line) => line.length === 5)) return null;
  if (lines.some((line) => line.length > 5)) return '长连禁手';
  if (directions.reduce((n, [dx, dy]) => n + fours(board, p, dx, dy).length, 0) >= 2) return '四四禁手';
  const threes = new Set<string>();
  for (const [dx, dy] of directions) {
    for (let offset = -3; offset <= 3; offset++) {
      const q = { x: p.x + dx * offset, y: p.y + dy * offset };
      if (!inside(q.x, q.y) || board[q.y][q.x]) continue;
      board[q.y][q.x] = 1;
      const makesFive = winningLine(board, q.x, q.y).length >= 5;
      const straight = fours(board, p, dx, dy).filter(
        (group) => group.ends.length === 2 && group.stones.some((s) => s.x === q.x && s.y === q.y),
      );
      // RIF 9.3: an open-three extension must itself be legal; fake threes do not count.
      if (!makesFive && straight.length && !blackFoul(board, q, memo))
        for (const group of straight)
          threes.add(
            group.stones
              .filter((s) => s.x !== q.x || s.y !== q.y)
              .map((s) => `${s.x},${s.y}`)
              .sort()
              .join(';'),
          );
      board[q.y][q.x] = 0;
      if (threes.size >= 2) {
        memo.set(key, '三三禁手');
        return '三三禁手';
      }
    }
  }
  memo.set(key, null);
  return null;
}
export function forbiddenMove(board: Board, p: Point, stone: 1 | 2, options: GomokuOptions): string | null {
  if (stone !== 1 || (!options.blackForbidden && !options.overlineForbidden)) return null;
  board[p.y][p.x] = 1;
  try {
    if (options.blackForbidden) return blackFoul(board, p, new Map());
    return directions.some(([dx, dy]) => lineAt(board, p.x, p.y, dx, dy).length > 5) ? '长连禁手' : null;
  } finally {
    board[p.y][p.x] = 0;
  }
}
export function canPlace(board: Board, p: Point, stone: 1 | 2, options: GomokuOptions) {
  return inside(p.x, p.y) && board[p.y][p.x] === 0 && !forbiddenMove(board, p, stone, options);
}
