import './seat-countdown.css';

/** Mounted beside an opponent's cards or centered above the local player's hand. */
export function SeatCountdown({
  playerId,
  name,
  seconds,
  ready = false,
}: {
  playerId: string;
  name: string;
  seconds?: number;
  ready?: boolean;
}) {
  if (!ready && seconds === undefined) return null;
  const remaining = Math.max(0, seconds ?? 0);
  return (
    <span
      className={`seat-countdown ${ready ? 'ready' : remaining <= 5 ? 'urgent' : ''}`}
      data-testid="seat-countdown"
      data-player-id={playerId}
      data-ready={ready || undefined}
      role="timer"
      aria-label={ready ? `${name} 已准备` : `${name} 回合倒计时 ${remaining} 秒`}
    >
      {ready ? (
        '✓ 准备'
      ) : (
        <>
          <b>{remaining}</b>
          <small>秒</small>
        </>
      )}
    </span>
  );
}
