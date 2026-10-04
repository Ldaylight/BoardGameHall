import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useRoom } from '@/lib/useRoom';
import type { RoomView } from '../../../shared/types';
import type { UnoView } from '../../../shared/games/uno';
import type { GomokuView } from '../../../shared/games/gomoku/types';
import type { XiangqiView } from '../../../shared/games/xiangqi/types';
import type { DoudizhuView } from '../../../shared/games/doudizhu/types';
const DoudizhuTable = lazy(() => import('./DoudizhuTable').then((m) => ({ default: m.DoudizhuTable })));
const XiangqiTable = lazy(() => import('./XiangqiTable').then((m) => ({ default: m.XiangqiTable })));
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
      {room.gameId === 'doudizhu' ? (
        <DoudizhuTable room={room as RoomView<DoudizhuView>} connected={connected} leave={leave} />
      ) : room.gameId === 'xiangqi' ? (
        <XiangqiTable room={room as RoomView<XiangqiView>} connected={connected} leave={leave} />
      ) : room.gameId === 'gomoku' ? (
        <GomokuTable room={room as RoomView<GomokuView>} connected={connected} leave={leave} />
      ) : (
        <UnoTable room={room as RoomView<UnoView>} connected={connected} leave={leave} />
      )}
    </Suspense>
  );
}
