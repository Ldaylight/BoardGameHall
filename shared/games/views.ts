import type { RoomView } from '../types.js';
import type { UnoView } from './uno/index.js';
import type { GomokuView } from './gomoku/types.js';
import type { XiangqiView } from './xiangqi/types.js';
export function kittensView(room: RoomView): import('./exploding-kittens/types.js').KittensView {
  const game = room.game;
  if (!game || !('kind' in game) || game.kind !== 'exploding-kittens')
    throw new Error('当前房间不是炸弹猫对局');
  return game;
}
export function xiangqiView(room: RoomView): XiangqiView {
  const game = room.game;
  if (!game || !('kind' in game) || game.kind !== 'xiangqi')
    throw new Error('当前房间不是正在进行的中国象棋对局');
  return game;
}
export function unoView(room: RoomView): UnoView {
  const game = room.game;
  if (!game || 'kind' in game) throw new Error('当前房间不是正在进行的 UNO 对局');
  return game;
}
export function doudizhuView(room: RoomView): import('./doudizhu/types.js').DoudizhuView {
  const game = room.game;
  if (!game || !('kind' in game) || game.kind !== 'doudizhu')
    throw new Error('当前房间不是正在进行的斗地主对局');
  return game;
}
export function gomokuView(room: RoomView): GomokuView {
  const game = room.game;
  if (!game || !('kind' in game) || game.kind !== 'gomoku')
    throw new Error('当前房间不是正在进行的五子棋对局');
  return game;
}
