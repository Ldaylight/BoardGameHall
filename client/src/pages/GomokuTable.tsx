import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock3,
  Flag,
  List,
  LogOut,
  MessageSquare,
  RotateCcw,
  Settings,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { RoomView } from '../../../shared/types';
import type { GomokuAction, GomokuView } from '../../../shared/games/gomoku/types';
import { useApp } from '@/stores/app';
import { perform, request, socket } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Avatar } from '@/components/Layout';
import { Chat } from '@/components/Chat';
import { AudioButton } from '@/components/AudioController';
import { GomokuBoard } from '@/components/GomokuBoard';
import { GameAudioTracker } from '@/lib/game-audio';
import { audioEngine } from '@/lib/audio-engine';
import '../gomoku.css';
export function GomokuTable({
  room,
  connected,
  leave,
}: {
  room: RoomView<GomokuView>;
  connected: boolean;
  leave: () => Promise<void>;
}) {
  const me = useApp((s) => s.session?.user.id);
  const navigate = useNavigate();
  const game = room.game;
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<'chat' | 'logs' | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const tracker = useRef(new GameAudioTracker());
  useEffect(() => {
    if (room.status === 'waiting') navigate(`/room/${room.id}`, { replace: true });
  }, [room.status, room.id, navigate]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    for (const cue of tracker.current.update(room, connected && !document.hidden, me))
      audioEngine.effect(cue.effect, cue.delay);
  }, [room, connected, me]);
  useEffect(() => {
    for (const cue of tracker.current.countdown(room, now, connected && !document.hidden))
      audioEngine.effect(cue.effect, cue.delay);
  }, [room, connected, now]);
  if (!game) return <div className="loading-panel">正在准备棋盘…</div>;
  const isPlayer = game.players.includes(me ?? '');
  const myTurn = !game.endReason && game.currentPlayerId === me;
  const seconds = Math.max(0, Math.ceil((game.turnDeadline - now) / 1000));
  const winner = room.players.find((p) => p.id === game.winnerId);
  const last = game.moves.at(-1);
  const undoMine = game.undoRequest?.playerId === me;
  async function action(action: GomokuAction) {
    if (busy || !connected) return;
    setBusy(true);
    await perform(() =>
      request((ack) => socket.emit('game:action', { roomId: room.id, action, revision: room.revision }, ack)),
    );
    setBusy(false);
  }
  const status = game.draw
    ? '和棋 · 棋逢对手'
    : winner
      ? `${winner.name} 获胜`
      : !isPlayer
        ? '观战中 · 静观棋局'
        : myTurn
          ? '轮到你了，落下一步好棋'
          : '对手正在思考';
  return (
    <div className="game-screen gomoku-screen">
      <header className="table-toolbar">
        <div className="table-toolbar-left">
          <Link to="/lobby" className="table-lobby-link">
            <ArrowLeft size={16} />
            <span>大厅</span>
          </Link>
          <span className="table-room-code">
            五子棋 <small>{room.code}</small>
          </span>
          <span className={`table-connection ${connected ? 'online' : ''}`}>
            {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          </span>
        </div>
        <div className="table-toolbar-actions">
          <AudioButton />
          <Button
            size="sm"
            variant="ghost"
            aria-label="棋局动态"
            aria-expanded={panel === 'logs'}
            onClick={() => setPanel(panel === 'logs' ? null : 'logs')}
          >
            <List size={16} />
            <span>动态</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="棋局聊天"
            aria-expanded={panel === 'chat'}
            onClick={() => setPanel(panel === 'chat' ? null : 'chat')}
          >
            <MessageSquare size={16} />
            <span>聊天</span>
          </Button>
          <Button asChild size="icon" variant="ghost">
            <Link to="/settings" aria-label="主题设置">
              <Settings size={16} />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void leave()} aria-label="离开棋局">
            <LogOut size={14} />
            <span>离开</span>
          </Button>
        </div>
      </header>
      <main className="gomoku-stage">
        <div className="gomoku-player-row">
          {game.players.map((id, index) => {
            const player = room.players.find((p) => p.id === id)!;
            const active = !game.endReason && game.currentPlayerId === id;
            return (
              <section
                key={id}
                className={`gomoku-player glass ${active ? 'active' : ''}`}
                data-player-id={id}
                data-active={active}
              >
                <div className="gomoku-avatar">
                  <Avatar name={player.name} ai={player.isAI} />
                  <span className={`player-stone stone-${index + 1}`} />
                </div>
                <div>
                  <b>
                    {player.name}
                    {id === me ? '（你）' : ''}
                  </b>
                  <small>
                    {index === 0 ? '黑棋 · 先手' : '白棋 · 后手'} ·{' '}
                    {player.hasLeft
                      ? 'AI 接管'
                      : !player.connected && !player.isAI
                        ? '离线'
                        : active
                          ? player.isAI
                            ? '思考中'
                            : '正在落子'
                          : '等待回合'}
                  </small>
                </div>
                {active && (
                  <span
                    className={`gomoku-clock ${seconds <= 10 ? 'urgent' : ''}`}
                    aria-label={`${player.name} 剩余 ${seconds} 秒`}
                  >
                    <Clock3 size={14} />
                    {seconds}s
                  </span>
                )}
              </section>
            );
          })}
        </div>
        <div className="gomoku-table-area">
          <aside className="gomoku-side-note">
            <span className="eyebrow">THE NEXT MOVE</span>
            <h2>
              落子有声
              <br />
              胜负无言。
            </h2>
            <p>
              方寸之间，
              <br />
              每一步都算数。
            </p>
            <div className="gomoku-rule-card">
              <b>
                {game.options.blackForbidden
                  ? '黑棋禁手'
                  : game.options.overlineForbidden
                    ? '黑棋长连禁手'
                    : '自由五子棋'}
              </b>
              <span>15 × 15 · 五子或以上获胜</span>
              <span>
                {game.options.timeoutLoss ? '超时判负' : '超时 AI 代下'} · {game.options.turnSeconds} 秒
              </span>
              <span>{game.options.allowUndo ? '悔棋需对手同意' : '不允许悔棋'}</span>
            </div>
          </aside>
          <GomokuBoard
            game={game}
            canAct={myTurn && connected && !busy}
            onPlace={(x, y) => void action({ type: 'place', x, y })}
          />
          <aside className="gomoku-side-note move-note">
            <span className="eyebrow">ON THE BOARD</span>
            <strong>{String(game.moves.length).padStart(2, '0')}</strong>
            <p>已落子 / 225</p>
            <div className="gomoku-recent">
              <b>最近落子</b>
              {game.moves
                .slice(-5)
                .reverse()
                .map((move, i) => (
                  <div key={`${move.x}-${move.y}`}>
                    <i className={`player-stone stone-${move.stone}`} />
                    <span>
                      {String.fromCharCode(65 + move.x)}
                      {15 - move.y}
                    </span>
                    <small>第 {game.moves.length - i} 手</small>
                  </div>
                ))}
            </div>
          </aside>
        </div>
        <footer className="gomoku-controls glass">
          <div className={`gomoku-status ${myTurn ? 'your-turn' : ''}`}>
            <i />
            <div>
              <b>{connected ? status : '正在重连，棋盘由服务器保留'}</b>
              <small>
                {game.endReason
                  ? game.endReason === 'resign'
                    ? '对手认输'
                    : game.endReason === 'timeout'
                      ? '超时判负'
                      : game.draw
                        ? '无人五连，本局平局'
                        : '五子连珠'
                  : last
                    ? `上一手 ${String.fromCharCode(65 + last.x)}${15 - last.y} · 点击交叉点落子`
                    : '黑棋先手 · 点击交叉点落子'}
              </small>
            </div>
          </div>
          <div className="gomoku-control-buttons">
            {!game.endReason && isPlayer && game.options.allowUndo && (
              <Button
                size="sm"
                variant="outline"
                disabled={
                  busy ||
                  !connected ||
                  !game.moves.length ||
                  !!game.undoRequest ||
                  game.undoUsed.includes(me!)
                }
                onClick={() => void action({ type: 'undo:request' })}
              >
                <RotateCcw size={14} />
                申请悔棋
              </Button>
            )}
            {!game.endReason && isPlayer && game.options.allowResign && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || !connected}
                onClick={() => setConfirmResign(true)}
              >
                <Flag size={14} />
                认输
              </Button>
            )}
            {game.endReason && room.hostId === me && (
              <Button
                size="sm"
                disabled={busy || !connected || !room.resultSaved}
                onClick={() =>
                  void perform(() => request((ack) => socket.emit('room:rematch', { roomId: room.id }, ack)))
                }
              >
                <RotateCcw size={14} />
                再来一局
              </Button>
            )}
          </div>
        </footer>
        {game.undoRequest && (
          <div className="gomoku-undo-banner glass" role="status">
            {undoMine ? '已申请悔棋，等待对手同意；继续落子将取消申请。' : '对手申请悔棋，你是否同意？'}
            {!undoMine && isPlayer && (
              <>
                <Button
                  size="sm"
                  disabled={busy || !connected}
                  onClick={() => void action({ type: 'undo:respond', accept: true })}
                >
                  同意
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || !connected}
                  onClick={() => void action({ type: 'undo:respond', accept: false })}
                >
                  拒绝
                </Button>
              </>
            )}
          </div>
        )}
      </main>
      <Dialog
        open={!!panel}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <DialogContent className="table-drawer-content">
          <DialogTitle>{panel === 'chat' ? '棋局聊天' : '棋局动态'}</DialogTitle>
          <DialogDescription>与朋友聊聊，记录每一步好棋。</DialogDescription>
          {panel === 'chat' ? (
            <Chat room={room} />
          ) : (
            <div className="table-log-list">
              {[...game.logs].reverse().map((log) => (
                <p key={log.id}>{log.text}</p>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={confirmResign} onOpenChange={setConfirmResign}>
        <DialogContent>
          <DialogTitle>确认认输？</DialogTitle>
          <DialogDescription>本局将结束，对手获胜。</DialogDescription>
          <div className="winner-buttons">
            <Button variant="outline" onClick={() => setConfirmResign(false)}>
              继续对局
            </Button>
            <Button
              disabled={busy || !connected}
              onClick={() => {
                setConfirmResign(false);
                void action({ type: 'resign' });
              }}
            >
              确认认输
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
