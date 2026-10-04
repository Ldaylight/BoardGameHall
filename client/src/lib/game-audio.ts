import type { RoomView, GameLog } from '../../../shared/types';
import type { SoundEffect } from './audio-engine';

export interface AudioCue {
  effect: SoundEffect;
  delay?: number;
}
export function eventCues(event: GameLog['event'], me?: string): AudioCue[] {
  if (!event) return [];
  switch (event.type) {
    case 'xiangqi-move':
      if (!event.piece) return [];
      return [
        { effect: `x-${event.piece}-move` },
        ...(event.capture ? [{ effect: `x-${event.piece}-capture` as SoundEffect, delay: 0.38 }] : []),
        ...(event.check ? [{ effect: 'x-check' as const, delay: 0.6 }] : []),
      ];
    case 'place':
      return [{ effect: 'stone' }];
    case 'play': {
      const special = ['skip', 'reverse', 'draw2', 'wild', 'wild4'].includes(event.value ?? '');
      return [
        { effect: 'play' },
        ...(special ? [{ effect: event.value as SoundEffect, delay: 0.08 }] : []),
        ...(event.uno ? [{ effect: 'uno' as const, delay: 0.1 }] : []),
      ];
    }
    case 'draw':
      return Array.from({ length: event.count ?? 0 }, (_, i) => ({
        effect: 'draw' as const,
        delay: 0.12 + i * 0.52,
      }));
    case 'penalty':
      return [
        { effect: 'penalty' },
        ...Array.from({ length: event.count ?? 0 }, (_, i) => ({
          effect: 'draw' as const,
          delay: 0.12 + i * 0.52,
        })),
      ];
    case 'uno':
      return [];
    case 'win':
      return [{ effect: event.playerId === me ? 'win' : 'lose', delay: 0.3 }];
    default:
      return [];
  }
}

/** Only public server events produce sounds; the first snapshot is a silent baseline. */
export class GameAudioTracker {
  private matchId: string | null = null;
  private seen = new Set<string>();
  private currentPlayerId: string | null = null;
  private connected = false;
  private tick: string | null = null;

  update(room: RoomView | null, connected: boolean, me?: string): AudioCue[] {
    if (!room?.game || !room.matchId) {
      this.connected = false;
      return [];
    }
    const game = room.game;
    const first = this.matchId !== room.matchId;
    const resumed = !this.connected;
    this.connected = connected;
    const cues: AudioCue[] = [];
    if (first || resumed || !connected) {
      this.matchId = room.matchId;
      this.seen = new Set(game.logs.map((log) => log.id));
      this.currentPlayerId = game.currentPlayerId;
      this.tick = null;
      if (first && connected && 'hand' in game && game.turnNumber === 0 && !game.winnerId)
        cues.push({ effect: 'deal' });
      return cues;
    }
    const fresh = game.logs.filter((log) => !this.seen.has(log.id));
    this.seen = new Set(game.logs.map((log) => log.id));
    // A large batch after sleeping / navigating represents history, not live actions.
    if (fresh.length <= 8) for (const log of fresh) cues.push(...eventCues(log.event, me));
    if (this.currentPlayerId !== game.currentPlayerId && game.currentPlayerId === me && !game.winnerId)
      cues.push({ effect: 'turn', delay: 0.15 });
    this.currentPlayerId = game.currentPlayerId;
    return cues;
  }

  countdown(room: RoomView | null, now: number, connected: boolean): AudioCue[] {
    const game = room?.game;
    if (!game || game.winnerId || ('draw' in game && game.draw) || !connected) {
      this.tick = null;
      return [];
    }
    const seconds = Math.max(0, Math.ceil((game.turnDeadline - now) / 1000));
    const id = `${room.matchId}:${game.turnNumber}:${game.turnDeadline}:${seconds}`;
    if (id === this.tick) return [];
    const previous = this.tick;
    this.tick = id;
    if (!previous || seconds <= 0) return [];
    return [{ effect: seconds <= 5 ? 'urgent' : 'tick' }];
  }
}
