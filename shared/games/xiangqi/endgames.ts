import type { Endgame, PieceKind, Side, Point, MoveAction } from './types.js';
const p = (kind: PieceKind, side: Side, x: number, y: number) => ({
  id: `${side}-${kind}-${x}-${y}`,
  kind,
  side,
  x,
  y,
});
const m = (x: number, y: number, tx: number, ty: number): MoveAction => ({
  type: 'move',
  from: { x, y },
  to: { x: tx, y: ty },
});
const source = 'https://www.xiangqi.com/articles/checkmate-strategies';
// Original teaching arrangements of classic mating patterns; not transcriptions of ancient compositions.
export const endgames: Endgame[] = [
  {
    id: 'double-cannon',
    name: '重炮杀',
    level: '入门',
    theme: '双炮叠击',
    description: '一炮架桥，一炮制胜。把两门炮放到同一路。',
    hint: '将 D8 的炮平到 E8，让前炮成为后炮的炮架。',
    source,
    pieces: [
      p('general', 'red', 4, 9),
      p('general', 'black', 4, 0),
      p('advisor', 'black', 3, 0),
      p('advisor', 'black', 5, 0),
      p('cannon', 'red', 4, 3),
      p('cannon', 'red', 3, 2),
    ],
    solution: [m(3, 2, 4, 2)],
  },
  {
    id: 'horse-cannon',
    name: '马后炮',
    level: '入门',
    theme: '马封宫门',
    description: '马控制将的侧路，炮在马后借势发力。',
    hint: '将 D5 的炮平到 E5，借 E8 的马作炮架。',
    source,
    pieces: [
      p('general', 'red', 4, 9),
      p('general', 'black', 4, 0),
      p('horse', 'red', 4, 2),
      p('cannon', 'red', 3, 5),
    ],
    solution: [m(3, 5, 4, 5)],
  },
  {
    id: 'double-chariot',
    name: '双车错',
    level: '进阶',
    theme: '两步连杀',
    description: '先吃士将军，迫将下移，再用另一车横切封锁。',
    hint: '先用 D7 的车吃 D10 的士，逼将离开底线。',
    source,
    pieces: [
      p('general', 'red', 3, 9),
      p('general', 'black', 4, 0),
      p('advisor', 'black', 3, 0),
      p('advisor', 'black', 5, 0),
      p('chariot', 'red', 3, 3),
      p('chariot', 'red', 6, 2),
      p('soldier', 'red', 4, 3),
    ],
    solution: [m(3, 3, 3, 0), m(4, 0, 4, 1), m(6, 2, 6, 1)],
  },
  {
    id: 'white-general',
    name: '白脸将',
    level: '入门',
    theme: '帅助车兵',
    description: '利用帅的照面威慑封住中路，再以车兵配合完成绝杀。',
    hint: '将 C9 的车平到 D9；兵保护车，帅封住中路。',
    source,
    pieces: [
      p('general', 'red', 4, 9),
      p('general', 'black', 3, 0),
      p('soldier', 'red', 3, 2),
      p('chariot', 'red', 2, 1),
    ],
    solution: [m(2, 1, 3, 1)],
  },
  {
    id: 'two-soldiers',
    name: '二鬼拍门',
    level: '入门',
    theme: '双兵锁宫',
    description: '双兵把守宫门，一兵平中将军，另一兵守护关键落点。',
    hint: '将 D9 的兵平到 E9；另一兵保护它，车控制左侧退路。',
    source,
    pieces: [
      p('general', 'red', 4, 9),
      p('general', 'black', 4, 0),
      p('soldier', 'red', 3, 1),
      p('soldier', 'red', 5, 1),
      p('soldier', 'red', 4, 3),
      p('chariot', 'red', 3, 2),
    ],
    solution: [m(3, 1, 4, 1)],
  },
];
export const endgameById = (id?: string) => endgames.find((p) => p.id === id);
export function boardForEndgame(id: string) {
  const puzzle = endgameById(id);
  if (!puzzle) throw new Error('残局不存在');
  const board = Array.from({ length: 10 }, () => Array(9).fill(null)) as import('./types.js').Board;
  for (const { x, y, ...piece } of puzzle.pieces) board[y][x] = { ...piece };
  return board;
}
export const coordinate = (point: Point) => `${String.fromCharCode(65 + point.x)}${10 - point.y}`;
