import type { GameDefinition } from '../definition.js';
import { aiMove } from './ai.js';
import { boardForEndgame, coordinate } from './endgames.js';
import {
  initialBoard,
  inCheck,
  legalMove,
  legalMoves,
  positionKey,
  chasedPieces,
  findGeneral,
} from './rules.js';
import { repetitionResult } from './repetition.js';
import {
  defaultXiangqiOptions,
  otherSide,
  pieceNames,
  type XiangqiState,
  type XiangqiView,
  type XiangqiAction,
  type XiangqiOptions,
  type Side,
} from './types.js';
export * from './types.js';
function createState(players: string[], options: Partial<XiangqiOptions> = {}): XiangqiState {
  if (players.length !== 2 || new Set(players).size !== 2) throw new Error('中国象棋需要两位不同的玩家');
  const rules = { ...defaultXiangqiOptions, ...options };
  const board = rules.mode === 'puzzle' ? boardForEndgame(rules.puzzleId ?? '') : initialBoard();
  return {
    kind: 'xiangqi',
    board,
    players: [...players],
    currentIndex: 0,
    winnerId: null,
    draw: false,
    endReason: null,
    checkedSide: inCheck(board, 'red') ? 'red' : null,
    options: rules,
    moves: [],
    captured: [],
    positionKeys: [positionKey(board, 'red')],
    quietPlies: 0,
    turnDeadline: Date.now() + rules.turnSeconds * 1000,
    turnNumber: 0,
    logSequence: 0,
    logs: [
      { id: 'x-0', text: rules.mode === 'puzzle' ? '残局挑战开始，红方先行。' : '楚河汉界，红方先行。' },
    ],
  };
}
function log(s: XiangqiState, text: string, event?: XiangqiState['logs'][number]['event']) {
  s.logs.push({ id: `x-${++s.logSequence}`, text, event });
  s.logs = s.logs.slice(-100);
}
function finish(s: XiangqiState, winnerId: string | null, reason: XiangqiState['endReason']) {
  s.winnerId = winnerId;
  s.draw = !winnerId;
  s.endReason = reason;
  const labels = {
    checkmate: '将死',
    stalemate: '困毙',
    general: '将帅被吃',
    resign: '认输',
    timeout: '超时',
    repetition: '重复局面',
    'perpetual-check': '单方长将判负',
    'perpetual-chase': '单方长捉判负',
    'no-progress': '无进展和棋',
  };
  log(
    s,
    `${labels[reason!]}，${winnerId ? (s.players.indexOf(winnerId) === 0 ? '红方' : '黑方') + '获胜。' : '本局和棋。'}`,
    { type: winnerId ? 'win' : 'draw-game', playerId: winnerId ?? '' },
  );
}
export function xiangqiTimeout(state: XiangqiState) {
  const s = structuredClone(state);
  if (!s.endReason && s.options.timeoutLoss && Date.now() >= s.turnDeadline)
    finish(s, s.players[1 - s.currentIndex], 'timeout');
  return s;
}
function applyAction(state: XiangqiState, playerId: string, action: XiangqiAction): XiangqiState {
  if (state.endReason) throw new Error('对局已经结束');
  const index = state.players.indexOf(playerId);
  if (index < 0) throw new Error('观战玩家不能走棋');
  if (state.options.timeoutLoss && Date.now() >= state.turnDeadline) throw new Error('走棋已超时');
  const s = structuredClone(state);
  if (action.type === 'resign') {
    finish(s, s.players[1 - index], 'resign');
    return s;
  }
  if (action.type !== 'move') throw new Error('中国象棋不支持此动作');
  if (index !== s.currentIndex) throw new Error('还没有轮到你走棋');
  const side: Side = index === 0 ? 'red' : 'black';
  if (!legalMove(s.board, side, action)) throw new Error('这个着法不合法：请检查棋子走法、阻挡和将军状态');
  const piece = s.board[action.from.y][action.from.x]!,
    captured = s.board[action.to.y][action.to.x];
  s.board[action.to.y][action.to.x] = piece;
  s.board[action.from.y][action.from.x] = null;
  const check = inCheck(s.board, otherSide(side));
  const move = {
    ...action,
    number: ++s.turnNumber,
    piece: { ...piece },
    captured: captured ? { ...captured } : null,
    check,
    chaseIds: check ? [] : chasedPieces(s.board, side),
  };
  s.moves.push(move);
  if (captured) s.captured.push({ ...captured });
  s.quietPlies =
    captured || (piece.kind === 'soldier' && action.from.y !== action.to.y) ? 0 : s.quietPlies + 1;
  s.currentIndex = 1 - index;
  s.checkedSide = check ? otherSide(side) : null;
  s.positionKeys.push(positionKey(s.board, otherSide(side)));
  s.turnDeadline = Date.now() + s.options.turnSeconds * 1000;
  log(
    s,
    `${side === 'red' ? '红' : '黑'}${pieceNames[side][piece.kind]} ${coordinate(action.from)} → ${coordinate(action.to)}${captured ? '，吃' + pieceNames[captured.side][captured.kind] : ''}${check ? '，将军！' : ''}`,
    {
      type: 'xiangqi-move',
      playerId,
      piece: piece.kind,
      capture: !!captured,
      from: { ...action.from },
      to: { ...action.to },
      check,
    },
  );
  if (!findGeneral(s.board, otherSide(side))) finish(s, playerId, 'general');
  else if (!legalMoves(s.board, otherSide(side)).length)
    finish(s, playerId, check ? 'checkmate' : 'stalemate');
  else {
    const repeated = repetitionResult(s);
    if (repeated)
      finish(s, repeated.draw ? null : s.players[repeated.loser === 'red' ? 1 : 0], repeated.reason);
    else if (s.quietPlies >= 120) finish(s, null, 'no-progress');
  }
  return s;
}
function getView(s: XiangqiState, _playerId: string | null): XiangqiView {
  return { ...structuredClone(s), currentPlayerId: s.players[s.currentIndex] };
}
function getLegalActions(v: XiangqiView, playerId: string): XiangqiAction[] {
  return v.endReason || v.currentPlayerId !== playerId
    ? []
    : legalMoves(v.board, v.currentIndex === 0 ? 'red' : 'black');
}
export const xiangqi: GameDefinition<XiangqiState, XiangqiAction, XiangqiView, Partial<XiangqiOptions>> = {
  id: 'xiangqi',
  name: '中国象棋',
  minPlayers: 2,
  maxPlayers: 2,
  createState,
  applyAction,
  getView,
  getLegalActions,
  aiMove,
};
export const xiangqiEntry = { id: 'xiangqi', status: 'available' } as const;
