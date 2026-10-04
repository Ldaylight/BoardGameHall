import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Lobby } from '@/pages/Lobby';
import { Room } from '@/pages/Room';
import { Profile } from '@/pages/Profile';
import { Settings } from '@/pages/Settings';
import { XiangqiEndgames } from '@/pages/XiangqiEndgames';
import { connectSession } from '@/lib/api';
import { useApp } from '@/stores/app';
import { MotionConfig } from 'framer-motion';
import { AudioController } from '@/components/AudioController';
import './styles.css';
import './themes.css';
import './table.css';
import './game-screen.css';
import './table-v2.css';
import './audio.css';
import './gomoku.css';
import { applyTheme, savedTheme } from '@/lib/themes';
const GameTable = React.lazy(() =>
  import('@/pages/GameTable').then((module) => ({ default: module.GameTable })),
);
applyTheme(savedTheme());
document.body.classList.toggle('reduce-motion', localStorage.getItem('playroom-motion') === 'off');
void connectSession().catch((error) =>
  useApp
    .getState()
    .notify(`连接失败：${error instanceof Error ? error.message : '请确认后端已启动'}。刷新可重试。`),
);
function MotionPreferences({ children }: { children: React.ReactNode }) {
  const enabled = useApp((s) => s.motionEnabled);
  return <MotionConfig reducedMotion={enabled ? 'user' : 'always'}>{children}</MotionConfig>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionPreferences>
      <BrowserRouter>
        <AudioController />
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/lobby" replace />} />
            <Route path="lobby" element={<Lobby />} />
            <Route path="room/:roomId" element={<Room />} />
            <Route
              path="game/:roomId"
              element={
                <React.Suspense fallback={<div className="loading-panel">正在准备牌桌…</div>}>
                  <GameTable />
                </React.Suspense>
              }
            />
            <Route path="profile" element={<Profile />} />
            <Route path="settings" element={<Settings />} />
            <Route path="xiangqi/endgames" element={<XiangqiEndgames />} />
            <Route path="*" element={<Navigate to="/lobby" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MotionPreferences>
  </React.StrictMode>,
);
