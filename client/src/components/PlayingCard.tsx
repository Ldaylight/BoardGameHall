import { motion, useMotionValue, useReducedMotion, useSpring, type PanInfo } from 'framer-motion';
import { cardLabel, type Card } from '../../../shared/games/uno';
import { cn } from '@/lib/utils';
export const cardColors = {
  red: '#d55b49',
  yellow: '#d1a740',
  green: '#5a9a68',
  blue: '#4286af',
  wild: '#263230',
};
export function PlayingCard({
  card,
  back = false,
  selected = false,
  disabled = false,
  draggable = false,
  onClick,
  onPlay,
}: {
  card?: Card;
  back?: boolean;
  selected?: boolean;
  disabled?: boolean;
  draggable?: boolean;
  onClick?: () => void;
  onPlay?: () => void;
}) {
  const rx = useMotionValue(0),
    ry = useMotionValue(0);
  const rotateX = useSpring(rx),
    rotateY = useSpring(ry);
  const reduce = useReducedMotion() || localStorage.getItem('playroom-motion') === 'off';
  const rarity =
    card?.value === 'wild4'
      ? 'legendary'
      : card?.value === 'wild'
        ? 'epic'
        : ['draw2', 'reverse', 'skip'].includes(card?.value ?? '')
          ? 'rare'
          : 'common';
  function move(e: React.PointerEvent<HTMLButtonElement>) {
    if (reduce || disabled) return;
    const r = e.currentTarget.getBoundingClientRect();
    rx.set((0.5 - (e.clientY - r.top) / r.height) * 10);
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 12);
  }
  function dragEnd(_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    if (info.offset.y < -65 && !disabled) onPlay?.();
  }
  return (
    <motion.button
      type="button"
      className={cn(
        'playing-card',
        back ? 'is-back' : card?.color,
        `rarity-${back ? 'common' : rarity}`,
        selected && 'selected-card',
        disabled && 'unplayable',
      )}
      style={{ '--face': card ? cardColors[card.color] : undefined, rotateX, rotateY } as React.CSSProperties}
      aria-label={
        back ? '牌堆' : `${card?.color === 'wild' ? '万能牌' : card?.color} ${card ? cardLabel(card) : ''}`
      }
      aria-pressed={onClick ? selected : undefined}
      onPointerMove={move}
      onPointerLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
      onClick={onClick}
      disabled={disabled && !back}
      whileHover={!back && !disabled && !reduce ? { y: -8, scale: selected ? 1.15 : 1.04 } : undefined}
      animate={{ scale: selected ? 1.15 : 1, y: selected ? -12 : 0, opacity: 1 }}
      initial={reduce ? false : { opacity: 0, y: 22 }}
      transition={{ duration: reduce ? 0 : 0.3 }}
      drag={draggable && !disabled && !reduce}
      dragSnapToOrigin
      onDragEnd={dragEnd}
      dragElastic={0.25}
    >
      <span className="corner">{back ? '✦' : card ? cardLabel(card) : ''}</span>
      <span className="card-oval">
        <span>{back ? 'UNO' : card ? cardLabel(card) : ''}</span>
      </span>
      <span className="corner corner-bottom">{back ? '✦' : card ? cardLabel(card) : ''}</span>
      {!back && (rarity === 'epic' || rarity === 'legendary') && <span className="card-particles" />}
      {selected && <span className="card-trail" />}
    </motion.button>
  );
}
