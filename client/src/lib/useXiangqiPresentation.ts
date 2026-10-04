import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomView } from '../../../shared/types';
import type { XiangqiView, XiangqiMove } from '../../../shared/games/xiangqi/types';
import { audioEngine } from './audio-engine';
import { eventCues } from './game-audio';
import { xiangqiMoveDuration } from './xiangqi-timeline';
import { presentedXiangqi } from './xiangqi-presentation';
export function useXiangqiPresentation(room: RoomView<XiangqiView>, connected: boolean, me?: string) {
  const game = room.game;
  const [active, setActive] = useState<XiangqiMove | null>(null),
    [shown, setShown] = useState(game?.turnNumber ?? 0),
    [pending, setPending] = useState(false);
  const controller = useRef({
    match: null as string | null,
    seen: 0,
    live: false,
    queue: [] as XiangqiMove[],
    running: false,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    wasFinished: false,
    resultPending: false,
  });
  const latest = useRef({ room, me });
  latest.current = { room, me };
  useEffect(
    () => () => {
      clearTimeout(controller.current.timer);
      controller.current.live = false;
    },
    [],
  );
  useEffect(() => {
    if (!game) return;
    const c = controller.current,
      live = connected && !document.hidden,
      changed = c.match !== room.matchId;
    function result() {
      const r = latest.current.room,
        g = r.game;
      if (c.resultPending && g?.endReason) {
        c.resultPending = false;
        audioEngine.effect(g.winnerId === latest.current.me ? 'win' : g.draw ? 'turn' : 'lose');
      }
    }
    function drain() {
      const next = c.queue.shift();
      if (!next) {
        c.running = false;
        setActive(null);
        setPending(false);
        setShown(latest.current.room.game?.turnNumber ?? c.seen);
        result();
        return;
      }
      c.running = true;
      setActive(next);
      setShown(next.number);
      setPending(true);
      const playerId = game!.players[next.piece.side === 'red' ? 0 : 1];
      for (const cue of eventCues(
        {
          type: 'xiangqi-move',
          playerId,
          piece: next.piece.kind,
          capture: !!next.captured,
          check: next.check,
        },
        me,
      ))
        audioEngine.effect(cue.effect, cue.delay);
      c.timer = setTimeout(() => drain(), xiangqiMoveDuration(next.piece.kind, !!next.captured) * 1000);
    }
    if (changed || !c.live || !live || game.turnNumber < c.seen || game.turnNumber - c.seen > 8) {
      clearTimeout(c.timer);
      c.queue = [];
      c.running = false;
      c.match = room.matchId;
      c.seen = game.turnNumber;
      c.wasFinished = !!game.endReason;
      c.resultPending = false;
      c.live = live;
      setActive(null);
      setPending(false);
      setShown(game.turnNumber);
      return;
    }
    if (game.endReason && !c.wasFinished) c.resultPending = true;
    c.wasFinished = !!game.endReason;
    const fresh = game.moves.filter((m) => m.number > c.seen);
    c.seen = game.turnNumber;
    c.queue.push(...fresh);
    if (!c.running && c.queue.length) drain();
    else if (!c.running) {
      setShown(game.turnNumber);
      result();
    }
  }, [room.matchId, game, connected, me]);
  const view = useMemo(() => (game ? presentedXiangqi(game, shown) : null), [game, shown]);
  const unseen =
    !!game && controller.current.match === room.matchId && game.turnNumber > controller.current.seen;
  return { view, active, animating: pending || unseen, readyForResult: !pending && !unseen };
}
