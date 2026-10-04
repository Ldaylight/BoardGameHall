import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { xiangqi } from '../../../shared/games/xiangqi';
import {
  pieceNames,
  type MoveAction,
  type Point,
  type XiangqiMove,
  type XiangqiView,
} from '../../../shared/games/xiangqi/types';
import { coordinate } from '../../../shared/games/xiangqi/endgames';
import { useApp } from '@/stores/app';
import { XiangqiEffects, type BoardBounds } from './XiangqiEffects';
const equal = (a: Point | undefined | null, b: Point) => a?.x === b.x && a.y === b.y;
export function XiangqiBoard({
  game,
  me,
  canAct,
  connected,
  matchId,
  onMove,
  move,
}: {
  game: XiangqiView;
  me?: string;
  canAct: boolean;
  connected: boolean;
  matchId: string | null;
  onMove: (a: MoveAction) => void;
  move: XiangqiMove | null;
}) {
  const [selected, setSelected] = useState<Point | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<BoardBounds | null>(null);
  useLayoutEffect(() => {
    const node = boardRef.current;
    if (!node) return;
    const measure = () => {
      const r = node.getBoundingClientRect();
      setBounds({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const enabled = useApp((s) => s.motionEnabled),
    prefersReduced = useReducedMotion();
  const reduced = !enabled || !!prefersReduced;
  const flip = game.players[1] === me;
  const legal = useMemo(
    () =>
      canAct ? xiangqi.getLegalActions(game, me ?? '').filter((a): a is MoveAction => a.type === 'move') : [],
    [game, me, canAct],
  );
  const targets = legal.filter((a) => equal(selected, a.from));
  useEffect(() => setSelected(null), [game.turnNumber, game.endReason, matchId]);
  const last = game.moves.at(-1);
  const ownSide = game.players[0] === me ? 'red' : game.players[1] === me ? 'black' : null;
  const display = (p: Point) => ({ x: flip ? 8 - p.x : p.x, y: flip ? 9 - p.y : p.y });
  const pieces = game.board.flatMap((row, y) => row.flatMap((p, x) => (p ? [{ ...p, x, y }] : [])));
  function click(p: Point) {
    if (!canAct) return;
    const action = targets.find((a) => equal(a.to, p));
    if (action) {
      onMove(action);
      setSelected(null);
      return;
    }
    setSelected(game.board[p.y][p.x]?.side === ownSide && !equal(selected, p) ? p : null);
  }
  return (
    <div
      ref={boardRef}
      className={`xiangqi-board ${game.checkedSide ? 'is-check' : ''}`}
      data-flipped={flip}
      aria-label="中国象棋棋盘"
    >
      <svg className="xiangqi-grid" viewBox="0 0 900 1000" aria-hidden="true">
        <defs>
          <linearGradient id="river-light" x2="1" y2="0">
            <stop stopColor="#58dccc" stopOpacity="0" />
            <stop offset=".5" stopColor="#58dccc" stopOpacity=".12" />
            <stop offset="1" stopColor="#58dccc" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="50" y="450" width="800" height="100" fill="url(#river-light)" />
        <g stroke="currentColor" strokeWidth="2" fill="none">
          {Array.from({ length: 10 }, (_, y) => (
            <path key={`r${y}`} d={`M50 ${50 + y * 100} H850`} />
          ))}
          {Array.from({ length: 9 }, (_, x) => (
            <path
              key={`c${x}`}
              d={
                x === 0 || x === 8
                  ? `M${50 + x * 100} 50 V950`
                  : `M${50 + x * 100} 50 V450 M${50 + x * 100} 550 V950`
              }
            />
          ))}
          <path d="M350 50 L550 250 M550 50 L350 250 M350 750 L550 950 M550 750 L350 950" />
          <rect x="42" y="42" width="816" height="916" rx="3" opacity=".3" strokeWidth="5" />
        </g>
        <g className="river-words" textAnchor="middle">
          <text x="250" y="515">
            楚 河
          </text>
          <text x="650" y="515">
            汉 界
          </text>
        </g>
      </svg>
      <div className="xiangqi-hit-grid">
        {Array.from({ length: 90 }, (_, i) => {
          const dp = { x: i % 9, y: Math.floor(i / 9) },
            p = flip ? { x: 8 - dp.x, y: 9 - dp.y } : dp,
            piece = game.board[p.y][p.x],
            target = targets.some((a) => equal(a.to, p)),
            recent = equal(last?.from, p) || equal(last?.to, p);
          return (
            <button
              key={i}
              data-x={p.x}
              data-y={p.y}
              data-piece={piece?.kind ?? ''}
              data-side={piece?.side ?? ''}
              data-legal={target}
              className={`xiangqi-point ${equal(selected, p) ? 'selected' : ''} ${target ? 'legal-target' : ''} ${recent ? 'last-move' : ''}`}
              aria-label={`${coordinate(p)}${piece ? ' ' + (piece.side === 'red' ? '红' : '黑') + pieceNames[piece.side][piece.kind] : ''}${target ? ' 可走' : ''}`}
              aria-pressed={equal(selected, p)}
              disabled={!canAct}
              onClick={() => click(p)}
            >
              {target && <i className={piece ? 'capture-target' : ''} />}
            </button>
          );
        })}
      </div>
      {pieces.map((p) => {
        const d = display(p);
        return (
          <motion.div
            className="xiangqi-piece-position"
            key={p.id}
            initial={false}
            style={{
              visibility: move?.captured && move.piece.id === p.id && !reduced ? 'hidden' : 'visible',
            }}
            animate={{ left: `${((d.x + 0.5) / 9) * 100}%`, top: `${((d.y + 0.5) / 10) * 100}%` }}
            transition={{ duration: reduced ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className={`xiangqi-piece piece-${p.side} ${p.kind === 'general' && game.checkedSide === p.side ? 'checked-general' : ''} ${equal(last?.to, p) ? 'moved-piece' : ''}`}
            >
              {pieceNames[p.side][p.kind]}
            </div>
          </motion.div>
        );
      })}
      {move && bounds && connected && (
        <XiangqiEffects key={move.number} move={move} flip={flip} reduced={reduced} bounds={bounds} />
      )}
      <div className="xiangqi-file-labels" aria-hidden="true">
        {Array.from({ length: 9 }, (_, x) => (
          <span key={x}>{String.fromCharCode(65 + (flip ? 8 - x : x))}</span>
        ))}
      </div>
    </div>
  );
}
