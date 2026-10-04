import type { RoomView } from '../types.js';
import type { UnoView } from './uno/index.js';
import type { GomokuView } from './gomoku/types.js';
import type { XiangqiView } from './xiangqi/types.js';
export function xiangqiView(room: RoomView): XiangqiView {
  const game = room.game;
  if (!game || !('kind' in game) || game.kind !== 'xiangqi')
    throw new Error('当前房间不是正在进行的中国象棋对局');
  return game;
}
export function unoView(room: RoomView): UnoView {
  const game = room.game;
  if (!game || !('hand' in game)) throw new Error('当前房间不是正在进行的 UNO 对局');
  return game;
}
export function gomokuView(room: RoomView): GomokuView {
  const game = room.game;
  if (!game || !('kind' in game) || game.kind !== 'gomoku')
    throw new Error('当前房间不是正在进行的五子棋对局');
  return game;
}
