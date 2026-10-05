import { useReducedMotion } from 'framer-motion';
import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useApp } from '@/stores/app';
import type { GameId } from '../../../shared/types';
import '../styles/game-previews.css';
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
  if (game === 'exploding-kittens')
    return (
      <div className="game-art kitten-art" aria-hidden="true">
        <div className="kitten-card kitten-card-back">✦</div>
        <div className="kitten-card kitten-card-front">
          <svg viewBox="0 0 100 100" fill="none">
            <path
              d="M25 41 21 15 43 31Q50 27 58 31L80 15 76 42Q91 65 77 81Q50 100 24 81Q10 65 25 41Z"
              fill="#292132"
              stroke="#ffd6b0"
              strokeWidth="3"
            />
            <path
              d="m33 54 9 3m16 0 9-3M42 71q8 9 16 0m-8-7v7"
              stroke="#ffd6b0"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M69 31q12-13 23-3M86 19l3-7m4 17 6 2"
              stroke="#ffc577"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <span>BOOM? MEOW.</span>
        </div>
        <span className="kitten-spark">✹</span>
      </div>
    );
  if (game === 'mahjong')
    return (
      <div className="game-art mahjong-art" aria-hidden="true">
        <div className="mahjong-preview-tile tile-bamboo">
          <span>發</span>
        </div>
        <div className="mahjong-preview-tile tile-dots">
          <span>
            ● ●<br />● ●
          </span>
        </div>
        <div className="mahjong-preview-tile tile-dragon">
          <span>中</span>
          <small>好牌上桌</small>
        </div>
      </div>
    );
  if (game === 'billiards')
    return (
      <div className="game-art billiards-art" aria-hidden="true">
        <div className="billiards-preview-table">
          <i className="billiards-pocket pocket-a" />
          <i className="billiards-pocket pocket-b" />
          <i className="billiards-pocket pocket-c" />
          <i className="billiards-pocket pocket-d" />
          <div className="billiards-aim" />
          <span className="billiards-ball ball-eight">8</span>
          <span className="billiards-ball ball-gold">1</span>
          <span className="billiards-ball ball-white" />
        </div>
        <div className="billiards-cue" />
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
