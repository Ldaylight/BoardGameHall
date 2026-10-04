import { motion, useReducedMotion } from 'framer-motion';
import type { GomokuView } from '../../../shared/games/gomoku/types';
export function GomokuBoard({
  game,
  canAct,
  onPlace,
}: {
  game: GomokuView;
  canAct: boolean;
  onPlace: (x: number, y: number) => void;
}) {
  const reduced = useReducedMotion() || localStorage.getItem('playroom-motion') === 'off';
  const last = game.moves.at(-1);
  const firstWin = game.winningLine[0],
    lastWin = game.winningLine.at(-1);
  return (
    <div className="gomoku-board-shell">
      <div className="board-coordinates top">
        {'ABCDEFGHIJKLMNO'.split('').map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="board-coordinates side">
        {Array.from({ length: 15 }, (_, i) => (
          <span key={i}>{15 - i}</span>
        ))}
      </div>
      <div
        className={`gomoku-board ${canAct ? `can-place preview-${game.currentIndex + 1}` : ''}`}
        role="group"
        aria-label="15 × 15 五子棋棋盘"
      >
        <svg className="gomoku-grid-lines" viewBox="0 0 15 15" aria-hidden="true">
          {Array.from({ length: 15 }, (_, n) => (
            <g key={n}>
              <path d={`M .5 ${n + 0.5} H 14.5 M ${n + 0.5} .5 V 14.5`} />
            </g>
          ))}
          {[
            [3, 3],
            [11, 3],
            [7, 7],
            [3, 11],
            [11, 11],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x + 0.5} cy={y + 0.5} r=".075" />
          ))}
        </svg>
        {game.board.flatMap((row, y) =>
          row.map((stone, x) => {
            const isLast = last?.x === x && last?.y === y;
            const won = game.winningLine.some((p) => p.x === x && p.y === y);
            const coordinate = `${String.fromCharCode(65 + x)}${15 - y}`;
            return (
              <button
                key={`${x}-${y}`}
                className={`gomoku-point ${stone ? 'occupied' : ''}`}
                data-x={x}
                data-y={y}
                data-stone={stone}
                disabled={!!stone || !canAct}
                aria-label={`${stone ? (stone === 1 ? '黑棋' : '白棋') : '落子'} ${coordinate}`}
                onClick={() => onPlace(x, y)}
              >
                {stone ? (
                  <motion.span
                    key={`${x}-${y}-${stone}`}
                    className={`gomoku-stone stone-${stone} ${isLast ? 'last-stone' : ''} ${won ? 'winning-stone' : ''}`}
                    initial={reduced ? false : { y: -28, scale: 0.8, opacity: 0 }}
                    animate={{ y: 0, scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 430, damping: 17 }}
                  >
                    {isLast && <i />}
                  </motion.span>
                ) : (
                  <span className="stone-preview" />
                )}
              </button>
            );
          }),
        )}
        {firstWin && lastWin && (
          <svg className="gomoku-winning-line" viewBox="0 0 15 15" aria-label="五子连珠胜利连线" role="img">
            <motion.path
              d={`M ${firstWin.x + 0.5} ${firstWin.y + 0.5} L ${lastWin.x + 0.5} ${lastWin.y + 0.5}`}
              initial={reduced ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.7 }}
            />
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <circle
                key={t}
                cx={firstWin.x + 0.5 + (lastWin.x - firstWin.x) * t}
                cy={firstWin.y + 0.5 + (lastWin.y - firstWin.y) * t}
                r=".085"
                style={{ animationDelay: `${t}s` }}
              />
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}
