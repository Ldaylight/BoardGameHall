import type { GameDefinition } from '../definition.js';
import { aiMove } from './ai.js';
import { canPlace, forbiddenMove, inside, winningLine } from './rules.js';
import {
  BOARD_SIZE,
  defaultGomokuOptions,
  type GomokuAction,
  type GomokuOptions,
  type GomokuState,
  type GomokuView,
} from './types.js';
export * from './types.js';
export function createState(players: string[], options: Partial<GomokuOptions> = {}): GomokuState {
  if (players.length !== 2 || new Set(players).size !== 2) throw new Error('五子棋需要两位不同的玩家');
  const rules = { ...defaultGomokuOptions, ...options };
  return {
    kind: 'gomoku',
    board: Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0)),
    players: [...players],
    currentIndex: 0,
    winnerId: null,
    draw: false,
    endReason: null,
    winningLine: [],
    moves: [],
    options: rules,
    undoRequest: null,
    undoUsed: [],
    turnDeadline: Date.now() + rules.turnSeconds * 1000,
    turnNumber: 0,
    logs: [{ id: 'g-0', text: '黑棋先手，连成五子即获胜。' }],
    logSequence: 0,
  };
}
function log(s: GomokuState, text: string, event?: GomokuState['logs'][number]['event']) {
  s.logs.push({ id: `g-${++s.logSequence}`, text, event });
  s.logs = s.logs.slice(-100);
}
function finish(s: GomokuState, winnerId: string | null, reason: GomokuState['endReason']) {
  s.winnerId = winnerId;
  s.draw = !winnerId;
  s.endReason = reason;
  s.undoRequest = null;
  const labels = {
    five: '五子连珠',
    resign: '对手认输',
    timeout: '对手超时',
    'no-legal-move': '对手无合法落点',
    draw: '平局',
  };
  log(
    s,
    winnerId
      ? `${s.players.indexOf(winnerId) === 0 ? '黑棋' : '白棋'}获胜（${labels[reason!]}）`
      : '棋盘已满，本局平局。',
    { type: winnerId ? 'win' : 'draw-game', playerId: winnerId ?? '' },
  );
}
export function timeout(state: GomokuState): GomokuState {
  const s = structuredClone(state);
  if (!s.endReason && Date.now() >= s.turnDeadline && s.options.timeoutLoss)
    finish(s, s.players[1 - s.currentIndex], 'timeout');
  return s;
}
function applyAction(state: GomokuState, playerId: string, action: GomokuAction): GomokuState {
  if (state.endReason) throw new Error('对局已经结束');
  const index = state.players.indexOf(playerId);
  if (index < 0) throw new Error('观战玩家不能落子');
  if (state.options.timeoutLoss && Date.now() >= state.turnDeadline)
    throw new Error('落子已超时，请等待裁判结算');
  const s = structuredClone(state);
  if (action.type === 'resign') {
    if (!s.options.allowResign) throw new Error('此房间未启用认输');
    finish(s, s.players[1 - index], 'resign');
    return s;
  }
  if (action.type === 'undo:request') {
    if (!s.options.allowUndo) throw new Error('此房间未启用悔棋');
    if (s.undoRequest || s.undoUsed.includes(playerId)) throw new Error('每人每局只能申请一次悔棋');
    const last = s.moves.at(-1),
      penultimate = s.moves.at(-2);
    if (!last || (last.playerId !== playerId && penultimate?.playerId !== playerId))
      throw new Error('还没有可以撤回的落子');
    s.undoRequest = { playerId, moveCount: s.moves.length };
    s.undoUsed.push(playerId);
    log(s, `${index === 0 ? '黑棋' : '白棋'}申请悔棋，等待对手同意。`);
    return s;
  }
  if (action.type === 'undo:respond') {
    const request = s.undoRequest;
    if (!request || request.playerId === playerId) throw new Error('只有对手能回应悔棋');
    if (action.accept) {
      do {
        const move = s.moves.pop()!;
        s.board[move.y][move.x] = 0;
      } while (s.moves.at(-1)?.playerId === request.playerId);
      s.currentIndex = s.players.indexOf(request.playerId);
      s.turnNumber++;
      s.turnDeadline = Date.now() + s.options.turnSeconds * 1000;
    }
    s.undoRequest = null;
    log(s, action.accept ? '对手同意悔棋，回到申请者落子前。' : '对手拒绝悔棋，继续对局。');
    return s;
  }
  if (action.type !== 'place') throw new Error('五子棋不支持此动作');
  if (index !== s.currentIndex) throw new Error('还没有轮到你落子');
  if (!inside(action.x, action.y)) throw new Error('落点超出棋盘');
  if (s.board[action.y][action.x]) throw new Error('这里已经有棋子');
  const stone = (index + 1) as 1 | 2;
  const foul = forbiddenMove(s.board, action, stone, s.options);
  if (foul) throw new Error(`这个位置是${foul}，请选择其他落点`);
  s.undoRequest = null;
  s.board[action.y][action.x] = stone;
  s.moves.push({ x: action.x, y: action.y, stone, playerId });
  s.turnNumber++;
  log(s, `${stone === 1 ? '黑棋' : '白棋'}落在 ${String.fromCharCode(65 + action.x)}${15 - action.y}。`, {
    type: 'place',
    playerId,
  });
  s.winningLine = winningLine(s.board, action.x, action.y);
  if (s.winningLine.length) finish(s, playerId, 'five');
  else if (s.moves.length === 225) finish(s, null, 'draw');
  else {
    s.currentIndex = 1 - index;
    s.turnDeadline = Date.now() + s.options.turnSeconds * 1000;
    if (
      s.currentIndex === 0 &&
      (s.options.blackForbidden || s.options.overlineForbidden) &&
      !getLegalActions(getView(s, null), s.players[0]).length
    )
      finish(s, s.players[1], 'no-legal-move');
  }
  return s;
}
function getView(s: GomokuState, _playerId: string | null): GomokuView {
  return { ...structuredClone(s), currentPlayerId: s.players[s.currentIndex] };
}
function getLegalActions(v: GomokuView, playerId: string): GomokuAction[] {
  if (v.endReason || v.currentPlayerId !== playerId) return [];
  const stone = (v.players.indexOf(playerId) + 1) as 1 | 2;
  const actions: GomokuAction[] = [];
  for (let y = 0; y < BOARD_SIZE; y++)
    for (let x = 0; x < BOARD_SIZE; x++)
      if (canPlace(v.board, { x, y }, stone, v.options)) actions.push({ type: 'place', x, y });
  return actions;
}
export const gomoku: GameDefinition<GomokuState, GomokuAction, GomokuView, Partial<GomokuOptions>> = {
  id: 'gomoku',
  name: '五子棋',
  minPlayers: 2,
  maxPlayers: 2,
  createState,
  applyAction,
  getLegalActions,
  aiMove,
  getView,
};
export const gomokuEntry = { id: 'gomoku', status: 'available', boardSize: 15 } as const;
