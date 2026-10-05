import type { KittenCard } from './types.js';
import { isCat, kittenKinds } from './types.js';
export function sortedKittenHand(hand: KittenCard[]) {
  return [...hand].sort(
    (a, b) =>
      Number(!isCat(a.kind)) - Number(!isCat(b.kind)) ||
      kittenKinds.indexOf(a.kind) - kittenKinds.indexOf(b.kind) ||
      a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
}
export function kittenHandSpacing(count: number, available: number, cardWidth: number) {
  const step =
    count <= 1
      ? cardWidth
      : Math.min(cardWidth + 12, Math.max(cardWidth * 0.42, (available - 32 - cardWidth) / (count - 1)));
  return { step, width: Math.max(available, Math.max(0, count - 1) * step + cardWidth + 32) };
}
