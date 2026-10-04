import type { XiangqiView } from '../../../shared/games/xiangqi/types';

/** Rewind only the visual board; authority/revisions always remain the latest server snapshot. */
export function presentedXiangqi(game: XiangqiView, turn: number): XiangqiView {
  if (turn >= game.turnNumber) return game;
  const board = structuredClone(game.board);
  for (const m of [...game.moves].reverse())
    if (m.number > turn) {
      board[m.from.y][m.from.x] = { ...m.piece };
      board[m.to.y][m.to.x] = m.captured ? { ...m.captured } : null;
    }
  return { ...game, board, moves: game.moves.filter((m) => m.number <= turn) };
}
