import type { KittenCard, KittenKind } from './types.js';
export function shuffle<T>(cards: T[]): T[] {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function createDeck(): KittenCard[] {
  const counts: Record<KittenKind, number> = {
    explode: 4,
    defuse: 6,
    attack: 4,
    skip: 4,
    shuffle: 4,
    future: 5,
    favor: 4,
    nope: 5,
    taco: 4,
    melon: 4,
    potato: 4,
    beard: 4,
    rainbow: 4,
  };
  return (Object.entries(counts) as [KittenKind, number][]).flatMap(([kind, count]) =>
    Array.from({ length: count }, (_, i) => ({ id: `ek-${kind}-${i}`, kind })),
  );
}
