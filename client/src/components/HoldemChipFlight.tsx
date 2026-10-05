import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { HoldemEvent } from '../../../shared/games/holdem/types';

export function HoldemChipFlight({ event }: { event: HoldemEvent }) {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    const seat = [...document.querySelectorAll<HTMLElement>('.holdem-seat')].find(
      (el) => el.dataset.playerId === event.playerId,
    );
    const hand = seat?.classList.contains('holdem-seat-own')
      ? document.querySelector('.holdem-own-cards')
      : seat?.querySelector('.holdem-opponent-cards');
    const source = (hand ?? seat)?.getBoundingClientRect(),
      target = document.querySelector('.holdem-pot-chips')?.getBoundingClientRect();
    if (!source || !target) return;
    const from = { x: source.x + source.width / 2 - 12, y: source.y + source.height / 2 - 12 };
    setStyle({
      left: from.x,
      top: from.y,
      '--chip-x': `${target.x + target.width / 2 - 12 - from.x}px`,
      '--chip-y': `${target.y + target.height / 2 - 12 - from.y}px`,
    } as CSSProperties);
  }, [event.number]);
  return style && !ended
    ? createPortal(
        <div
          className="holdem-chip-flight"
          style={style}
          data-testid="holdem-chip-flight"
          data-player-id={event.playerId}
          aria-hidden="true"
          onAnimationEnd={() => setEnded(true)}
        >
          <i className="poker-chip" />
          <i className="poker-chip chip-trail" />
          <b>+{event.amount}</b>
        </div>,
        document.body,
      )
    : null;
}
