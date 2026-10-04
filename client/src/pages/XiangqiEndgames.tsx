import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Check, Puzzle } from 'lucide-react';
import { endgames } from '../../../shared/games/xiangqi/endgames';
import { pieceNames, type Endgame } from '../../../shared/games/xiangqi/types';
import type { Difficulty, RoomView } from '../../../shared/types';
import { useApp } from '@/stores/app';
import { request, socket } from '@/lib/api';
import { solvedPuzzles } from '@/lib/xiangqi-progress';
import { Button } from '@/components/ui/button';
import '../xiangqi.css';
function Preview({ puzzle }: { puzzle: Endgame }) {
  return (
    <svg className="endgame-preview" viewBox="0 0 270 300" aria-label={`${puzzle.name}初始棋盘`}>
      <g stroke="currentColor" opacity=".2" fill="none">
        {Array.from({ length: 10 }, (_, y) => (
          <path key={`r${y}`} d={`M15 ${15 + y * 30} H255`} />
        ))}
        {Array.from({ length: 9 }, (_, x) => (
          <path key={`c${x}`} d={`M${15 + x * 30} 15 V135 M${15 + x * 30} 165 V285`} />
        ))}
        <path d="M105 15 L165 75 M165 15 L105 75 M105 225 L165 285 M165 225 L105 285" />
      </g>
      <text x="135" y="154" textAnchor="middle" className="preview-river">
        楚河 · 汉界
      </text>
      {puzzle.pieces.map((p) => (
        <g key={p.id}>
          <circle
            cx={15 + p.x * 30}
            cy={15 + p.y * 30}
            r="12"
            fill={p.side === 'red' ? '#f5d6ac' : '#172c33'}
            stroke={p.side === 'red' ? '#ed956b' : '#67e8dd'}
          />
          <text
            x={15 + p.x * 30}
            y={19 + p.y * 30}
            textAnchor="middle"
            fill={p.side === 'red' ? '#a3312c' : '#c5ece4'}
            fontSize="15"
            fontWeight="bold"
          >
            {pieceNames[p.side][p.kind]}
          </text>
        </g>
      ))}
    </svg>
  );
}
export function XiangqiEndgames() {
  const navigate = useNavigate();
  const userId = useApp((s) => s.session?.user.id);
  const connected = useApp((s) => s.connected);
  const [difficulty, setDifficulty] = useState<Difficulty>('hard');
  const [busy, setBusy] = useState<string | null>(null);
  const solved = solvedPuzzles(userId);
  async function challenge(puzzle: Endgame) {
    setBusy(puzzle.id);
    let room: RoomView | null = null;
    try {
      room = await request<RoomView>((ack) =>
        socket.emit(
          'room:create',
          {
            gameId: 'xiangqi',
            name: `残局 · ${puzzle.name}`,
            maxPlayers: 2,
            allowAI: true,
            allowSpectators: true,
            difficulty,
            xiangqi: { mode: 'puzzle', puzzleId: puzzle.id, turnSeconds: 180, timeoutLoss: false },
          },
          ack,
        ),
      );
      useApp.getState().setActiveRoom(room);
      const roomId = room.id;
      await request((ack) => socket.emit('room:ai', { roomId, difficulty }, ack));
      await request((ack) => socket.emit('room:ready', { roomId, ready: true }, ack));
      await request((ack) => socket.emit('room:start', { roomId }, ack));
      navigate(`/game/${roomId}`);
    } catch (error) {
      useApp.getState().notify(error instanceof Error ? error.message : '挑战启动失败');
      if (room) navigate(`/room/${room.id}`);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="endgames-page">
      <div className="breadcrumb">
        <Link to="/lobby">
          <ArrowLeft size={14} /> 桌游大厅
        </Link>
        <span> / 中国象棋</span>
      </div>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ONE BOARD. A THOUSAND POSSIBILITIES.</span>
          <h1>残局里，藏着一手好棋</h1>
          <p>经典杀法 · 教学残局。你执红先行，找出一步或两步绝杀。</p>
        </div>
        <label className="endgame-difficulty">
          防守 AI
          <select
            aria-label="残局 AI 难度"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
          >
            <option value="easy">简单 · 随机着法</option>
            <option value="medium">中等 · 攻防评分</option>
            <option value="hard">困难 · Alpha-Beta 搜索</option>
          </select>
        </label>
      </div>
      <div className="endgame-progress glass">
        <Puzzle size={18} />
        <span>
          已解开 {solved.filter((id) => endgames.some((p) => p.id === id)).length} / {endgames.length} 个残局
        </span>
        <small>进度保存在此浏览器，棋谱保存到战绩；练习不计金币和排行。</small>
      </div>
      <div className="endgame-grid">
        {endgames.map((p) => (
          <article className="endgame-card glass" key={p.id}>
            <Preview puzzle={p} />
            <div className="endgame-card-body">
              <span className="eyebrow">
                {p.level} · {p.solution.filter((_, i) => i % 2 === 0).length} 步杀
              </span>
              <h2>
                {p.name}
                {solved.includes(p.id) && <Check size={19} aria-label="已通关" />}
              </h2>
              <strong>{p.theme}</strong>
              <p>{p.description}</p>
              <Button disabled={!!busy || !connected} onClick={() => void challenge(p)}>
                {busy === p.id ? '正在布置棋盘…' : '挑战残局'}
                <ArrowUpRight size={16} />
              </Button>
            </div>
          </article>
        ))}
      </div>
      <p className="endgame-footnote">
        以上是根据经典杀法制作的原创教学局面，并非古谱原局抄录。
        <a href="https://www.xiangqi.com/articles/checkmate-strategies" target="_blank" rel="noreferrer">
          了解经典杀法 ↗
        </a>
      </p>
    </div>
  );
}
