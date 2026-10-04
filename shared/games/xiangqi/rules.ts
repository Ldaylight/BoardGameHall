import { otherSide, type Board, type Piece, type Point, type Side, type MoveAction } from './types.js';
export const inside = (p: Point) =>
  Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < 9 && p.y >= 0 && p.y < 10;
const palace = (p: Point, side: Side) =>
  p.x >= 3 && p.x <= 5 && (side === 'red' ? p.y >= 7 && p.y <= 9 : p.y >= 0 && p.y <= 2);
export function initialBoard(): Board {
  const board: Board = Array.from({ length: 10 }, () => Array(9).fill(null));
  for (const side of ['black', 'red'] as const) {
    const y = side === 'black' ? 0 : 9,
      cy = side === 'black' ? 2 : 7,
      sy = side === 'black' ? 3 : 6;
    (
      [
        'chariot',
        'horse',
        'elephant',
        'advisor',
        'general',
        'advisor',
        'elephant',
        'horse',
        'chariot',
      ] as const
    ).forEach((kind, x) => {
      board[y][x] = { id: `${side}-${kind}-${x}`, kind, side };
    });
    for (const x of [1, 7]) board[cy][x] = { id: `${side}-cannon-${x}`, kind: 'cannon', side };
    for (const x of [0, 2, 4, 6, 8]) board[sy][x] = { id: `${side}-soldier-${x}`, kind: 'soldier', side };
  }
  return board;
}
export function screens(board: Board, from: Point, to: Point) {
  if (from.x !== to.x && from.y !== to.y) return -1;
  const dx = Math.sign(to.x - from.x),
    dy = Math.sign(to.y - from.y);
  let count = 0,
    x = from.x + dx,
    y = from.y + dy;
  while (x !== to.x || y !== to.y) {
    if (board[y][x]) count++;
    x += dx;
    y += dy;
  }
  return count;
}
export function pseudoLegal(board: Board, from: Point, to: Point): boolean {
  if (!inside(from) || !inside(to) || (from.x === to.x && from.y === to.y)) return false;
  const piece = board[from.y][from.x],
    target = board[to.y][to.x];
  if (!piece || target?.side === piece.side) return false;
  const dx = to.x - from.x,
    dy = to.y - from.y,
    ax = Math.abs(dx),
    ay = Math.abs(dy);
  switch (piece.kind) {
    case 'general':
      if (target?.kind === 'general' && dx === 0 && screens(board, from, to) === 0) return true;
      return palace(to, piece.side) && ax + ay === 1;
    case 'advisor':
      return palace(to, piece.side) && ax === 1 && ay === 1;
    case 'elephant':
      return (
        ax === 2 &&
        ay === 2 &&
        (piece.side === 'red' ? to.y >= 5 : to.y <= 4) &&
        !board[from.y + dy / 2][from.x + dx / 2]
      );
    case 'horse':
      if (ax === 2 && ay === 1) return !board[from.y][from.x + Math.sign(dx)];
      if (ax === 1 && ay === 2) return !board[from.y + Math.sign(dy)][from.x];
      return false;
    case 'chariot':
      return screens(board, from, to) === 0;
    case 'cannon':
      return screens(board, from, to) === (target ? 1 : 0);
    case 'soldier':
      if (dx === 0 && dy === (piece.side === 'red' ? -1 : 1)) return true;
      return (piece.side === 'red' ? from.y <= 4 : from.y >= 5) && ay === 0 && ax === 1;
  }
}
export function findGeneral(board: Board, side: Side): Point | null {
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 9; x++)
      if (board[y][x]?.kind === 'general' && board[y][x]?.side === side) return { x, y };
  return null;
}
export function inCheck(board: Board, side: Side) {
  const general = findGeneral(board, side);
  if (!general) return true;
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 9; x++)
      if (board[y][x]?.side === otherSide(side) && pseudoLegal(board, { x, y }, general)) return true;
  return false;
}
export function legalMove(board: Board, side: Side, move: MoveAction) {
  if (
    !inside(move.from) ||
    !inside(move.to) ||
    board[move.from.y][move.from.x]?.side !== side ||
    !pseudoLegal(board, move.from, move.to)
  )
    return false;
  const source = board[move.from.y][move.from.x],
    target = board[move.to.y][move.to.x];
  board[move.to.y][move.to.x] = source;
  board[move.from.y][move.from.x] = null;
  try {
    return !inCheck(board, side);
  } finally {
    board[move.from.y][move.from.x] = source;
    board[move.to.y][move.to.x] = target;
  }
}
function destinations(board: Board, from: Point, piece: Piece): Point[] {
  const result: Point[] = [];
  const add = (dx: number, dy: number) => {
    const p = { x: from.x + dx, y: from.y + dy };
    if (inside(p)) result.push(p);
  };
  if (piece.kind === 'chariot' || piece.kind === 'cannon') {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      for (let n = 1; n < 10; n++) {
        const p = { x: from.x + dx * n, y: from.y + dy * n };
        if (!inside(p)) break;
        result.push(p);
      }
  } else if (piece.kind === 'horse')
    for (const [dx, dy] of [
      [1, 2],
      [2, 1],
      [-1, 2],
      [-2, 1],
      [1, -2],
      [2, -1],
      [-1, -2],
      [-2, -1],
    ])
      add(dx, dy);
  else if (piece.kind === 'elephant' || piece.kind === 'advisor') {
    const n = piece.kind === 'elephant' ? 2 : 1;
    for (const dx of [-n, n]) for (const dy of [-n, n]) add(dx, dy);
  } else {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      add(dx, dy);
    if (piece.kind === 'general') {
      const opponent = findGeneral(board, otherSide(piece.side));
      if (opponent) result.push(opponent);
    }
  }
  return result;
}
export function legalMoves(board: Board, side: Side): MoveAction[] {
  const actions: MoveAction[] = [];
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 9; x++) {
      const piece = board[y][x];
      if (piece?.side !== side) continue;
      const from = { x, y };
      for (const to of destinations(board, from, piece)) {
        const a: MoveAction = { type: 'move', from, to };
        if (legalMove(board, side, a)) actions.push(a);
      }
    }
  return actions;
}
export function positionKey(board: Board, side: Side) {
  return `${side}:${board
    .flat()
    .map((p) => (p ? p.side[0] + p.kind[0] + (p.kind === 'cannon' ? 'c' : '') : '.'))
    .join(',')}`;
}
/** Conservative long-chase detection: actual legal captures of undefended major pieces. */
export function chasedPieces(board: Board, side: Side): string[] {
  const chased = new Set<string>();
  for (const move of legalMoves(board, side)) {
    const attacker = board[move.from.y][move.from.x]!,
      target = board[move.to.y][move.to.x];
    if (
      !target ||
      ['general', 'soldier'].includes(target.kind) ||
      ['general', 'soldier'].includes(attacker.kind)
    )
      continue;
    // Mutual attacks are exchanges, not one-sided chasing.
    if (legalMove(board, target.side, { type: 'move', from: move.to, to: move.from })) continue;
    board[move.to.y][move.to.x] = attacker;
    board[move.from.y][move.from.x] = null;
    try {
      if (!legalMoves(board, target.side).some((a) => a.to.x === move.to.x && a.to.y === move.to.y))
        chased.add(target.id);
    } finally {
      board[move.to.y][move.to.x] = target;
      board[move.from.y][move.from.x] = attacker;
    }
  }
  return [...chased];
}
