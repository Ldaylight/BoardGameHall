import { motion } from 'framer-motion';
import { pieceNames, type XiangqiMove, type Point } from '../../../shared/games/xiangqi/types';
const palettes = {
  cannon: '#ff994a',
  chariot: '#ffd372',
  horse: '#b7a1ff',
  elephant: '#7de6ca',
  advisor: '#83ddec',
  soldier: '#ff8972',
  general: '#f6df98',
};
export const effectLabels = {
  cannon: '炮火轰鸣',
  chariot: '疾车斩击',
  horse: '跃马踏阵',
  elephant: '象震山河',
  advisor: '士卫交锋',
  soldier: '破阵突刺',
  general: '王令震慑',
};
export function XiangqiEffects({
  move,
  flip,
  reduced,
}: {
  move: XiangqiMove;
  flip: boolean;
  reduced: boolean;
}) {
  const map = (p: Point) => ({ x: (flip ? 8 - p.x : p.x) * 100 + 50, y: (flip ? 9 - p.y : p.y) * 100 + 50 });
  const from = map(move.from),
    to = map(move.to);
  const kind = move.piece.kind,
    color = palettes[kind],
    capture = !!move.captured;
  const path =
    kind === 'horse'
      ? `M${from.x},${from.y} L${from.x},${to.y} L${to.x},${to.y}`
      : kind === 'cannon'
        ? `M${from.x},${from.y} Q${(from.x + to.x) / 2 + 90},${(from.y + to.y) / 2 - 90} ${to.x},${to.y}`
        : `M${from.x},${from.y} L${to.x},${to.y}`;
  const fragmentCount = kind === 'cannon' ? 16 : kind === 'chariot' ? 2 : 8;
  const fragmentId = `x-fragment-${move.number}-${move.piece.id}`;
  return (
    <svg
      className={`xiangqi-fx fx-${kind}`}
      viewBox="0 0 900 1000"
      aria-hidden="true"
      data-effect={kind}
      data-capture={capture}
      style={{ color }}
    >
      {capture && !reduced && (
        <defs>
          {Array.from({ length: fragmentCount }, (_, i) => {
            const a = (i * Math.PI * 2) / fragmentCount,
              b = ((i + 1) * Math.PI * 2) / fragmentCount;
            return (
              <clipPath id={`${fragmentId}-${i}`} key={i}>
                <path
                  d={`M${to.x},${to.y} L${to.x + 55 * Math.cos(a)},${to.y + 55 * Math.sin(a)} A55 55 0 ${fragmentCount === 2 ? 0 : 0} 1 ${to.x + 55 * Math.cos(b)},${to.y + 55 * Math.sin(b)} Z`}
                />
              </clipPath>
            );
          })}
        </defs>
      )}
      {!reduced && (
        <>
          <motion.path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={kind === 'chariot' ? 18 : 8}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0.8 }}
            animate={{ pathLength: 1, opacity: 0 }}
            transition={{ duration: 0.65 }}
          />
          {kind === 'cannon' && (
            <circle r="15" fill="#ffecac">
              <animateMotion dur=".4s" path={path} fill="freeze" />
              <animate attributeName="opacity" values="1;1;0" keyTimes="0;.85;1" dur=".4s" fill="freeze" />
            </circle>
          )}
          {kind === 'horse' &&
            [0.25, 0.5, 0.75].map((n, i) => (
              <motion.text
                key={i}
                x={from.x + (to.x - from.x) * n}
                y={from.y + (to.y - from.y) * n}
                fontSize="40"
                fill={color}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: [0, 1, 0], scale: 1.2 }}
                transition={{ delay: i * 0.12, duration: 0.5 }}
              >
                ✦
              </motion.text>
            ))}
          {kind === 'soldier' && (
            <motion.path
              d={`M${to.x - 65},${to.y + 65} L${to.x + 65},${to.y - 65} m-25,0 h25 v25`}
              stroke={color}
              strokeWidth="10"
              fill="none"
              initial={{ opacity: 0, pathLength: 0 }}
              animate={{ opacity: [0, 1, 0], pathLength: 1 }}
              transition={{ delay: 0.25, duration: 0.65 }}
            />
          )}
          {kind === 'chariot' &&
            [-1, 1].map((n) => (
              <motion.path
                key={n}
                d={`M${to.x - 100},${to.y + n * 70} L${to.x + 100},${to.y - n * 70}`}
                stroke="#fff0bc"
                strokeWidth="12"
                initial={{ pathLength: 0, opacity: 1 }}
                animate={{ pathLength: 1, opacity: 0 }}
                transition={{ delay: 0.3, duration: 0.6 }}
              />
            ))}
          {kind === 'elephant' && (
            <motion.rect
              x={to.x - 55}
              y={to.y - 55}
              width="110"
              height="110"
              rx="20"
              fill="none"
              stroke={color}
              strokeWidth="9"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: [0.5, 1.2, 1.8], opacity: [0, 1, 0] }}
              style={{ transformOrigin: `${to.x}px ${to.y}px` }}
              transition={{ delay: 0.25, duration: 0.7 }}
            />
          )}
          {kind === 'advisor' && (
            <motion.path
              d={`M${to.x},${to.y - 90} L${to.x + 65},${to.y} L${to.x},${to.y + 90} L${to.x - 65},${to.y} Z M${to.x - 60},${to.y - 60} L${to.x + 60},${to.y + 60} M${to.x + 60},${to.y - 60} L${to.x - 60},${to.y + 60}`}
              fill="none"
              stroke={color}
              strokeWidth="8"
              initial={{ pathLength: 0, opacity: 1 }}
              animate={{ pathLength: 1, opacity: 0 }}
              transition={{ delay: 0.25, duration: 0.85 }}
            />
          )}
          {kind === 'general' && (
            <motion.text
              x={to.x}
              y={to.y + 40}
              textAnchor="middle"
              fontSize="120"
              fill={color}
              fontFamily="serif"
              initial={{ opacity: 0, scale: 2 }}
              animate={{ opacity: [0, 1, 0], scale: [2, 1, 1.4] }}
              style={{ transformOrigin: `${to.x}px ${to.y}px` }}
              transition={{ delay: 0.2, duration: 1 }}
            >
              令
            </motion.text>
          )}
          {capture && move.captured && (
            <>
              {Array.from({ length: fragmentCount }, (_, i) => {
                const a = ((i + 0.5) * Math.PI * 2) / fragmentCount;
                return (
                  <motion.g
                    key={`victim-${i}`}
                    data-piece-fragment="true"
                    initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
                    animate={{
                      x: Math.cos(a) * 140,
                      y: Math.sin(a) * 140,
                      opacity: [0, 1, 0],
                      rotate: (i % 2 ? 1 : -1) * 60,
                    }}
                    transition={{ delay: 0.38, duration: 0.8 }}
                    style={{ transformOrigin: `${to.x}px ${to.y}px` }}
                  >
                    <g clipPath={`url(#${fragmentId}-${i})`}>
                      <circle
                        cx={to.x}
                        cy={to.y}
                        r="40"
                        fill={move.captured!.side === 'red' ? '#e8b990' : '#182f36'}
                        stroke={color}
                        strokeWidth="3"
                      />
                      <text x={to.x} y={to.y + 15} textAnchor="middle" fontSize="42" fill={color}>
                        {pieceNames[move.captured!.side][move.captured!.kind]}
                      </text>
                    </g>
                  </motion.g>
                );
              })}
              <motion.g
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ delay: 0.38, duration: 0.12 }}
              >
                <circle
                  cx={to.x}
                  cy={to.y}
                  r="40"
                  fill={move.captured.side === 'red' ? '#e8b990' : '#182f36'}
                  stroke={color}
                />
                <text x={to.x} y={to.y + 15} textAnchor="middle" fontSize="42" fill={color}>
                  {pieceNames[move.captured.side][move.captured.kind]}
                </text>
              </motion.g>
              {Array.from({ length: kind === 'cannon' ? 24 : 12 }, (_, i) => {
                const a = (i * Math.PI * 2) / (kind === 'cannon' ? 24 : 12),
                  distance = kind === 'cannon' ? 125 + (i % 3) * 35 : 80 + (i % 3) * 20;
                return (
                  <motion.g
                    key={i}
                    initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
                    animate={{
                      x: Math.cos(a) * distance,
                      y: Math.sin(a) * distance,
                      opacity: [0, 1, 0],
                      rotate: (i % 2 ? 1 : -1) * 120,
                    }}
                    transition={{ delay: 0.38, duration: 0.75 }}
                    style={{ transformOrigin: `${to.x}px ${to.y}px` }}
                  >
                    <path
                      d={`M${to.x},${to.y} l${8 + (i % 7)},-14 l8,20 Z`}
                      fill={i % 2 ? color : '#ffe9bd'}
                    />
                  </motion.g>
                );
              })}
            </>
          )}
        </>
      )}
      <motion.circle
        cx={to.x}
        cy={to.y}
        r={capture ? 80 : 45}
        fill={kind === 'cannon' && capture ? color : 'none'}
        fillOpacity=".3"
        stroke={color}
        strokeWidth={capture ? 10 : 5}
        initial={{ scale: reduced ? 1 : 0.2, opacity: 0 }}
        animate={{ scale: reduced ? 1 : [0.2, 1.4, 2], opacity: [0, 1, 0] }}
        style={{ transformOrigin: `${to.x}px ${to.y}px` }}
        transition={{ delay: reduced ? 0 : 0.35, duration: reduced ? 0.35 : 0.85 }}
      />
    </svg>
  );
}
