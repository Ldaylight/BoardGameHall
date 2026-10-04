import { uno } from './uno/index.js';
import { gomoku } from './gomoku/index.js';
import type { GameAction, GameState, RoomOptions } from '../types.js';
export const playableGames = { uno, gomoku };
export function createGame(options: RoomOptions, players: string[]): GameState {
  return options.gameId === 'gomoku' ? gomoku.createState(players, options.gomoku) : uno.createState(players);
}
export const isGomoku = (state: GameState): state is import('./gomoku/types.js').GomokuState =>
  'board' in state;
export const gameFinished = (state: GameState) => !!state.winnerId || (isGomoku(state) && state.draw);
export function gameView(state: GameState, playerId: string | null) {
  return isGomoku(state) ? gomoku.getView(state, playerId) : uno.getView(state, playerId);
}
export function applyGameAction(state: GameState, playerId: string, action: GameAction): GameState {
  if (isGomoku(state)) {
    if (!['place', 'resign', 'undo:request', 'undo:respond'].includes(action.type))
      throw new Error('五子棋不支持此动作');
    return gomoku.applyAction(state, playerId, action as import('./gomoku/types.js').GomokuAction);
  }
  if (!['play', 'draw', 'pass', 'uno'].includes(action.type)) throw new Error('UNO 不支持此动作');
  return uno.applyAction(state, playerId, action as import('./uno/index.js').UnoAction);
}
export { gomokuEntry } from './gomoku/index.js';
export { xiangqiEntry } from './xiangqi/index.js';
export { doudizhuEntry } from './doudizhu/index.js';
export { holdemEntry } from './holdem/index.js';
