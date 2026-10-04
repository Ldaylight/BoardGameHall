import { describe, it, expect } from 'vitest';
import {
  xiangqi,
  xiangqiTimeout,
  type Board,
  type PieceKind,
  type XiangqiState,
} from '../shared/games/xiangqi';
import { endgames } from '../shared/games/xiangqi/endgames';
import {
  initialBoard,
  pseudoLegal,
  legalMove,
  legalMoves,
  inCheck,
  positionKey,
} from '../shared/games/xiangqi/rules';
import { repetitionResult } from '../shared/games/xiangqi/repetition';
const move = (x: number, y: number, tx: number, ty: number) => ({
  type: 'move' as const,
  from: { x, y },
  to: { x: tx, y: ty },
});
const empty = (): Board => Array.from({ length: 10 }, () => Array(9).fill(null));
const put = (b: Board, kind: PieceKind, x: number, y: number, side: 'red' | 'black' = 'red') => {
  b[y][x] = { id: `${side}-${kind}-${x}-${y}`, kind, side };
};
describe('Xiangqi rules and authority', () => {
  it('adjudicates a real neutral threefold cycle through normal actions', () => {
    let s = xiangqi.createState(['r', 'b']);
    for (let cycle = 0; cycle < 2; cycle++)
      for (const a of [move(0, 9, 0, 8), move(8, 0, 8, 1), move(0, 8, 0, 9), move(8, 1, 8, 0)])
        s = xiangqi.applyAction(s, s.players[s.currentIndex], a);
    expect(s.draw).toBe(true);
    expect(s.endReason).toBe('repetition');
    expect(xiangqi.getLegalActions(xiangqi.getView(s, 'r'), 'r')).toEqual([]);
  });
  it('quiet 120 plies draw, while captures and forward soldier moves reset progress', () => {
    const s = xiangqi.createState(['r', 'b']);
    s.quietPlies = 119;
    expect(xiangqi.applyAction(s, 'r', move(0, 9, 0, 8)).endReason).toBe('no-progress');
    expect(xiangqi.applyAction(s, 'r', move(1, 7, 1, 0)).quietPlies).toBe(0);
    expect(xiangqi.applyAction(s, 'r', move(4, 6, 4, 5)).quietPlies).toBe(0);
  });
  it('starts with 32 pieces, red first, independent public snapshots', () => {
    const s = xiangqi.createState(['r', 'b']);
    expect(s.board.flat().filter(Boolean)).toHaveLength(32);
    const v = xiangqi.getView(s, null);
    v.board[9][0] = null;
    expect(s.board[9][0]?.kind).toBe('chariot');
    expect(v.currentPlayerId).toBe('r');
    expect(xiangqi.getLegalActions(v, 'b')).toEqual([]);
  });
  it('horse leg, elephant eye/river and palace restrictions', () => {
    const b = empty();
    put(b, 'horse', 4, 4);
    expect(pseudoLegal(b, { x: 4, y: 4 }, { x: 6, y: 5 })).toBe(true);
    put(b, 'soldier', 5, 4);
    expect(pseudoLegal(b, { x: 4, y: 4 }, { x: 6, y: 5 })).toBe(false);
    put(b, 'elephant', 2, 7);
    expect(pseudoLegal(b, { x: 2, y: 7 }, { x: 4, y: 5 })).toBe(true);
    put(b, 'soldier', 3, 6);
    expect(pseudoLegal(b, { x: 2, y: 7 }, { x: 4, y: 5 })).toBe(false);
    put(b, 'elephant', 4, 5);
    expect(pseudoLegal(b, { x: 4, y: 5 }, { x: 6, y: 3 })).toBe(false);
    put(b, 'advisor', 3, 9);
    expect(pseudoLegal(b, { x: 3, y: 9 }, { x: 4, y: 8 })).toBe(true);
    expect(pseudoLegal(b, { x: 3, y: 9 }, { x: 2, y: 8 })).toBe(false);
    put(b, 'general', 3, 8);
    expect(pseudoLegal(b, { x: 3, y: 8 }, { x: 2, y: 8 })).toBe(false);
    expect(pseudoLegal(b, { x: 3, y: 8 }, { x: 4, y: 8 })).toBe(true);
  });
  it('soldiers move forward, sideways only after the river and never backwards', () => {
    const b = empty();
    put(b, 'soldier', 4, 6);
    expect(pseudoLegal(b, { x: 4, y: 6 }, { x: 5, y: 6 })).toBe(false);
    expect(pseudoLegal(b, { x: 4, y: 6 }, { x: 4, y: 5 })).toBe(true);
    put(b, 'soldier', 4, 4);
    expect(pseudoLegal(b, { x: 4, y: 4 }, { x: 5, y: 4 })).toBe(true);
    expect(pseudoLegal(b, { x: 4, y: 4 }, { x: 4, y: 5 })).toBe(false);
    put(b, 'soldier', 2, 5, 'black');
    expect(pseudoLegal(b, { x: 2, y: 5 }, { x: 3, y: 5 })).toBe(true);
    expect(pseudoLegal(b, { x: 2, y: 5 }, { x: 2, y: 4 })).toBe(false);
  });
  it('cannons require exactly one screen for captures and no screens for quiet moves', () => {
    const b = empty();
    put(b, 'cannon', 1, 7);
    put(b, 'horse', 1, 0, 'black');
    expect(pseudoLegal(b, { x: 1, y: 7 }, { x: 1, y: 0 })).toBe(false);
    put(b, 'cannon', 1, 2, 'black');
    expect(pseudoLegal(b, { x: 1, y: 7 }, { x: 1, y: 0 })).toBe(true);
    expect(pseudoLegal(b, { x: 1, y: 7 }, { x: 1, y: 1 })).toBe(false);
    put(b, 'soldier', 1, 4);
    expect(pseudoLegal(b, { x: 1, y: 7 }, { x: 1, y: 0 })).toBe(false);
    put(b, 'chariot', 3, 8);
    expect(pseudoLegal(b, { x: 3, y: 8 }, { x: 6, y: 8 })).toBe(true);
    expect(pseudoLegal(b, { x: 3, y: 8 }, { x: 6, y: 7 })).toBe(false);
  });
  it('forbids exposing flying generals or failing to answer check', () => {
    const b = empty();
    put(b, 'general', 4, 9);
    put(b, 'general', 4, 0, 'black');
    put(b, 'chariot', 4, 5);
    expect(inCheck(b, 'red')).toBe(false);
    expect(legalMove(b, 'red', move(4, 5, 3, 5))).toBe(false);
    put(b, 'chariot', 3, 9, 'black');
    expect(inCheck(b, 'red')).toBe(true);
    expect(legalMove(b, 'red', move(4, 5, 4, 4))).toBe(false);
  });
  it('rejects wrong player/turn, own capture, bounds and stale game actions without mutation', () => {
    const s = xiangqi.createState(['r', 'b']),
      before = structuredClone(s);
    expect(() => xiangqi.applyAction(s, 'b', move(0, 0, 0, 1))).toThrow('轮到');
    expect(() => xiangqi.applyAction(s, 'watcher', move(0, 9, 0, 8))).toThrow('观战');
    for (const a of [
      move(0, 9, 1, 9),
      move(-1, 9, 0, 8),
      move(0.5, 9, 0, 8),
      move(0, 9, 9, 9),
      move(0, 0, 0, 1),
    ])
      expect(() => xiangqi.applyAction(s, 'r', a)).toThrow('不合法');
    expect(s).toEqual(before);
    const next = xiangqi.applyAction(s, 'r', move(1, 7, 1, 0));
    expect(next.captured[0].kind).toBe('horse');
    expect(next.board[0][1]?.side).toBe('red');
    expect(next.logs.at(-1)?.event?.capture).toBe(true);
  });
  it('stalemate is a loss, not a draw', () => {
    const s = xiangqi.createState(['r', 'b']);
    s.board = empty();
    put(s.board, 'general', 4, 9);
    put(s.board, 'general', 4, 0, 'black');
    put(s.board, 'soldier', 4, 3);
    put(s.board, 'chariot', 3, 1);
    put(s.board, 'chariot', 5, 2);
    const won = xiangqi.applyAction(s, 'r', move(5, 2, 5, 1));
    expect(won.endReason).toBe('stalemate');
    expect(won.winnerId).toBe('r');
  });
  it('resignation and configured timeout settle once', () => {
    const s = xiangqi.createState(['r', 'b'], { timeoutLoss: true });
    const end = xiangqi.applyAction(s, 'b', { type: 'resign' });
    expect(end.winnerId).toBe('r');
    expect(() => xiangqi.applyAction(end, 'r', move(0, 9, 0, 8))).toThrow('结束');
    s.turnDeadline = Date.now() - 1;
    expect(xiangqiTimeout(s).winnerId).toBe('b');
    expect(() => xiangqi.applyAction(s, 'r', move(0, 9, 0, 8))).toThrow('超时');
  });
  it('threefold neutral repetitions draw; one-sided perpetual check/chase loses', () => {
    const s = xiangqi.createState(['r', 'b']);
    const a = move(0, 9, 0, 8);
    const red = s.board[9][0]!,
      black = s.board[0][0]!;
    s.positionKeys = ['same', 'b', 'c', 'd', 'same', 'b', 'c', 'd', 'same'];
    s.moves = Array.from({ length: 8 }, (_, i) => ({
      ...a,
      number: i + 1,
      piece: i % 2 ? black : red,
      captured: null,
      check: false,
      chaseIds: [],
    }));
    expect(repetitionResult(s)?.draw).toBe(true);
    s.moves.forEach((m) => (m.check = m.piece.side === 'red'));
    expect(repetitionResult(s)).toMatchObject({ loser: 'red', reason: 'perpetual-check' });
    s.moves.forEach((m) => {
      m.check = false;
      m.chaseIds = m.piece.side === 'black' ? ['horse'] : [];
    });
    expect(repetitionResult(s)).toMatchObject({ loser: 'black', reason: 'perpetual-chase' });
    expect(positionKey(initialBoard(), 'red')).not.toBe(positionKey(initialBoard(), 'black'));
  });
});
describe('classic mating pattern teaching puzzles', () => {
  it.each(endgames.map((p) => [p.id, p] as const))(
    '%s has a legal forced solution ending in mate',
    (_id, p) => {
      let s = xiangqi.createState(['r', 'b'], { mode: 'puzzle', puzzleId: p.id });
      expect(inCheck(s.board, 'red')).toBe(false);
      expect(inCheck(s.board, 'black')).toBe(false);
      for (const [i, a] of p.solution.entries()) {
        if (i % 2 === 1) expect(legalMoves(s.board, 'black')).toHaveLength(1);
        s = xiangqi.applyAction(s, s.players[s.currentIndex], a);
      }
      expect(s.winnerId).toBe('r');
      expect(s.endReason).toBe('checkmate');
    },
  );
  it.each(['easy', 'medium', 'hard'] as const)(
    'AI %s returns legal moves without changing its public view',
    (difficulty) => {
      const s = xiangqi.createState(['r', 'b']);
      const v = xiangqi.getView(s, 'r'),
        before = structuredClone(v);
      const a = xiangqi.aiMove(v, 'r', difficulty);
      expect(legalMove(v.board, 'red', a as ReturnType<typeof move>)).toBe(true);
      expect(v).toEqual(before);
    },
  );
  it('medium/hard find the immediate heavy-cannon mate', () => {
    const s = xiangqi.createState(['r', 'b'], { mode: 'puzzle', puzzleId: 'double-cannon' });
    for (const difficulty of ['medium', 'hard'] as const) {
      const a = xiangqi.aiMove(xiangqi.getView(s, 'r'), 'r', difficulty);
      expect(xiangqi.applyAction(s, 'r', a).winnerId).toBe('r');
    }
  });
});
