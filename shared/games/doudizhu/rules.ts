import { rankGroups } from './cards.js';
import type { Combination, ComboKind, PokerCard } from './types.js';
const consecutive = (ranks: number[]) =>
  ranks.at(-1)! <= 14 && ranks.every((rank, i) => !i || rank === ranks[i - 1] + 1);

/** Classic table variant: single wings have distinct ranks; four-with-two singles cannot include jokers. */
export function classify(cards: PokerCard[]): Combination | null {
  if (!cards.length || cards.length > 20 || new Set(cards.map((c) => c.id)).size !== cards.length)
    return null;
  const groups = rankGroups(cards),
    ranks = [...groups.keys()],
    n = cards.length;
  const combo = (kind: ComboKind, mainRank: number, chainLength = 1): Combination => ({
    kind,
    mainRank,
    length: n,
    chainLength,
  });
  const count = (r: number) => groups.get(r)!.length;
  if (n === 2 && ranks[0] === 16 && ranks[1] === 17) return combo('rocket', 17);
  if (ranks.length === 1) {
    if (n === 1) return combo('single', ranks[0]);
    if (n === 2) return combo('pair', ranks[0]);
    if (n === 3) return combo('triple', ranks[0]);
    if (n === 4) return combo('bomb', ranks[0]);
  }
  const triple = ranks.find((r) => count(r) === 3),
    four = ranks.find((r) => count(r) === 4);
  if (triple !== undefined && ranks.length === 2 && n === 4) return combo('triple-single', triple);
  if (triple !== undefined && ranks.length === 2 && n === 5 && ranks.some((r) => count(r) === 2))
    return combo('triple-pair', triple);
  if (n >= 5 && ranks.length === n && consecutive(ranks)) return combo('straight', ranks.at(-1)!, n);
  if (
    n >= 6 &&
    n % 2 === 0 &&
    ranks.length === n / 2 &&
    ranks.every((r) => count(r) === 2) &&
    consecutive(ranks)
  )
    return combo('pair-straight', ranks.at(-1)!, ranks.length);
  if (
    n >= 6 &&
    n % 3 === 0 &&
    ranks.length === n / 3 &&
    ranks.every((r) => count(r) === 3) &&
    consecutive(ranks)
  )
    return combo('plane', ranks.at(-1)!, ranks.length);
  for (const wing of [1, 2] as const) {
    const size = n / (3 + wing);
    if (!Number.isInteger(size) || size < 2) continue;
    for (let end = 14; end >= size + 2; end--) {
      const body = Array.from({ length: size }, (_, i) => end - size + 1 + i);
      if (!body.every((r) => groups.get(r)?.length === 3)) continue;
      const extras = ranks.filter((r) => !body.includes(r));
      if (
        extras.length === size &&
        extras.every((r) => count(r) === wing) &&
        !(extras.includes(16) && extras.includes(17))
      )
        return combo(wing === 1 ? 'plane-single' : 'plane-pair', end, size);
    }
  }
  if (four !== undefined) {
    const extras = ranks.filter((r) => r !== four);
    if (n === 6 && extras.length === 2 && extras.every((r) => count(r) === 1 && r <= 15))
      return combo('four-single', four);
    if (n === 8 && extras.length === 2 && extras.every((r) => count(r) === 2))
      return combo('four-pair', four);
  }
  return null;
}
export function beats(next: Combination, previous: Combination | null): boolean {
  if (!previous) return true;
  if (previous.kind === 'rocket') return false;
  if (next.kind === 'rocket') return true;
  if (next.kind === 'bomb' && previous.kind !== 'bomb') return true;
  return (
    next.kind === previous.kind &&
    next.length === previous.length &&
    next.chainLength === previous.chainLength &&
    next.mainRank > previous.mainRank
  );
}
function choose<T>(values: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (values.length < size) return [];
  const result: T[][] = [];
  for (let i = 0; i <= values.length - size; i++)
    for (const rest of choose(values.slice(i + 1), size - 1)) result.push([values[i], ...rest]);
  return result;
}
/** One suit representative per rank-equivalent play. Validation accepts any owned suit combination. */
export function legalPlays(hand: PokerCard[], previous: Combination | null): PokerCard[][] {
  const g = rankGroups(hand),
    ranks = [...g.keys()],
    result: PokerCard[][] = [],
    seen = new Set<string>();
  function add(cards: PokerCard[]) {
    const combination = classify(cards);
    if (!combination || !beats(combination, previous)) return;
    const key = cards
      .map((c) => c.rank)
      .sort((a, b) => a - b)
      .join(',');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(cards);
    }
  }
  const take = (r: number, n: number) => g.get(r)!.slice(0, n);
  for (const rank of ranks) {
    for (let n = 1; n <= g.get(rank)!.length; n++) add(take(rank, n));
    if (g.get(rank)!.length >= 3)
      for (const extra of ranks.filter((r) => r !== rank)) {
        add([...take(rank, 3), ...take(extra, 1)]);
        if (g.get(extra)!.length >= 2) add([...take(rank, 3), ...take(extra, 2)]);
      }
    if (g.get(rank)!.length === 4)
      for (const wings of [1, 2]) {
        const candidates = ranks.filter(
          (r) => r !== rank && g.get(r)!.length >= wings && (wings === 2 || r <= 15),
        );
        for (const extras of choose(candidates, 2))
          add([...take(rank, 4), ...extras.flatMap((r) => take(r, wings))]);
      }
  }
  if (g.has(16) && g.has(17)) add([...take(16, 1), ...take(17, 1)]);
  for (const copies of [1, 2, 3]) {
    const min = copies === 1 ? 5 : copies === 2 ? 3 : 2;
    for (let start = 3; start <= 14; start++) {
      const chain: number[] = [];
      for (let end = start; end <= 14 && (g.get(end)?.length ?? 0) >= copies; end++) {
        chain.push(end);
        if (chain.length < min) continue;
        const core = chain.flatMap((r) => take(r, copies));
        add(core);
        if (copies !== 3) continue;
        for (const wings of [1, 2]) {
          if (core.length + chain.length * wings > hand.length) continue;
          const candidates = ranks.filter((r) => !chain.includes(r) && g.get(r)!.length >= wings);
          for (const extras of choose(candidates, chain.length))
            add([...core, ...extras.flatMap((r) => take(r, wings))]);
        }
      }
    }
  }
  return result;
}
