import type { PieceKind } from '../../../shared/games/xiangqi/types';
/** Seconds from the start of a public move. Sound and visuals use the same impact marker. */
export const xiangqiTimelines: Record<PieceKind, { impact: number; duration: number }> = {
  chariot: { impact: 0.82, duration: 1.55 },
  soldier: { impact: 0.72, duration: 1.45 },
  advisor: { impact: 0.72, duration: 1.45 },
  horse: { impact: 1.05, duration: 1.9 },
  elephant: { impact: 1.7, duration: 2.55 },
  general: { impact: 1.25, duration: 2.2 },
  cannon: { impact: 1.35, duration: 2.2 },
};
export const xiangqiMoveDuration = (kind: PieceKind, capture: boolean) =>
  capture ? xiangqiTimelines[kind].duration : 0.48;
