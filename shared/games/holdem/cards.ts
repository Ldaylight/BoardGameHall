import type { HoldemCard, Suit } from './types.js';
export function createDeck(): HoldemCard[] {
  return (['spades', 'hearts', 'clubs', 'diamonds'] as Suit[]).flatMap((suit) =>
    Array.from({ length: 13 }, (_, i) => ({ id: `poker-${suit}-${i + 2}`, rank: i + 2, suit })),
  );
}
export function shuffle<T>(cards: T[]): T[] {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
