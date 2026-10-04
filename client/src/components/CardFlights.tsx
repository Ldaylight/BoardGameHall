import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { PlayingCard } from './PlayingCard';
import type { DrawFlight } from '@/lib/useDrawAnimations';
import type { Card } from '../../../shared/games/uno';
import type { ScreenPoint } from '@/lib/table-presentation';
export function DrawFlights({
  flights,
  complete,
}: {
  flights: DrawFlight[];
  complete: (id: string) => void;
}) {
  return createPortal(
    <div className="card-flight-layer" aria-hidden="true">
      {flights.map((flight) => (
        <motion.div
          className="draw-flight"
          key={flight.id}
          data-draw-player={flight.playerId}
          style={{ left: flight.fromX, top: flight.fromY }}
          initial={{ x: 0, y: 0, opacity: 0, rotate: -12, scale: 0.85 }}
          animate={{
            x: flight.toX - flight.fromX,
            y: flight.toY - flight.fromY,
            opacity: [0, 1, 1, 0],
            rotate: [-12, 6, 0],
            scale: [0.85, 1.05, 0.9],
          }}
          transition={{
            duration: 0.48,
            delay: flight.delay,
            ease: 'easeInOut',
            opacity: { duration: 0.48, delay: flight.delay, times: [0, 0.06, 0.9, 1] },
          }}
          onAnimationComplete={() => complete(flight.id)}
        >
          <span
            className="draw-flight-trail"
            style={{
              transform: `rotate(${(Math.atan2(flight.toY - flight.fromY, flight.toX - flight.fromX) * 180) / Math.PI - 90}deg)`,
            }}
          />
          <PlayingCard back />
        </motion.div>
      ))}
    </div>,
    document.body,
  );
}
export function DraggedCard({ card, point }: { card: Card; point: ScreenPoint }) {
  return createPortal(
    <div className="card-drag-ghost" aria-hidden="true" style={{ left: point.x - 38, top: point.y - 65 }}>
      <PlayingCard card={card} selected />
    </div>,
    document.body,
  );
}
