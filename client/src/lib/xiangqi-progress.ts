const key = (userId: string) => `playroom-xiangqi-puzzles:${userId}`;
export function solvedPuzzles(userId?: string): string[] {
  if (!userId) return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(userId)) ?? '[]');
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export function markSolved(userId: string, puzzleId: string) {
  localStorage.setItem(key(userId), JSON.stringify([...new Set([...solvedPuzzles(userId), puzzleId])]));
}
