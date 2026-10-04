import { describe, expect, it } from 'vitest';
import { xiangqi } from '../shared/games/xiangqi';
import { presentedXiangqi } from '../client/src/lib/xiangqi-presentation';

describe('Xiangqi queued presentation', () => {
  it('restores captured pieces while a later authoritative reply waits in the visual queue', () => {
    const initial = xiangqi.createState(['r', 'b']);
    const first = xiangqi.applyAction(initial, 'r', {
      type: 'move',
      from: { x: 1, y: 7 },
      to: { x: 1, y: 0 },
    });
    const second = xiangqi.applyAction(first, 'b', {
      type: 'move',
      from: { x: 0, y: 0 },
      to: { x: 1, y: 0 },
    });
    const latest = xiangqi.getView(second, 'r');
    const snapshot = structuredClone(latest);
    expect(presentedXiangqi(latest, 0).board).toEqual(initial.board);
    expect(presentedXiangqi(latest, 1).board).toEqual(first.board);
    expect(presentedXiangqi(latest, 1).moves).toHaveLength(1);
    // Turn authority remains current even while the visible board finishes the preceding capture.
    expect(presentedXiangqi(latest, 1).currentPlayerId).toBe(latest.currentPlayerId);
    expect(latest).toEqual(snapshot);
    const visual = presentedXiangqi(latest, 0);
    visual.board[0][1]!.kind = 'soldier';
    expect(latest).toEqual(snapshot);
  });

  it('does not replay or clone the latest board on initial connection / completed animations', () => {
    const latest = xiangqi.getView(xiangqi.createState(['r', 'b']), 'r');
    expect(presentedXiangqi(latest, latest.turnNumber)).toBe(latest);
    expect(presentedXiangqi(latest, latest.turnNumber + 1)).toBe(latest);
  });
});
