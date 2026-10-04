import { motion } from 'framer-motion';
import { useId, type ReactNode } from 'react';
import type { RoomView } from '../../../shared/types';
import { colorNames } from '../../../shared/games/uno';
import { cardColors, PlayingCard } from './PlayingCard';
import { BackStack, PlayerSeat } from './PlayerSeat';

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
  pendingDraws = {},
  children,
}: {
  room: RoomView;
  me?: string;
  now: number;
  reduced: boolean;
  pendingDraws?: Record<string, number>;
  children?: ReactNode;
}) {
  const arrowId = useId().replace(/:/g, '');
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
  const pile = game.discardPile ?? [game.topCard];
  return (
    <section
      className={`game-arena directional-table table-v2 players-${playerIds.length} ${children ? 'has-hand' : ''}`}
      aria-label="UNO 牌桌"
    >
      <div className="arena-grid" />
      <div className="arena-ring" />
      <span className="arena-brand">
        PLAYROOM <small>UNO CLUB</small>
      </span>
      <div className="arena-play-area">
        <div className="deck-corner" data-draw-deck>
          <BackStack count={game.deckCount} deck />
          <span>摸牌堆</span>
        </div>
        {playerIds.map((id, i) => {
          const player = room.players.find((p) => p.id === id);
          if (!player || (id === me && children)) return null;
          const position = positions[playerIds.length]?.[i] ?? 'top';
          const active = game.currentPlayerId === id && !game.winnerId;
          const blocked = (game.blockedPlayers ?? []).includes(id);
          const lastPlay = game.lastPlays?.[id];
          return (
            <div
              className={`table-position position-${position}`}
              key={id}
              data-player-id={id}
              data-seat-position={position}
            >
              <div className="opponent-seat">
                <PlayerSeat player={player} active={active} blocked={blocked} seconds={seconds} />
                <BackStack
                  count={Math.max(0, game.handCounts[id] - (pendingDraws[id] ?? 0))}
                  blocked={blocked}
                  playerId={id}
                />
              </div>
              <div
                className={`seat-play-position ${lastPlayerId === id ? 'latest-play' : ''}`}
                data-player-id={id}
              >
                {lastPlay && (
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
                )}
              </div>
            </div>
          );
        })}
        <div className="table-center">
          <div
            className={`direction-ring ${game.direction === -1 ? 'reversed' : ''}`}
            data-direction={game.direction === 1 ? 'clockwise' : 'counterclockwise'}
            aria-label={`出牌顺序：${game.direction === 1 ? '顺时针' : '逆时针'}`}
          >
            <svg viewBox="0 0 360 360" aria-hidden="true">
              <defs>
                <marker
                  id={arrowId}
                  viewBox="0 0 12 12"
                  refX="8"
                  refY="6"
                  markerWidth="3.8"
                  markerHeight="3.8"
                  orient="auto"
                >
                  <path d="M0 0 12 6 0 12 3 6Z" />
                </marker>
              </defs>
              <path d="M104 42 A157 157 0 0 1 318 252" markerEnd={`url(#${arrowId})`} />
              <path d="M256 318 A157 157 0 0 1 42 108" markerEnd={`url(#${arrowId})`} />
            </svg>
          </div>
          <div
            className="discard-pile"
            data-discard-target
            aria-label={`中央弃牌堆，当前 ${colorNames[game.color]}`}
          >
            {pile.map((card, i) => (
              <motion.div
                key={card.id}
                className={`pile-layer ${i === pile.length - 1 ? 'discard-card pile-top' : ''}`}
                style={{ zIndex: i }}
                initial={reduced ? false : { opacity: 0, scale: 0.75 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  rotate: i === pile.length - 1 ? -7 : [19, -25, 32, -13, 25, -32][i % 6],
                  x: i === pile.length - 1 ? 0 : [8, -9, 12, -6][i % 4],
                  y: i === pile.length - 1 ? 0 : [6, -4, 8, 3][i % 4],
                }}
                transition={{ duration: reduced ? 0 : 0.3 }}
              >
                <PlayingCard card={card} />
              </motion.div>
            ))}
          </div>
          <span className="direction-label">{game.direction === 1 ? '↻ 顺时针' : '↺ 逆时针'}</span>
        </div>
        {me && children && game.lastPlays?.[me] && (
          <div
            className={`own-public-play seat-play-position ${lastPlayerId === me ? 'latest-play' : ''}`}
            data-player-id={me}
          >
            <div className="played-card">
              <PlayingCard card={game.lastPlays[me].card} />
              <span className="played-caption">你的出牌</span>
            </div>
          </div>
        )}
        <div className="color-indicator">
          <i style={{ background: cardColors[game.color], color: cardColors[game.color] }} />
          当前颜色 · {colorNames[game.color]}
        </div>
        <div className={`turn-banner ${myTurn ? 'my-turn' : ''}`}>
          {game.winnerId ? '本局结束' : myTurn ? '轮到你了，让好牌说话' : `${current?.name ?? '玩家'} 的回合`}
        </div>
      </div>
      {children}
    </section>
  );
}
