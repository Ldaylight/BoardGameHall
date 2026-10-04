import { useReducedMotion } from 'framer-motion';
import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useApp } from '@/stores/app';
import type { GameId } from '../../../shared/types';
export const GameArt = memo(function GameArt({ game, hero = false }: { game: GameId; hero?: boolean }) {
  const reduce = useReducedMotion();
  const motionEnabled = useApp((s) => s.motionEnabled);
  const root = useRef<HTMLDivElement>(null),
    [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!hero || !root.current) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [hero]);
  if (game === 'uno')
    return (
      <div
        ref={root}
        className={`game-art uno-art ${hero ? `hero-art ${motionEnabled && !reduce ? 'art-floating' : ''} ${visible ? '' : 'art-paused'}` : ''}`}
        aria-hidden="true"
      >
        <div className="art-orbit orbit-one" />
        <div className="art-orbit orbit-two" />
        <div className="art-spark spark-one">✦</div>
        <div className="art-spark spark-two">✧</div>
        {[
          { c: 'blue', n: '↔' },
          { c: 'green', n: '+2' },
          { c: 'red', n: '7' },
          { c: 'yellow', n: 'UNO' },
        ].map((card, i) => (
          <div
            key={card.c}
            className={`art-card art-card-${i} ${card.c}`}
            style={
              hero
                ? ({
                    '--art-rotation': `${[-27, -10, 13, 30][i]}deg`,
                    '--art-delay': `${i * 0.35}s`,
                  } as CSSProperties)
                : undefined
            }
          >
            <span className="art-corner">{card.n === 'UNO' ? '✦' : card.n}</span>
            <div className="art-ellipse">
              <span>{card.n}</span>
            </div>
            <span className="art-corner bottom">{card.n === 'UNO' ? '✦' : card.n}</span>
          </div>
        ))}
      </div>
    );
  if (game === 'gomoku')
    return (
      <div className="game-art gomoku-art" aria-hidden="true">
        <div className="mini-board">
          {Array.from({ length: 49 }, (_, i) => (
            <i
              key={i}
              className={
                [16, 22, 23, 30, 38].includes(i)
                  ? 'stone black'
                  : [17, 24, 29, 31, 37].includes(i)
                    ? 'stone white'
                    : ''
              }
            />
          ))}
        </div>
        <span className="board-glint">✧</span>
      </div>
    );
  if (game === 'xiangqi')
    return (
      <div className="game-art xiangqi-art" aria-hidden="true">
        <div className="chess-lines" />
        <div className="chess-piece piece-back">將</div>
        <div className="chess-piece piece-front">帥</div>
        <span className="river-label">楚 河 · 漢 界</span>
      </div>
    );
  return (
    <div className={`game-art poker-art ${game}`} aria-hidden="true">
      <div className="poker-card poker-back">
        <small>Q</small>
        <b>♠</b>
      </div>
      <div className="poker-card poker-front">
        <small>A</small>
        <b>{game === 'holdem' ? '♠' : '♥'}</b>
        <span>{game === 'holdem' ? 'ACE' : '王牌'}</span>
      </div>
      {game === 'holdem' ? (
        <div className="poker-chips">
          <i />
          <i />
          <i />
        </div>
      ) : (
        <div className="joker-star">✦</div>
      )}
    </div>
  );
});
