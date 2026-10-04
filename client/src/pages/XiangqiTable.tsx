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
  Lightbulb,
  BookOpen,
  Settings,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { RoomView } from '../../../shared/types';
import { pieceNames, type XiangqiAction, type XiangqiView } from '../../../shared/games/xiangqi/types';
import { coordinate, endgameById } from '../../../shared/games/xiangqi/endgames';
import { useApp } from '@/stores/app';
import { perform, request, socket } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Avatar } from '@/components/Layout';
import { Chat } from '@/components/Chat';
import { AudioButton } from '@/components/AudioController';
import { XiangqiBoard } from '@/components/XiangqiBoard';
import { GameAudioTracker } from '@/lib/game-audio';
import { audioEngine } from '@/lib/audio-engine';
import { markSolved } from '@/lib/xiangqi-progress';
import '../xiangqi.css';
const reasonLabels = {
  checkmate: '将死',
  stalemate: '困毙',
  general: '将帅被吃',
  resign: '认输',
  timeout: '超时判负',
  repetition: '重复局面和棋',
  'perpetual-check': '单方长将判负',
  'perpetual-chase': '单方长捉判负',
  'no-progress': '60 回合无进展和棋',
};
export function XiangqiTable({
  room,
  connected,
  leave,
}: {
  room: RoomView<XiangqiView>;
  connected: boolean;
  leave: () => Promise<void>;
}) {
  const me = useApp((s) => s.session?.user.id),
    navigate = useNavigate(),
    game = room.game;
  const [now, setNow] = useState(Date.now()),
    [busy, setBusy] = useState(false),
    [panel, setPanel] = useState<'chat' | 'logs' | 'rules' | null>(null),
    [confirmResign, setConfirmResign] = useState(false),
    [hint, setHint] = useState(false);
  const tracker = useRef(new GameAudioTracker());
  useEffect(() => {
    if (room.status === 'waiting') navigate(`/room/${room.id}`, { replace: true });
  }, [room.status, room.id, navigate]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    for (const cue of tracker.current.update(room, connected && !document.hidden, me))
      audioEngine.effect(cue.effect, cue.delay);
  }, [room, connected, me]);
  useEffect(() => {
    for (const cue of tracker.current.countdown(room, now, connected && !document.hidden))
      audioEngine.effect(cue.effect, cue.delay);
  }, [room, connected, now]);
  useEffect(() => {
    if (
      game?.options.mode === 'puzzle' &&
      game.winnerId === me &&
      (game.endReason === 'checkmate' || game.endReason === 'stalemate' || game.endReason === 'general') &&
      me &&
      game.options.puzzleId
    )
      markSolved(me, game.options.puzzleId);
  }, [game?.winnerId, game?.options.mode, game?.options.puzzleId, me]);
  if (!game) return <div className="loading-panel">正在布置棋盘…</div>;
  const isPlayer = game.players.includes(me ?? ''),
    myTurn = !game.endReason && game.currentPlayerId === me,
    seconds = Math.max(0, Math.ceil((game.turnDeadline - now) / 1000));
  const winner = room.players.find((p) => p.id === game.winnerId),
    puzzle = endgameById(game.options.puzzleId),
    last = game.moves.at(-1);
  async function action(action: XiangqiAction) {
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
      ? `${winner.name} 获胜${puzzle && game.winnerId === me ? ' · 残局已解开' : ''}`
      : !isPlayer
        ? '观战中'
        : myTurn
          ? game.checkedSide
            ? '你被将军了，请应将'
            : '轮到你了，选择棋子走棋'
          : game.checkedSide
            ? '对手正在应将'
            : '对手正在思考';
  return (
    <div className="game-screen xiangqi-screen">
      <header className="table-toolbar">
        <div className="table-toolbar-left">
          <Link to="/lobby" className="table-lobby-link">
            <ArrowLeft size={16} />
            <span>大厅</span>
          </Link>
          <span className="table-room-code">
            中国象棋 <small>{room.code}</small>
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
            aria-label="象棋动态"
            aria-expanded={panel === 'logs'}
            onClick={() => setPanel(panel === 'logs' ? null : 'logs')}
          >
            <List size={16} />
            <span>动态</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="象棋聊天"
            aria-expanded={panel === 'chat'}
            onClick={() => setPanel(panel === 'chat' ? null : 'chat')}
          >
            <MessageSquare size={16} />
            <span>聊天</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPanel(panel === 'rules' ? null : 'rules')}
            aria-label="象棋规则"
          >
            <BookOpen size={16} />
            <span>规则</span>
          </Button>
          <Button asChild size="icon" variant="ghost">
            <Link to="/settings" aria-label="主题设置">
              <Settings size={16} />
            </Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void leave()} aria-label="离开棋局">
            <LogOut size={14} />
            <span>离开</span>
          </Button>
        </div>
      </header>
      <main className="xiangqi-stage">
        <div className="xiangqi-players">
          {game.players.map((id, index) => {
            const p = room.players.find((p) => p.id === id)!;
            const active = !game.endReason && game.currentPlayerId === id;
            return (
              <section
                className={`xiangqi-player glass ${active ? 'active' : ''} side-${index === 0 ? 'red' : 'black'}`}
                key={id}
                data-active={active}
              >
                <Avatar name={p.name} ai={p.isAI} />
                <div>
                  <b>
                    {p.name}
                    {id === me ? '（你）' : ''}
                  </b>
                  <small>
                    {index === 0 ? '红方 · 先手' : '黑方 · 后手'} ·{' '}
                    {p.hasLeft
                      ? 'AI 接管'
                      : !p.connected && !p.isAI
                        ? '离线'
                        : active
                          ? '思考中'
                          : '等待回合'}
                  </small>
                </div>
                {active && (
                  <span className={`xiangqi-clock ${seconds <= 10 ? 'urgent' : ''}`}>
                    <Clock3 size={14} />
                    {seconds}s
                  </span>
                )}
              </section>
            );
          })}
        </div>
        <div className="xiangqi-table-area">
          <aside className="xiangqi-side-info">
            <span className="eyebrow">{puzzle ? 'CLASSIC ENDGAME' : 'ACROSS THE RIVER'}</span>
            <h2>{puzzle?.name ?? '楚河汉界'}</h2>
            <p>{puzzle?.description ?? '车直行，马日跳，炮隔子吃。选中棋子，青色落点就是合法着法。'}</p>
            {puzzle && (
              <>
                <Button size="sm" variant="outline" aria-expanded={hint} onClick={() => setHint(!hint)}>
                  <Lightbulb size={14} />
                  {hint ? '收起提示' : '看看提示'}
                </Button>
                {hint && (
                  <p className="xiangqi-hint">
                    {game.moves.length < 2
                      ? puzzle.hint
                      : puzzle.solution[game.moves.length]
                        ? `下一手：${coordinate(puzzle.solution[game.moves.length].from)} → ${coordinate(puzzle.solution[game.moves.length].to)}`
                        : '尝试将对方将死。'}
                  </p>
                )}
              </>
            )}
            <div className="xiangqi-rule-card">
              <span>9 × 10 棋盘 · 将死 / 困毙获胜</span>
              <span>
                {game.options.turnSeconds}s · {game.options.timeoutLoss ? '超时判负' : '超时 AI 代下'}
              </span>
              <span>重复局面判和 · 单方长将判负</span>
            </div>
            <div className="xiangqi-captured">
              <b>已吃棋子</b>
              {game.captured.length ? (
                game.captured.map((p, i) => (
                  <span key={`${p.id}-${i}`} className={`captured-${p.side}`}>
                    {pieceNames[p.side][p.kind]}
                  </span>
                ))
              ) : (
                <small>双方整装待发</small>
              )}
            </div>
          </aside>
          <XiangqiBoard
            game={game}
            me={me}
            canAct={myTurn && connected && !busy}
            connected={connected}
            matchId={room.matchId}
            onMove={(a) => void action(a)}
          />
          <aside className="xiangqi-side-info recent-moves">
            <span className="eyebrow">ON THE BOARD</span>
            <strong>{String(game.turnNumber).padStart(2, '0')}</strong>
            <p>已走步数</p>
            {game.moves
              .slice(-6)
              .reverse()
              .map((m) => (
                <div className="xiangqi-recent-move" key={m.number}>
                  <i className={`captured-${m.piece.side}`}>{pieceNames[m.piece.side][m.piece.kind]}</i>
                  <span>
                    {coordinate(m.from)} → {coordinate(m.to)}
                  </span>
                  <small>{m.check ? '将军' : m.captured ? '吃子' : `第 ${m.number} 手`}</small>
                </div>
              ))}
          </aside>
        </div>
        <footer className="xiangqi-controls glass">
          <div className={`xiangqi-status ${myTurn ? 'your-turn' : ''}`} role="status">
            <b>{connected ? status : '正在重连，棋盘由服务器保留'}</b>
            <small>
              {game.endReason
                ? reasonLabels[game.endReason]
                : last
                  ? `上一手 ${coordinate(last.from)} → ${coordinate(last.to)} · 点击棋子，再点击落点`
                  : '红方先行 · 点击棋子查看合法落点'}
            </small>
          </div>
          <div className="xiangqi-control-buttons">
            {puzzle && (
              <Button size="sm" variant="ghost" className="mobile-puzzle-hint" onClick={() => setHint(!hint)}>
                <Lightbulb size={14} />
                提示
              </Button>
            )}
            {!game.endReason && isPlayer && (
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
                {puzzle ? '重试残局' : '再来一局'}
              </Button>
            )}
            {game.endReason && puzzle && (
              <Button size="sm" variant="outline" asChild>
                <Link to="/xiangqi/endgames">更多残局</Link>
              </Button>
            )}
          </div>
        </footer>
        {hint && puzzle && (
          <p className="mobile-puzzle-hint xiangqi-mobile-hint">
            {game.moves.length < 2
              ? puzzle.hint
              : puzzle.solution[game.moves.length]
                ? `下一手：${coordinate(puzzle.solution[game.moves.length].from)} → ${coordinate(puzzle.solution[game.moves.length].to)}`
                : '试着完成绝杀。'}
          </p>
        )}
      </main>
      <Dialog
        open={!!panel}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <DialogContent className="table-drawer-content">
          <DialogTitle>
            {panel === 'chat' ? '象棋聊天' : panel === 'logs' ? '棋局动态' : '中国象棋 · 大厅规则'}
          </DialogTitle>
          <DialogDescription>楚河汉界，每一步都算数。</DialogDescription>
          {panel === 'chat' ? (
            <Chat room={room} />
          ) : panel === 'logs' ? (
            <div className="table-log-list">
              {[...game.logs].reverse().map((l) => (
                <p key={l.id}>{l.text}</p>
              ))}
            </div>
          ) : (
            <div className="xiangqi-rules-text">
              <p>
                红先黑后，轮流走一枚己方棋子。将帅走九宫内一步直线，仕士走九宫内一步斜线；相象走田且不可过河，马走日且不可蹩腿；车走直线，炮平移无阻、吃子必须隔一枚炮架；兵卒向前一步，过河后可平移，不能后退。
              </p>
              <p>
                不能将自己暴露于将军，也不能将帅照面。被将军必须应将；将死、困毙均判负。三次重复同一局面与走棋方时，单方长将或持续追捉同一无保护大子判负，其余重复判和；连续
                60 回合不吃子且无兵卒向前则和棋。
              </p>
              <p>
                大厅采用休闲判罚，未覆盖竞赛规则的全部长捉例外。
                <a href="https://www.xiangqi.com/help/pieces-and-moves" target="_blank" rel="noreferrer">
                  查看棋子走法 ↗
                </a>
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={confirmResign} onOpenChange={setConfirmResign}>
        <DialogContent>
          <DialogTitle>确认认输？</DialogTitle>
          <DialogDescription>本局结束，对手获胜。残局可重新挑战。</DialogDescription>
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
