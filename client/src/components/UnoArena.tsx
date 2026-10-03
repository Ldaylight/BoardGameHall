import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Clock3, Layers3 } from 'lucide-react';
import type { RoomView } from '../../../shared/types';
import { cardLabel, colorNames } from '../../../shared/games/uno';
import { Avatar } from './Layout';
import { cardColors, PlayingCard } from './PlayingCard';

const positions: Record<number, string[]> = {
  2: ['bottom', 'top'],
  3: ['bottom', 'left', 'right'],
  4: ['bottom', 'left', 'top', 'right'],
  5: ['bottom', 'left', 'top-left', 'top-right', 'right'],
  6: ['bottom', 'left', 'top-left', 'top', 'top-right', 'right'],
};
export function UnoArena({
  room,
  me,
  now,
  reduced,
  children,
}: {
  room: RoomView;
  me?: string;
  now: number;
  reduced: boolean;
  children?: ReactNode;
}) {
  const game = room.game;
  if (!game) return null;
  const anchor = Math.max(0, game.players.indexOf(me ?? ''));
  const playerIds = [...game.players.slice(anchor), ...game.players.slice(0, anchor)];
  const current = room.players.find((p) => p.id === game.currentPlayerId);
  const myTurn = game.currentPlayerId === me && !game.winnerId;
  const seconds = Math.min(45, Math.max(0, Math.ceil((game.turnDeadline - now) / 1000)));
  const lastPlayerId = Object.entries(game.lastPlays ?? {}).sort(
    (a, b) => b[1].turnNumber - a[1].turnNumber,
  )[0]?.[0];
  return (
    <section
      className={`game-arena directional-table players-${playerIds.length} ${children ? 'has-hand' : ''}`}
      aria-label="UNO 牌桌"
    >
      <div className="arena-grid" />
      <div className="arena-ring" />
      <span className="arena-brand">
        PLAYROOM <small>UNO CLUB</small>
      </span>
      <div className="arena-play-area">
        {playerIds.map((id, i) => {
          const player = room.players.find((p) => p.id === id);
          if (!player) return null;
          const position = positions[playerIds.length]?.[i] ?? 'top';
          const active = game.currentPlayerId === id && !game.winnerId;
          const lastPlay = game.lastPlays?.[id];
          return (
            <div
              className={`table-position position-${position}`}
              key={id}
              data-player-id={id}
              data-seat-position={position}
            >
              <div className={`table-player ${active ? 'active' : ''}`}>
                <Avatar name={player.name} ai={player.isAI} />
                <div>
                  <b>
                    {player.name}
                    {id === me ? '（你）' : ''}
                  </b>
                  <small>
                    <Layers3 size={10} />
                    {game.handCounts[id]} 张
                    {player.hasLeft ? (
                      ' · AI 接管'
                    ) : !player.connected && !player.isAI ? (
                      ' · 离线'
                    ) : active && player.isAI ? (
                      <span className="thinking"> · 思考中</span>
                    ) : (
                      ''
                    )}
                  </small>
                </div>
                {active && <span className="seat-turn-dot" />}
                {active && (
                  <span
                    className={`seat-timer timer ${seconds <= 10 ? 'urgent' : ''}`}
                    aria-label={`${player.name} 剩余 ${seconds} 秒`}
                  >
                    <Clock3 size={12} />
                    {seconds}s
                  </span>
                )}
              </div>
              <div
                className={`seat-play-position ${lastPlayerId === id ? 'latest-play' : ''}`}
                data-player-id={id}
              >
                {lastPlay ? (
                  <motion.div
                    className="played-card"
                    key={`${lastPlay.turnNumber}-${lastPlay.card.id}`}
                    initial={reduced ? false : { opacity: 0, scale: 0.7, y: -12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <PlayingCard card={lastPlay.card} />
                    <span className="played-caption">
                      {lastPlay.card.color === 'wild' && (
                        <i style={{ background: cardColors[lastPlay.color] }} />
                      )}
                      {lastPlayerId === id ? '刚刚打出' : '上次出牌'}
                    </span>
                  </motion.div>
                ) : (
                  <span className="empty-play-slot">待出牌</span>
                )}
              </div>
            </div>
          );
        })}
        <div className="table-center">
          <div className="deck-stack">
            <PlayingCard back />
            <div className="deck-count">牌堆 · {game.deckCount} 张</div>
          </div>
          <div className="matching-reference">
            {lastPlayerId ? (
              <div
                className="match-target"
                style={{ '--match-color': cardColors[game.color] } as React.CSSProperties}
              >
                <small>当前需要匹配</small>
                <strong>{cardLabel(game.topCard)}</strong>
                <span>{colorNames[game.color]}</span>
              </div>
            ) : (
              <>
                <AnimatePresence mode="wait">
                  <motion.div
                    className="discard-card"
                    key={game.topCard.id}
                    initial={reduced ? false : { y: -40, scale: 0.7, rotate: 12, opacity: 0 }}
                    animate={{ y: 0, scale: 1, rotate: 0, opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.2 }}
                  >
                    <PlayingCard card={game.topCard} />
                  </motion.div>
                </AnimatePresence>
                <div className="deck-count">当前弃牌</div>
              </>
            )}
          </div>
        </div>
        <div className="color-indicator">
          <i style={{ background: cardColors[game.color], color: cardColors[game.color] }} />
          当前颜色 · {colorNames[game.color]}
          <span>{game.direction === 1 ? '↻' : '↺'}</span>
        </div>
        <div className={`turn-banner ${myTurn ? 'my-turn' : ''}`}>
          {game.winnerId ? '本局结束' : myTurn ? '轮到你了，让好牌说话' : `${current?.name ?? '玩家'} 的回合`}
        </div>
      </div>
      {children}
    </section>
  );
}
