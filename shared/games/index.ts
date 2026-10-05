import { uno } from './uno/index.js';
import { gomoku } from './gomoku/index.js';
import { xiangqi } from './xiangqi/index.js';
import { doudizhu } from './doudizhu/index.js';
import { kittens } from './exploding-kittens/index.js';
import { holdem } from './holdem/index.js';
import type { GameAction, GameState, RoomOptions } from '../types.js';
export const playableGames = { uno, gomoku, xiangqi, doudizhu, holdem, 'exploding-kittens': kittens };
export function createGame(options: RoomOptions, players: string[]): GameState {
  if (options.gameId === 'holdem') return holdem.createState(players, options.holdem);
  if (options.gameId === 'exploding-kittens') return kittens.createState(players);
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
export const isKittens = (state: GameState): state is import('./exploding-kittens/types.js').KittensState =>
  'kind' in state && state.kind === 'exploding-kittens';
export const isHoldem = (state: GameState): state is import('./holdem/types.js').HoldemState =>
  'kind' in state && state.kind === 'holdem';
export const wonGame = (state: GameState | null, playerId: string) =>
  !!state && (isDoudizhu(state) ? state.winnerIds.includes(playerId) : state.winnerId === playerId);
export function gameView(state: GameState, playerId: string | null) {
  if (isHoldem(state)) return holdem.getView(state, playerId);
  if (isKittens(state)) return kittens.getView(state, playerId);
  if (isDoudizhu(state)) return doudizhu.getView(state, playerId);
  return isXiangqi(state)
    ? xiangqi.getView(state, playerId)
    : isGomoku(state)
      ? gomoku.getView(state, playerId)
      : uno.getView(state, playerId);
}
export function applyGameAction(state: GameState, playerId: string, action: GameAction): GameState {
  if (isHoldem(state)) {
    if (action.type.startsWith('poker:'))
      return holdem.applyAction(state, playerId, action as import('./holdem/types.js').HoldemAction);
    throw Error('德州扑克不支持此动作');
  }
  if (isKittens(state)) {
    if (action.type.startsWith('ek:'))
      return kittens.applyAction(
        state,
        playerId,
        action as import('./exploding-kittens/types.js').KittensAction,
      );
    throw new Error('炸弹猫不支持此动作');
  }
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
