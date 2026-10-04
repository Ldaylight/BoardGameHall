import { describe, expect, it, vi } from 'vitest';
import { gomoku, timeout, type GomokuState } from '../shared/games/gomoku';
import { canPlace, forbiddenMove, winningLine } from '../shared/games/gomoku/rules';
import { candidates, searchMove } from '../shared/games/gomoku/ai';
import { applyGameAction } from '../shared/games';
const fresh = () => gomoku.createState(['black', 'white']);
const place = (s: GomokuState, x: number, y: number) =>
  gomoku.applyAction(s, s.players[s.currentIndex], { type: 'place', x, y });
describe('authoritative freestyle gomoku', () => {
  it('creates 225 empty intersections, black first and independent public snapshots', () => {
    const s = fresh();
    expect(s.board.flat()).toHaveLength(225);
    expect(s.board.flat().every((n) => n === 0)).toBe(true);
    const view = gomoku.getView(s, null);
    expect(view.currentPlayerId).toBe('black');
    view.board[0][0] = 1;
    expect(s.board[0][0]).toBe(0);
    expect(gomoku.getLegalActions(gomoku.getView(s, 'black'), 'black')).toHaveLength(225);
    expect(gomoku.getLegalActions(gomoku.getView(s, 'white'), 'white')).toHaveLength(0);
  });
  it('rejects occupied, outside/fractional, wrong-turn, spectator and other-game actions without mutation', () => {
    const s = place(fresh(), 7, 7),
      before = structuredClone(s);
    expect(() => gomoku.applyAction(s, 'black', { type: 'place', x: 8, y: 7 })).toThrow('轮到');
    expect(() => gomoku.applyAction(s, 'white', { type: 'place', x: 7, y: 7 })).toThrow('已经');
    for (const x of [-1, 15, 0.5, NaN]) expect(() => place(s, x, 0)).toThrow('超出');
    expect(() => gomoku.applyAction(s, 'spectator', { type: 'place', x: 0, y: 0 })).toThrow('观战');
    expect(() => applyGameAction(s, 'white', { type: 'draw' })).toThrow('不支持');
    expect(s).toEqual(before);
  });
  it.each([
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ])('wins in direction (%i,%i)', (dx, dy) => {
    const s = fresh();
    for (let i = 0; i < 4; i++) s.board[7 + dy * i][3 + dx * i] = 1;
    const won = place(s, 3 + 4 * dx, 7 + 4 * dy);
    expect(won.winnerId).toBe('black');
    expect(won.winningLine).toHaveLength(5);
    expect(() => place(won, 0, 0)).toThrow('结束');
  });
  it('allows six-in-a-row in freestyle for either colour', () => {
    for (const stone of [1, 2] as const) {
      const s = fresh();
      s.currentIndex = stone - 1;
      for (const x of [2, 3, 4, 6, 7]) s.board[7][x] = stone;
      const won = place(s, 5, 7);
      expect(won.winnerId).toBe(s.players[stone - 1]);
      expect(won.winningLine).toHaveLength(6);
    }
  });
  it('draws on a full board without a five and exports no further actions', () => {
    const s = fresh();
    for (let y = 0; y < 15; y++)
      for (let x = 0; x < 15; x++) {
        const stone = (((x + Math.floor(y / 2)) % 2) + 1) as 1 | 2;
        s.board[y][x] = stone;
        s.moves.push({ x, y, stone, playerId: s.players[stone - 1] });
      }
    for (let y = 0; y < 15; y++)
      for (let x = 0; x < 15; x++) expect(winningLine(s.board, x, y)).toHaveLength(0);
    s.board[0][0] = 0;
    s.moves = s.moves.filter((m) => m.x || m.y);
    const drawn = place(s, 0, 0);
    expect(drawn.draw).toBe(true);
    expect(drawn.winnerId).toBeNull();
    expect(drawn.endReason).toBe('draw');
    expect(gomoku.getLegalActions(gomoku.getView(drawn, 'black'), 'black')).toHaveLength(0);
  });
  it('requires consent for undo and restores the requester turn after one or two moves', () => {
    for (const opponentMoved of [false, true]) {
      let s = place(fresh(), 7, 7);
      s.options.allowUndo = true;
      if (opponentMoved) s = place(s, 8, 8);
      s = gomoku.applyAction(s, 'black', { type: 'undo:request' });
      expect(s.moves).toHaveLength(opponentMoved ? 2 : 1);
      expect(() => gomoku.applyAction(s, 'black', { type: 'undo:respond', accept: true })).toThrow('对手');
      s = gomoku.applyAction(s, 'white', { type: 'undo:respond', accept: true });
      expect(s.moves).toHaveLength(0);
      expect(s.board.flat().every((n) => !n)).toBe(true);
      expect(s.currentIndex).toBe(0);
      s = place(s, 7, 7);
      expect(() => gomoku.applyAction(s, 'black', { type: 'undo:request' })).toThrow('一次');
    }
  });
  it('undo disabled/rejected/cancelled preserves the board and running turn clock', () => {
    let s = place(fresh(), 7, 7);
    expect(() => gomoku.applyAction(s, 'black', { type: 'undo:request' })).toThrow('未启用');
    s.options.allowUndo = true;
    const deadline = s.turnDeadline;
    s = gomoku.applyAction(s, 'black', { type: 'undo:request' });
    expect(s.turnDeadline).toBe(deadline);
    const refused = gomoku.applyAction(s, 'white', { type: 'undo:respond', accept: false });
    expect(refused.moves).toHaveLength(1);
    expect(refused.undoRequest).toBeNull();
    s = place(s, 8, 8);
    expect(s.undoRequest).toBeNull();
    expect(s.moves).toHaveLength(2);
  });
  it('resign and timeout end exactly once, while timeout loss is optional', () => {
    let s = fresh();
    expect(gomoku.applyAction(s, 'white', { type: 'resign' }).winnerId).toBe('black');
    s.options.allowResign = false;
    expect(() => gomoku.applyAction(s, 'white', { type: 'resign' })).toThrow('未启用');
    s.turnDeadline = Date.now() - 1;
    expect(timeout(s).winnerId).toBeNull();
    s.options.timeoutLoss = true;
    const ended = timeout(s);
    expect(ended.winnerId).toBe('white');
    expect(ended.endReason).toBe('timeout');
    expect(timeout(ended)).toEqual(ended);
    expect(() => place(s, 7, 7)).toThrow('超时');
  });
});
describe('optional black forbidden points', () => {
  it('rejects overline for black, permits white and never mutates the board during probing', () => {
    const s = fresh();
    s.options.overlineForbidden = true;
    for (const x of [2, 3, 4, 6, 7]) s.board[7][x] = 1;
    const before = structuredClone(s.board);
    expect(forbiddenMove(s.board, { x: 5, y: 7 }, 1, s.options)).toBe('长连禁手');
    expect(s.board).toEqual(before);
    expect(() => place(s, 5, 7)).toThrow('长连');
    expect(canPlace(s.board, { x: 5, y: 7 }, 2, s.options)).toBe(true);
  });
  it('distinguishes double-three, double-four, fake edge threes and exact-five priority', () => {
    const s = fresh();
    s.options.blackForbidden = true;
    for (const [x, y] of [
      [6, 7],
      [8, 7],
      [7, 6],
      [7, 8],
    ])
      s.board[y][x] = 1;
    expect(forbiddenMove(s.board, { x: 7, y: 7 }, 1, s.options)).toBe('三三禁手');
    s.board[7][5] = 1;
    s.board[5][7] = 1;
    expect(forbiddenMove(s.board, { x: 7, y: 7 }, 1, s.options)).toBe('四四禁手');
    s.board[7][4] = 1;
    expect(forbiddenMove(s.board, { x: 7, y: 7 }, 1, s.options)).toBeNull();
    expect(place(s, 7, 7).winnerId).toBe('black');
    const edge = fresh();
    edge.options.blackForbidden = true;
    for (const [x, y] of [
      [0, 1],
      [0, 2],
      [1, 0],
      [2, 0],
    ])
      edge.board[y][x] = 1;
    expect(forbiddenMove(edge.board, { x: 0, y: 0 }, 1, edge.options)).toBeNull();
  });
});
describe('public-board AI', () => {
  it('easy samples only legal empty points without touching the public snapshot', () => {
    const s = fresh();
    s.board[7][7] = 2;
    const v = gomoku.getView(s, 'black'),
      before = structuredClone(v);
    for (let i = 0; i < 20; i++) {
      const a = gomoku.aiMove(v, 'black', 'easy');
      expect(a.type).toBe('place');
      if (a.type === 'place') expect(canPlace(v.board, a, 1, v.options)).toBe(true);
    }
    expect(v).toEqual(before);
  });
  it.each(['medium', 'hard'] as const)(
    '%s completes own five before defense and blocks opponent four',
    (difficulty) => {
      const s = fresh();
      for (let x = 3; x <= 6; x++) s.board[7][x] = 2;
      s.board[7][2] = 1;
      const block = gomoku.aiMove(gomoku.getView(s, 'black'), 'black', difficulty);
      expect(block).toEqual({ type: 'place', x: 7, y: 7 });
      for (let x = 3; x <= 6; x++) s.board[9][x] = 1;
      const win = gomoku.aiMove(gomoku.getView(s, 'black'), 'black', difficulty);
      expect(win.type).toBe('place');
      if (win.type === 'place') expect(place(s, win.x, win.y).winnerId).toBe('black');
    },
  );
  it('hard completes at least four plies with alpha-beta pruning and only radius-two candidates', () => {
    const s = place(fresh(), 7, 7),
      v = gomoku.getView(s, 'white');
    const before = structuredClone(v),
      result = searchMove(v, 'white');
    expect(result.depth).toBeGreaterThanOrEqual(4);
    expect(result.depth).toBeLessThanOrEqual(6);
    expect(result.cutoffs).toBeGreaterThan(0);
    expect(candidates(v.board)).toContainEqual({ x: result.action.x, y: result.action.y });
    expect(v).toEqual(before);
  }, 15_000);
});
