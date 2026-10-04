import { uno } from './uno/index.js';
import { gomoku } from './gomoku/index.js';
import { xiangqi } from './xiangqi/index.js';
import { doudizhu } from './doudizhu/index.js';
import type { GameAction, GameState, RoomOptions } from '../types.js';
export const playableGames = { uno, gomoku, xiangqi, doudizhu };
export function createGame(options: RoomOptions, players: string[]): GameState {
  if (options.gameId === 'doudizhu') return doudizhu.createState(players);
  if (options.gameId === 'xiangqi') return xiangqi.createState(players, options.xiangqi);
  return options.gameId === 'gomoku' ? gomoku.createState(players, options.gomoku) : uno.createState(players);
}
export const isGomoku = (state: GameState): state is import('./gomoku/types.js').GomokuState =>
  'kind' in state && state.kind === 'gomoku';
export const isXiangqi = (state: GameState): state is import('./xiangqi/types.js').XiangqiState =>
  'kind' in state && state.kind === 'xiangqi';
export const gameFinished = (state: GameState) => !!state.winnerId || ('draw' in state && state.draw);
export const isDoudizhu = (state: GameState): state is import('./doudizhu/types.js').DoudizhuState =>
  'kind' in state && state.kind === 'doudizhu';
export const wonGame = (state: GameState | null, playerId: string) =>
  !!state && (isDoudizhu(state) ? state.winnerIds.includes(playerId) : state.winnerId === playerId);
export function gameView(state: GameState, playerId: string | null) {
  if (isDoudizhu(state)) return doudizhu.getView(state, playerId);
  return isXiangqi(state)
    ? xiangqi.getView(state, playerId)
    : isGomoku(state)
      ? gomoku.getView(state, playerId)
      : uno.getView(state, playerId);
}
export function applyGameAction(state: GameState, playerId: string, action: GameAction): GameState {
  if (isDoudizhu(state)) {
    if (action.type === 'bid' || action.type === 'pass' || (action.type === 'play' && 'cardIds' in action))
      return doudizhu.applyAction(state, playerId, action);
    throw new Error('斗地主不支持此动作');
  }
  if (isXiangqi(state)) {
    if (!['move', 'resign'].includes(action.type)) throw new Error('中国象棋不支持此动作');
    return xiangqi.applyAction(state, playerId, action as import('./xiangqi/types.js').XiangqiAction);
  }
  if (isGomoku(state)) {
    if (!['place', 'resign', 'undo:request', 'undo:respond'].includes(action.type))
      throw new Error('五子棋不支持此动作');
    return gomoku.applyAction(state, playerId, action as import('./gomoku/types.js').GomokuAction);
  }
  if (
    !['play', 'draw', 'pass', 'uno'].includes(action.type) ||
    (action.type === 'play' && !('cardId' in action))
  )
    throw new Error('UNO 不支持此动作');
  return uno.applyAction(state, playerId, action as import('./uno/index.js').UnoAction);
}
export { gomokuEntry } from './gomoku/index.js';
export { xiangqiEntry } from './xiangqi/index.js';
export { doudizhuEntry } from './doudizhu/index.js';
export { holdemEntry } from './holdem/index.js';
