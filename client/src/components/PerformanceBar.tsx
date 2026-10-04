import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Wifi } from 'lucide-react';
import { socket } from '@/lib/api';
import { useApp } from '@/stores/app';
import { frameStats } from '@/lib/performance';
import '../styles/performance.css';
/** Local state updates once a second; never writes frame samples into the application store. */
export function PerformanceBar({ game = false }: { game?: boolean }) {
  const connected = useApp((s) => s.connected);
  const [frames, setFrames] = useState<{ fps: number | null; p95: number | null }>({ fps: null, p95: null });
  const [latency, setLatency] = useState<number | 'timeout' | null>(null);
  useEffect(() => {
    let raf = 0,
      previous = 0,
      start = 0,
      intervals: number[] = [];
    function frame(time: number) {
      if (previous) intervals.push(time - previous);
      previous = time;
      if (!start) start = time;
      if (time - start >= 1000) {
        setFrames(frameStats(intervals));
        intervals = [];
        start = time;
      }
      raf = requestAnimationFrame(frame);
    }
    function visibility() {
      cancelAnimationFrame(raf);
      previous = 0;
      start = 0;
      intervals = [];
      if (!document.hidden) raf = requestAnimationFrame(frame);
      else setFrames({ fps: null, p95: null });
    }
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    let disposed = false,
      pending = false;
    setLatency(null);
    function ping() {
      if (!connected || !socket.connected || document.hidden || pending) return;
      pending = true;
      const sent = performance.now();
      // timeout() removes lost acknowledgements; connected guard avoids buffering while offline.
      socket.timeout(3000).emit('system:ping', (error: Error | null) => {
        pending = false;
        if (disposed) return;
        setLatency(error ? 'timeout' : Math.round(performance.now() - sent));
      });
    }
    ping();
    const interval = setInterval(ping, 5000);
    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [connected]);
  const content = (
    <div
      className={`performance-bar ${game ? 'performance-in-game' : ''}`}
      data-testid="performance-bar"
      title="FPS 为浏览器动画帧采样，每秒更新；P95 为本秒 95% 帧间隔。RTT 每 5 秒测量一次到游戏服务器的往返时间，包含网络与服务端响应。后台页面暂停帧采样。"
    >
      <span className={frames.fps !== null && frames.fps < 40 ? 'metric-warning' : ''}>
        <Activity size={12} />
        <b data-testid="performance-fps">{frames.fps ?? '—'}</b>
        <small>FPS</small>
      </span>
      <span className="metric-frame">
        <b>{frames.p95 ?? '—'}</b>
        <small>ms P95</small>
      </span>
      <span
        className={
          !connected || latency === 'timeout' || (typeof latency === 'number' && latency > 150)
            ? 'metric-warning'
            : ''
        }
      >
        <Wifi size={12} />
        <b data-testid="performance-rtt">
          {!connected ? '离线' : latency === 'timeout' ? '超时' : (latency ?? '—')}
        </b>
        <small>{connected && latency !== 'timeout' ? 'ms RTT' : ''}</small>
      </span>
    </div>
  );
  return game ? createPortal(content, document.body) : content;
}
