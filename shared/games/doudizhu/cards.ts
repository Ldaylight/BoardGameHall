import type { PokerCard, Suit } from './types.js';
export function deck(): PokerCard[] {
  const cards: PokerCard[] = [];
  for (const suit of ['spades', 'hearts', 'clubs', 'diamonds'] as Suit[])
    for (let rank = 3; rank <= 15; rank++) cards.push({ id: `${suit}-${rank}`, rank, suit });
  cards.push({ id: 'joker-16', rank: 16, suit: 'joker' }, { id: 'joker-17', rank: 17, suit: 'joker' });
  return cards;
}
export const sortCards = (cards: PokerCard[]) =>
  [...cards].sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
export function shuffle(cards: PokerCard[]) {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function rankGroups(cards: PokerCard[]) {
  const groups = new Map<number, PokerCard[]>();
  for (const card of cards) groups.set(card.rank, [...(groups.get(card.rank) ?? []), card]);
  return new Map([...groups].sort(([a], [b]) => a - b));
}
