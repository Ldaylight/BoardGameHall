import type { Card } from '../../../shared/games/uno';
const colorOrder = { wild: 0, red: 1, yellow: 2, green: 3, blue: 4 };
const valueOrder = [
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'skip',
  'reverse',
  'draw2',
  'wild',
  'wild4',
];
export function sortHand(cards: Card[]): Card[] {
  return [...cards].sort(
    (a, b) =>
      colorOrder[a.color] - colorOrder[b.color] || valueOrder.indexOf(a.value) - valueOrder.indexOf(b.value),
  );
}
export interface ScreenPoint {
  x: number;
  y: number;
}
