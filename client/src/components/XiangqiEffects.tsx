import { createPortal } from 'react-dom';
import { svgMotion as motion } from './SvgTimeline';
import { pieceNames, type XiangqiMove, type Point, type Piece } from '../../../shared/games/xiangqi/types';
import { xiangqiTimelines } from '@/lib/xiangqi-timeline';
export type BoardBounds = { left: number; top: number; width: number; height: number };
const palettes = {
  cannon: '#84eaff',
  chariot: '#ffcc72',
  horse: '#c7a7ff',
  elephant: '#76edce',
  advisor: '#a6e5ff',
  soldier: '#ffb58a',
  general: '#ffdf88',
};
export function PieceGlyph({ piece }: { piece: Piece }) {
  return (
    <g data-fx-piece={piece.kind}>
      <circle
        r="40"
        fill={piece.side === 'red' ? 'url(#fx-red-piece)' : 'url(#fx-black-piece)'}
        stroke={piece.side === 'red' ? '#d99d73' : '#8ed4cb'}
        strokeWidth="2"
      />
      <circle r="34" fill="none" stroke={piece.side === 'red' ? '#ad7254' : '#60928e'} strokeWidth="1" />
      <text
        y="15"
        textAnchor="middle"
        fontSize="44"
        fontWeight="bold"
        fontFamily="KaiTi, STKaiti, serif"
        fill={piece.side === 'red' ? '#a33424' : '#c2e8e0'}
      >
        {pieceNames[piece.side][piece.kind]}
      </text>
    </g>
  );
}
function Hoof() {
  return (
    <g data-motif="hoof">
      <path
        d="M-42,-65 Q-60,-20 -48,32 Q0,65 48,32 Q60,-20 42,-65 L18,-48 Q32,-10 26,24 Q0,39 -26,24 Q-32,-10 -18,-48 Z"
        fill="#cbb3fa"
        stroke="#f5eaff"
        strokeWidth="4"
      />
      <path
        d="M-39,34 Q0,60 39,34 M-28,-31 l-8,3 M28,-31 l8,3 M-31,-5 l-9,2 M31,-5 l9,2"
        fill="none"
        stroke="#44305d"
        strokeWidth="6"
      />
      <path d="M-48,-67 Q0,-98 48,-67" fill="none" stroke="#c6acff" strokeWidth="12" />
    </g>
  );
}
function Dragon() {
  return (
    <g data-motif="dragon">
      <path
        d="M-80,40 Q-120,-25 -55,-30 Q10,-45 -32,-80 Q-62,-112 -15,-135 Q35,-160 68,-129 Q80,-115 66,-92 Q46,-78 18,-92"
        fill="none"
        stroke="#f8cc6c"
        strokeWidth="23"
        strokeLinecap="round"
      />
      <path
        d="M65,-128 l30,-24 -12,32 24,10 -31,10 M34,-140 l-10,-27 -15,20 M-46,-28 l-24,34 -12,-9 M-14,-78 l23,25 16,-5 M-75,33 l22,40"
        fill="none"
        stroke="#fff0bc"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle cx="66" cy="-120" r="4" fill="#c43a2c" />
      <path d="M84,-105 Q122,-105 122,-145 M-91,31 l-26,24" fill="none" stroke="#ffecb2" strokeWidth="3" />
    </g>
  );
}
function Shatter({
  move,
  at,
  scale,
  color,
  id,
}: {
  move: XiangqiMove;
  at: Point;
  scale: number;
  color: string;
  id: string;
}) {
  const victim = move.captured!;
  const count = move.piece.kind === 'chariot' ? 10 : move.piece.kind === 'elephant' ? 18 : 14;
  const impact = xiangqiTimelines[move.piece.kind].impact;
  return (
    <>
      <defs>
        {Array.from({ length: count }, (_, i) => {
          const a = (i * Math.PI * 2) / count,
            b = ((i + 1) * Math.PI * 2) / count;
          return (
            <clipPath key={i} id={`${id}-${i}`}>
              <path
                d={`M0,0 L${60 * Math.cos(a)},${60 * Math.sin(a)} A60 60 0 0 1 ${60 * Math.cos(b)},${60 * Math.sin(b)} Z`}
              />
            </clipPath>
          );
        })}
      </defs>
      <g
        transform={`translate(${at.x} ${at.y}) scale(${scale})`}
        data-motif={move.piece.kind === 'elephant' ? 'glass-shatter' : 'piece-shatter'}
      >
        {Array.from({ length: count }, (_, i) => {
          const a = ((i + 0.5) * Math.PI * 2) / count;
          return (
            <motion.g
              key={i}
              data-piece-fragment="true"
              initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
              animate={{
                x: Math.cos(a) * (110 + (i % 3) * 25),
                y: Math.sin(a) * 100 + 50,
                opacity: [0, 1, 0],
                rotate: (i % 2 ? 1 : -1) * (60 + i * 9),
              }}
              transition={{
                delay: impact,
                duration: 0.7,
                opacity: { delay: impact, duration: 0.7, times: [0, 0.02, 1] },
              }}
            >
              <g clipPath={`url(#${id}-${i})`}>
                <PieceGlyph piece={victim} />
              </g>
            </motion.g>
          );
        })}
        {Array.from({ length: 16 }, (_, i) => (
          <motion.path
            key={`spark${i}`}
            d="M0 0 l8 -16 l6 20 Z"
            fill={i % 2 ? color : '#fff6d4'}
            initial={{ x: 0, y: 0, opacity: 0 }}
            animate={{ x: Math.cos(i * 2.4) * 180, y: Math.sin(i * 2.4) * 150, opacity: [0, 1, 0] }}
            transition={{
              delay: impact,
              duration: 0.6,
              opacity: { delay: impact, duration: 0.6, times: [0, 0.02, 1] },
            }}
          />
        ))}
        <motion.circle
          r="42"
          fill="none"
          stroke={color}
          strokeWidth="6"
          initial={{ opacity: 0, scale: 0.25 }}
          animate={{ opacity: [0, 1, 0], scale: [0.25, 2.7, 4] }}
          transition={{ delay: impact, duration: 0.65 }}
        />
      </g>
    </>
  );
}
export function XiangqiEffects({
  move,
  flip,
  reduced,
  bounds,
}: {
  move: XiangqiMove;
  flip: boolean;
  reduced: boolean;
  bounds: BoardBounds;
}) {
  const w = window.innerWidth,
    h = window.innerHeight,
    s = bounds.width / 900;
  const map = (p: Point) => ({
    x: bounds.left + (((flip ? 8 - p.x : p.x) + 0.5) * bounds.width) / 9,
    y: bounds.top + (((flip ? 9 - p.y : p.y) + 0.5) * bounds.height) / 10,
  });
  const from = map(move.from),
    to = map(move.to),
    kind = move.piece.kind,
    color = palettes[kind],
    impact = xiangqiTimelines[kind].impact;
  const edge = {
    x: to.x < w / 2 ? Math.max(16, 42 * s) : w - Math.max(16, 42 * s),
    y: Math.max(65, Math.min(h - 70, to.y)),
  };
  const shatterAt = kind === 'elephant' ? edge : to;
  const id = `fx-${move.number}-${move.piece.id}`;
  const line = `M${from.x},${from.y} L${to.x},${to.y}`;
  const actor = (position: Point) => (
    <g transform={`translate(${position.x} ${position.y}) scale(${s})`}>
      <PieceGlyph piece={move.piece} />
    </g>
  );
  const isCapture = !!move.captured;
  return createPortal(
    <div className="xiangqi-fx-layer" aria-hidden="true">
      <svg
        className={`xiangqi-fx fx-${kind}`}
        data-effect={kind}
        data-capture={isCapture}
        data-impact={impact}
        data-reduced={reduced}
        viewBox={`0 0 ${w} ${h}`}
        style={{ color, animationDelay: `${impact}s` }}
      >
        <defs>
          <radialGradient id="fx-red-piece">
            <stop stopColor="#ffe9c4" />
            <stop offset="1" stopColor="#cc9b6e" />
          </radialGradient>
          <radialGradient id="fx-black-piece">
            <stop stopColor="#42636a" />
            <stop offset="1" stopColor="#132b30" />
          </radialGradient>
        </defs>
        {reduced || !isCapture ? (
          <motion.circle
            cx={to.x}
            cy={to.y}
            r={40 * s}
            fill="none"
            stroke={color}
            strokeWidth={3 * s}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.4 }}
          />
        ) : (
          <>
            {kind !== 'elephant' && (
              <g transform={`translate(${to.x} ${to.y}) scale(${s})`}>
                <motion.g
                  data-motif="capture-target"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ delay: impact, duration: 0.02 }}
                >
                  <PieceGlyph piece={move.captured!} />
                </motion.g>
              </g>
            )}
            {kind === 'chariot' && (
              <>
                {[0, 1, 2].map((i) => (
                  <motion.path
                    key={i}
                    data-motif="motor-trail"
                    d={line}
                    stroke={i === 0 ? '#fff3b0' : color}
                    strokeWidth={(16 - i * 5) * s}
                    strokeLinecap="round"
                    fill="none"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: [0, 0.85, 0] }}
                    transition={{ duration: impact, delay: i * 0.025, ease: [0.75, 0, 1, 0.4] }}
                  />
                ))}
                <motion.g
                  data-motif="chariot-runner"
                  initial={{ x: from.x, y: from.y }}
                  animate={{ x: to.x, y: to.y }}
                  transition={{ duration: impact, ease: [0.75, 0, 1, 0.4] }}
                >
                  <g transform={`scale(${s})`}>
                    <PieceGlyph piece={move.piece} />
                  </g>
                </motion.g>
              </>
            )}
            {(kind === 'soldier' || kind === 'advisor') && (
              <>
                <motion.g
                  initial={{ x: from.x, y: from.y }}
                  animate={{ x: to.x, y: to.y }}
                  transition={{ duration: impact, ease: 'easeInOut' }}
                >
                  <g transform={`scale(${s})`}>
                    <PieceGlyph piece={move.piece} />
                  </g>
                </motion.g>
                <g transform={`translate(${to.x} ${to.y}) scale(${s})`}>
                  <motion.g
                    data-motif="sword"
                    initial={{ rotate: -75, scale: 1.2, opacity: 0 }}
                    animate={{ rotate: [-75, -75, 45], scale: [1.2, 1.2, 1], opacity: [0, 1, 0] }}
                    transition={{ delay: impact - 0.25, duration: 0.45, times: [0, 0.55, 1] }}
                  >
                    <path
                      d="M-12,-110 L0,-150 L12,-110 L7,55 L-7,55 Z"
                      fill="#f0fbff"
                      stroke={color}
                      strokeWidth="3"
                    />
                    <path d="M-30,55 H30 M0,55 V96" stroke="#eed195" strokeWidth="12" />
                  </motion.g>
                  <motion.path
                    d="M-115,-95 Q-25,55 120,95"
                    fill="none"
                    stroke={color}
                    strokeWidth="16"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: [0, 1, 0] }}
                    transition={{ delay: impact - 0.12, duration: 0.35 }}
                  />
                </g>
              </>
            )}
            {kind === 'horse' && (
              <>
                <motion.g
                  initial={{ x: from.x, y: from.y, opacity: 1 }}
                  animate={{
                    x: [from.x, from.x, to.x],
                    y: [from.y, from.y - 160 * s, to.y - 170 * s],
                    opacity: [1, 1, 0],
                  }}
                  transition={{ duration: 0.65, times: [0, 0.5, 1] }}
                >
                  <g transform={`scale(${s})`}>
                    <PieceGlyph piece={move.piece} />
                  </g>
                </motion.g>
                <motion.g
                  initial={{ x: to.x, y: to.y - 200 * s, opacity: 0 }}
                  animate={{ y: [to.y - 200 * s, to.y - 180 * s, to.y], opacity: [0, 1, 1, 0] }}
                  transition={{
                    delay: 0.45,
                    duration: impact - 0.45,
                    times: [0, 0.35, 1],
                    ease: 'easeIn',
                    opacity: { delay: 0.45, duration: impact - 0.45, times: [0, 0.15, 0.97, 1] },
                  }}
                >
                  <g transform={`scale(${s * 1.35})`}>
                    <Hoof />
                  </g>
                </motion.g>
              </>
            )}
            {kind === 'elephant' && (
              <>
                <motion.g
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ delay: impact, duration: 0.15 }}
                >
                  {actor(from)}
                </motion.g>
                <motion.path
                  data-motif="trunk"
                  d={`M${from.x},${from.y} Q${from.x + 90 * s},${from.y - 170 * s} ${to.x},${to.y} q${-80 * s},${-60 * s} ${-50 * s},${50 * s}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={20 * s}
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: [0, 1, 1], opacity: [0, 1, 0] }}
                  transition={{ delay: 0.12, duration: 1.25, times: [0, 0.45, 1] }}
                />
                <motion.g
                  initial={{ x: to.x, y: to.y, rotate: 0 }}
                  animate={{
                    x: [to.x, to.x, to.x, edge.x],
                    y: [to.y, to.y, to.y - 180 * s, edge.y],
                    rotate: [0, 0, -25, 210],
                    opacity: [1, 1, 1, 0],
                  }}
                  transition={{
                    duration: impact,
                    times: [0, 0.4, 0.62, 1],
                    opacity: { duration: impact, times: [0, 0.4, 0.99, 1] },
                  }}
                >
                  <g transform={`scale(${s})`}>
                    <PieceGlyph piece={move.captured!} />
                  </g>
                </motion.g>
                <motion.path
                  d={`M${to.x},${to.y - 180 * s} Q${(to.x + edge.x) / 2},${Math.max(60, to.y - 240 * s)} ${edge.x},${edge.y}`}
                  stroke={color}
                  strokeWidth={7 * s}
                  fill="none"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: [0, 1, 0] }}
                  transition={{ delay: impact * 0.62, duration: impact * 0.38 }}
                />
              </>
            )}
            {kind === 'general' && (
              <>
                <motion.g
                  initial={{ x: from.x, y: from.y, opacity: 1 }}
                  animate={{ y: from.y - 120 * s, opacity: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  <g transform={`scale(${s})`}>
                    <PieceGlyph piece={move.piece} />
                  </g>
                </motion.g>
                <motion.g
                  initial={{ x: from.x, y: from.y - 40 * s, opacity: 0, scale: 0.5 }}
                  animate={{
                    x: [from.x, (from.x + to.x) / 2, to.x],
                    y: [from.y - 40 * s, to.y - 100 * s, to.y - 100 * s],
                    opacity: [0, 1, 0],
                    scale: [0.5, 1, 1.2],
                  }}
                  transition={{ delay: 0.15, duration: 0.8, times: [0, 0.6, 1] }}
                >
                  <g transform={`scale(${s})`}>
                    <Dragon />
                  </g>
                </motion.g>
                <motion.g
                  data-motif="dragon-banner"
                  initial={{ x: to.x, y: to.y - 170 * s, opacity: 0 }}
                  animate={{ y: to.y, opacity: [0, 1, 1] }}
                  transition={{ delay: 0.8, duration: impact - 0.8, ease: 'easeIn' }}
                >
                  <g transform={`scale(${s})`}>
                    <path d="M0,-150 L0,20 L-8,5 M0,20 L8,5" stroke="#fff0a9" strokeWidth="7" />
                    <path
                      d="M4,-146 Q45,-175 95,-138 L88,-75 Q45,-102 4,-79 Z"
                      fill="#ca4935"
                      stroke="#ffdc85"
                      strokeWidth="4"
                    />
                    <text x="48" y="-114" textAnchor="middle" fill="#fff0ac" fontSize="36">
                      令
                    </text>
                  </g>
                </motion.g>
              </>
            )}
            {kind === 'cannon' && (
              <>
                <g transform={`translate(${from.x} ${from.y}) scale(${s})`}>
                  <motion.g
                    initial={{ opacity: 1, scale: 1 }}
                    animate={{ opacity: [1, 1, 0], scale: [1, 1.2, 0.2] }}
                    transition={{ duration: 0.55, times: [0, 0.8, 1] }}
                  >
                    <PieceGlyph piece={move.piece} />
                  </motion.g>
                  <motion.circle
                    data-motif="ion-charge"
                    r="50"
                    fill="none"
                    stroke={color}
                    strokeWidth="8"
                    initial={{ scale: 1.8, opacity: 0 }}
                    animate={{ scale: [1.8, 0.55, 0.2], opacity: [0, 1, 0] }}
                    transition={{ duration: 0.6 }}
                  />
                  <motion.circle
                    r="13"
                    fill="#eefcff"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: [0, 1.5, 1], opacity: [0, 1, 0] }}
                    transition={{ duration: 0.65 }}
                  />
                </g>
                <circle r={15 * s} fill="#e8ffff" data-motif="ion-projectile">
                  <animateMotion
                    begin=".55s"
                    dur={`${impact - 0.55}s`}
                    path={`M${from.x},${from.y} Q${(from.x + to.x) / 2},${Math.min(from.y, to.y) - 160 * s} ${to.x},${to.y}`}
                    fill="freeze"
                  />
                  <animate
                    attributeName="opacity"
                    values="0;0;1;1;0"
                    keyTimes={`0;${0.54 / impact};${0.56 / impact};.99;1`}
                    dur={`${impact}s`}
                    fill="freeze"
                  />
                </circle>
                <motion.circle
                  cx={to.x}
                  cy={to.y}
                  r={80 * s}
                  fill="#6adcff"
                  initial={{ opacity: 0, scale: 0.15 }}
                  animate={{ scale: [0.15, 1.4, 2], opacity: [0, 0.8, 0] }}
                  style={{ transformOrigin: `${to.x}px ${to.y}px` }}
                  transition={{ delay: impact, duration: 0.65 }}
                />
              </>
            )}
            {!['chariot', 'advisor', 'soldier'].includes(kind) && (
              <g transform={`translate(${to.x} ${to.y}) scale(${s})`}>
                <motion.g
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: impact + 0.15, duration: 0.1 }}
                >
                  <PieceGlyph piece={move.piece} />
                </motion.g>
              </g>
            )}
            <Shatter move={move} at={shatterAt} scale={s} color={color} id={id} />
          </>
        )}
      </svg>
    </div>,
    document.body,
  );
}
