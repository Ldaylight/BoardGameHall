import { Clock3 } from 'lucide-react';
import type { Player } from '../../../shared/types';
import { Avatar } from './Layout';

export function BanMark({ className = '', label = '本回合被禁止' }: { className?: string; label?: string }) {
  return (
    <span className={`ban-mark ${className}`} role="img" aria-label={label}>
      <svg viewBox="0 0 60 60" aria-hidden="true">
        <circle cx="30" cy="30" r="24" />
        <path d="M13 47 47 13" />
      </svg>
    </span>
  );
}
export function BackStack({
  count,
  blocked = false,
  deck = false,
  playerId,
}: {
  count: number;
  blocked?: boolean;
  deck?: boolean;
  playerId?: string;
}) {
  const visible = deck ? Math.min(4, count) : count;
  const step = Math.min(deck ? 3 : 8, 56 / Math.max(1, visible - 1));
  return (
    <div
      className={`back-stack ${deck ? 'draw-stack' : ''}`}
      data-hand-target={playerId}
      data-card-count={count}
      aria-label={`${deck ? '剩余牌堆' : '剩余手牌'} ${count} 张`}
      style={{ '--back-count': visible, '--back-step': `${step}px` } as React.CSSProperties}
    >
      {Array.from({ length: visible }, (_, i) => (
        <span
          key={i}
          className="mini-card-back"
          style={
            {
              '--back-index': i,
              '--back-angle': `${deck ? -4 + i * 2 : ((i % 3) - 1) * 3}deg`,
            } as React.CSSProperties
          }
        >
          <i>UNO</i>
          {i === visible - 1 && (
            <strong>
              {count}
              <small>张</small>
            </strong>
          )}
        </span>
      ))}
      {!count && <span className="empty-hand-count">0 张</span>}
      {blocked && <BanMark className="back-stack-ban" />}
    </div>
  );
}
export function PlayerSeat({
  player,
  active,
  blocked,
  seconds,
  own = false,
}: {
  player: Player;
  active: boolean;
  blocked: boolean;
  seconds: number;
  own?: boolean;
}) {
  return (
    <div className={`table-player ${active ? 'active' : ''} ${blocked ? 'is-blocked' : ''}`}>
      <div className="seat-avatar">
        <Avatar name={player.name} ai={player.isAI} />
        {blocked && <BanMark className="avatar-ban" label={`${player.name} 被禁止出牌`} />}
      </div>
      <div className="seat-name">
        <b>
          {player.name}
          {own ? '（你）' : ''}
        </b>
        <small>
          {blocked ? (
            '等待下一次回合'
          ) : player.hasLeft ? (
            'AI 接管'
          ) : !player.connected && !player.isAI ? (
            '离线'
          ) : active && player.isAI ? (
            <span className="thinking">思考中 · 2–3 秒</span>
          ) : active ? (
            own ? (
              '你的回合'
            ) : (
              '正在出牌'
            )
          ) : (
            '等待回合'
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
  );
}
