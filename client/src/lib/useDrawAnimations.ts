import { useLayoutEffect, useRef, useState } from 'react';
import type { RoomView } from '../../../shared/types';
import type { Card } from '../../../shared/games/uno';
export interface DrawFlight {
  id: string;
  playerId: string;
  card?: Card;
  delay: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}
export function useDrawAnimations(
  room: RoomView<import('../../../shared/games/uno').UnoView> | null,
  me: string | undefined,
  connected: boolean,
  reduced: boolean,
) {
  const [flights, setFlights] = useState<DrawFlight[]>([]);
  const previous = useRef<{ match: string | null; ids: Set<string>; hand: Set<string>; connected: boolean }>({
    match: null,
    ids: new Set(),
    hand: new Set(),
    connected: false,
  });
  const nextStart = useRef(0);
  useLayoutEffect(() => {
    const game = room?.game;
    if (!room || !game) {
      setFlights([]);
      previous.current.connected = false;
      return;
    }
    const old = previous.current;
    previous.current = {
      match: room.matchId,
      ids: new Set(game.logs.map((l) => l.id)),
      hand: new Set(game.hand.map((c) => c.id)),
      connected: connected && !document.hidden,
    };
    if (old.match !== room.matchId || !old.connected || !connected || reduced || document.hidden) {
      setFlights([]);
      nextStart.current = 0;
      return;
    }
    const fresh = game.logs.filter((l) => !old.ids.has(l.id));
    // A newer action from another tab can supersede a card that is still flying.
    setFlights((current) =>
      current.filter((f) => !f.card || game.hand.some((card) => card.id === f.card!.id)),
    );
    if (fresh.length > 8) return;
    const source = document.querySelector('[data-draw-deck] .back-stack')?.getBoundingClientRect();
    if (!source) return;
    const added = game.hand.filter((c) => !old.hand.has(c.id));
    const queue: DrawFlight[] = [];
    if (
      fresh.some((log) => log.event?.type === 'draw' || log.event?.type === 'penalty') &&
      nextStart.current > performance.now() + 3500
    ) {
      setFlights([]);
      nextStart.current = 0;
    }
    for (const log of fresh) {
      const event = log.event;
      if (!event || (event.type !== 'draw' && event.type !== 'penalty')) continue;
      const target = document
        .querySelector(
          `${event.playerId === me ? '.hand-cards' : '.back-stack'}[data-hand-target="${event.playerId}"]`,
        )
        ?.getBoundingClientRect();
      if (!target) continue;
      for (let i = 0; i < (event.count ?? 0); i++) {
        const start = Math.max(performance.now(), nextStart.current);
        nextStart.current = start + 520;
        queue.push({
          id: `${room.matchId}:${log.id}:${i}`,
          playerId: event.playerId,
          card: event.playerId === me ? added.shift() : undefined,
          delay: Math.max(0, (start - performance.now()) / 1000),
          fromX: source.left + source.width / 2 - 25,
          fromY: source.top,
          toX: target.left + target.width / 2 - 25,
          toY: target.top + target.height / 2 - 35,
        });
      }
    }
    if (queue.length) setFlights((current) => [...current, ...queue]);
  }, [room, me, connected, reduced]);
  const pendingDraws: Record<string, number> = {};
  for (const flight of flights) pendingDraws[flight.playerId] = (pendingDraws[flight.playerId] ?? 0) + 1;
  const incoming = new Set(flights.filter((f) => f.card).map((f) => f.card!.id));
  return {
    flights,
    pendingDraws,
    incoming,
    complete: (id: string) => setFlights((current) => current.filter((f) => f.id !== id)),
  };
}
