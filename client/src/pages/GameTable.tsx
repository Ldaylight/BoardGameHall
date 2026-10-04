import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useRoom } from '@/lib/useRoom';
import type { RoomView } from '../../../shared/types';
import type { UnoView } from '../../../shared/games/uno';
import type { GomokuView } from '../../../shared/games/gomoku/types';
const UnoTable = lazy(() => import('./UnoTable').then((m) => ({ default: m.UnoTable })));
const GomokuTable = lazy(() => import('./GomokuTable').then((m) => ({ default: m.GomokuTable })));
export function GameTable() {
  const { room, connected, leave } = useRoom();
  if (!room)
    return (
      <div className="loading-panel">
        <p>正在恢复对局…</p>
        <Link to="/lobby">返回大厅</Link>
      </div>
    );
  return (
    <Suspense fallback={<div className="loading-panel">正在准备游戏桌…</div>}>
      {room.gameId === 'gomoku' ? (
        <GomokuTable room={room as RoomView<GomokuView>} connected={connected} leave={leave} />
      ) : (
        <UnoTable room={room as RoomView<UnoView>} connected={connected} leave={leave} />
      )}
    </Suspense>
  );
}
