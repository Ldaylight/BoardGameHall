import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  Eye,
  Layers3,
  List,
  LogOut,
  MessageSquare,
  Play,
  RotateCcw,
  Settings,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  uno,
  cardLabel,
  colors,
  colorNames,
  type Card,
  type Color,
  type UnoAction,
} from '../../../shared/games/uno';
import { useRoom } from '@/lib/useRoom';
import { useApp } from '@/stores/app';
import { perform, request, socket } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { UnoArena } from '@/components/UnoArena';
import { InviteButton } from '@/components/RoomDialogs';
import { Chat } from '@/components/Chat';
import { cardColors, PlayingCard } from '@/components/PlayingCard';
import { AudioButton } from '@/components/AudioController';
import { audioEngine } from '@/lib/audio-engine';
import { GameAudioTracker } from '@/lib/game-audio';
import { BackStack, BanMark, PlayerSeat } from '@/components/PlayerSeat';
import { DrawFlights, DraggedCard } from '@/components/CardFlights';
import { sortHand, type ScreenPoint } from '@/lib/table-presentation';
import { useDrawAnimations } from '@/lib/useDrawAnimations';
export function GameTable() {
  const { room, connected, leave } = useRoom();
  const me = useApp((s) => s.session?.user.id);
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const [wild, setWild] = useState<Card | null>(null);
  const [wildOrigin, setWildOrigin] = useState<ScreenPoint | undefined>();
  const [dragCard, setDragCard] = useState<{ card: Card; point: ScreenPoint } | null>(null);
  const [panel, setPanel] = useState<'logs' | 'chat' | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [flight, setFlight] = useState<{
    card: Card;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  } | null>(null);
  const [dismissedWinner, setDismissedWinner] = useState<string | null>(null);
  const reduced = useReducedMotion() || localStorage.getItem('playroom-motion') === 'off';
  const draws = useDrawAnimations(room, me, connected, Boolean(reduced));
  const soundTracker = useRef(new GameAudioTracker());
  useEffect(() => {
    const cues = soundTracker.current.update(room, connected && !document.hidden, me);
    for (const cue of cues) audioEngine.effect(cue.effect, cue.delay);
  }, [room, connected, me]);
  useEffect(() => {
    const cues = soundTracker.current.countdown(room, now, connected && !document.hidden);
    for (const cue of cues) audioEngine.effect(cue.effect, cue.delay);
  }, [room, connected, now]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (room?.status === 'waiting') navigate(`/room/${room.id}`, { replace: true });
  }, [room?.status, room?.id, navigate]);
  const game = room?.game;
  useEffect(() => {
    if (selected && !game?.hand.some((c) => c.id === selected)) setSelected(null);
  }, [game?.hand, selected]);
  if (!room || !game)
    return (
      <div className="loading-panel">
        <Layers3 size={36} />
        <p>正在恢复你的牌桌…</p>
        <Button variant="outline" asChild>
          <Link to="/lobby">返回大厅</Link>
        </Button>
      </div>
    );
  const myTurn = game.currentPlayerId === me && !game.winnerId;
  const legal = uno.getLegalActions(game, me ?? '');
  const playable = new Set(
    legal.filter((a) => a.type === 'play').map((a) => (a.type === 'play' ? a.cardId : '')),
  );
  const isPlayer = room.players.some((p) => p.id === me);
  const winner = room.players.find((p) => p.id === game.winnerId);
  const declared = game.unoDeclared?.playerId === me && game.unoDeclared?.turnNumber === game.turnNumber;
  const selectedCard = game.hand.find((c) => c.id === selected);
  async function action(a: UnoAction, origin?: ScreenPoint) {
    if (!room || busy) return;
    const played = a.type === 'play' ? game?.hand.find((c) => c.id === a.cardId) : undefined;
    const from =
      a.type === 'play'
        ? document.querySelector(`.hand-slot[data-card-id="${a.cardId}"] button`)?.getBoundingClientRect()
        : undefined;
    const to = document.querySelector('[data-discard-target]')?.getBoundingClientRect();
    setBusy(true);
    await perform(async () => {
      await request((ack) =>
        socket.emit('game:action', { roomId: room.id, action: a, revision: room.revision }, ack),
      );
      if (played && from && to && !reduced)
        setFlight({
          card: played,
          fromX: origin ? origin.x - 38 : from.left,
          fromY: origin ? origin.y - 65 : from.top,
          toX: to.left,
          toY: to.top,
        });
      if (a.type !== 'uno') {
        setSelected(null);
        setWild(null);
      }
    });
    setBusy(false);
  }
  function play(card: Card, origin?: ScreenPoint) {
    if (!myTurn || !playable.has(card.id) || busy) return;
    if (card.color === 'wild') {
      setWild(card);
      setWildOrigin(origin);
      return;
    }
    void action({ type: 'play', cardId: card.id }, origin);
  }
  const canAct = connected && !busy && !(me && draws.pendingDraws[me]);
  const ownPlayer = room.players.find((p) => p.id === me);
  const blocked = (game.blockedPlayers ?? []).includes(me ?? '');
  const hand = sortHand(game.hand);
  const seconds = Math.min(45, Math.max(0, Math.ceil((game.turnDeadline - now) / 1000)));
  return (
    <>
      <div className="game-screen">
        <div className="table-toolbar">
          <div className="table-toolbar-left">
            <Link to="/lobby" className="table-lobby-link">
              <ArrowLeft size={16} />
              <span>大厅</span>
            </Link>
            <span className="table-room-code">
              UNO <small>{room.code}</small>
            </span>
            <span
              className={`table-connection ${connected ? 'online' : ''}`}
              title={connected ? '已连接 · 实时同步' : '正在重连'}
            >
              {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
            </span>
          </div>
          <div className="table-toolbar-actions">
            <AudioButton />
            <Button
              size="sm"
              variant="ghost"
              aria-label="牌局动态"
              aria-expanded={panel === 'logs'}
              onClick={() => setPanel(panel === 'logs' ? null : 'logs')}
            >
              <List size={16} />
              <span>动态</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="牌桌聊天"
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
            {!isPlayer && (
              <span className="spectator-tag">
                <Eye size={12} className="inline mr-1" />
                观战中
              </span>
            )}
            <span className="table-invite">
              <InviteButton code={room.code} />
            </span>
            <Button variant="ghost" size="sm" aria-label="离开牌桌" onClick={() => void leave()}>
              <LogOut size={14} />
              <span>离开</span>
            </Button>
          </div>
        </div>
        {!connected && <div className="refresh-warning">网络已断开，正在恢复连接。请等待同步后再出牌。</div>}
        {winner && (
          <div className="match-result-banner">
            <span>
              ✦ {winner.name} 获胜！{winner.id === me ? '恭喜，奖励 +100 金币。' : '下次逆转，就在下一张。'}
            </span>
            {room.hostId === me && (
              <Button
                size="sm"
                onClick={() =>
                  void perform(() => request((ack) => socket.emit('room:rematch', { roomId: room.id }, ack)))
                }
              >
                <RotateCcw size={14} />
                再来一局
              </Button>
            )}
          </div>
        )}
        <UnoArena room={room} me={me} now={now} reduced={Boolean(reduced)} pendingDraws={draws.pendingDraws}>
          {isPlayer && (
            <section className="hand-panel">
              <div className="hand-main">
                {ownPlayer && (
                  <div
                    className="table-position position-bottom own-hand-position"
                    data-player-id={me}
                    data-seat-position="bottom"
                  >
                    <PlayerSeat
                      player={ownPlayer}
                      active={Boolean(myTurn)}
                      blocked={blocked}
                      seconds={seconds}
                      own
                    />
                    <BackStack
                      count={Math.max(0, game.hand.length - (draws.pendingDraws[me!] ?? 0))}
                      blocked={blocked}
                    />
                  </div>
                )}
                <div className="hand-content">
                  <div className="hand-heading">
                    <span>
                      <Layers3 size={14} />
                      你的手牌 · {game.hand.length} 张
                    </span>
                    <small>点选出牌 · 向上拖动出牌</small>
                  </div>
                  <div
                    className={`hand-cards ${blocked ? 'blocked-hand' : ''}`}
                    data-hand-target={me}
                    style={{ '--hand-size': hand.length } as React.CSSProperties}
                  >
                    {hand.map((c, i) => (
                      <motion.div
                        key={c.id}
                        data-card-id={c.id}
                        data-card-color={c.color}
                        data-incoming={draws.incoming.has(c.id) ? 'true' : undefined}
                        className={`hand-slot ${selected === c.id ? 'selected' : ''}`}
                        initial={reduced ? false : { opacity: 0, y: 80, rotateY: 180 }}
                        animate={{
                          opacity: draws.incoming.has(c.id) ? 0 : 1,
                          y: Math.min(8, Math.abs(i - (game.hand.length - 1) / 2) * 1.5),
                          rotate: Math.max(-9, Math.min(9, (i - (game.hand.length - 1) / 2) * 2)),
                          rotateY: draws.incoming.has(c.id) ? 180 : 0,
                        }}
                        transition={{ duration: 0.4, delay: game.turnNumber === 0 ? i * 0.06 : 0 }}
                      >
                        <PlayingCard
                          card={c}
                          selected={selected === c.id}
                          disabled={!myTurn || !playable.has(c.id) || !canAct || draws.incoming.has(c.id)}
                          draggable
                          onClick={() => setSelected(selected === c.id ? null : c.id)}
                          onPlay={(point) => play(c, point)}
                          onDragCard={(point) => setDragCard(point ? { card: c, point } : null)}
                        />
                      </motion.div>
                    ))}
                  </div>
                  {blocked && (
                    <div className="skip-hand-overlay">
                      <BanMark label="你的手牌区被禁止，等待下一次回合" />
                    </div>
                  )}
                </div>
              </div>
              <div className="hand-actions">
                <Button
                  variant={myTurn && !playable.size && !game.drawnCardId ? 'default' : 'outline'}
                  className={myTurn && !playable.size && !game.drawnCardId ? 'draw-required' : ''}
                  disabled={!myTurn || !canAct || !legal.some((a) => a.type === 'draw')}
                  onClick={() => void action({ type: 'draw' })}
                >
                  <PlusIcon />
                  摸一张
                </Button>
                {game.drawnCardId && myTurn && (
                  <Button variant="outline" disabled={!canAct} onClick={() => void action({ type: 'pass' })}>
                    结束回合
                  </Button>
                )}
                <Button
                  disabled={!selectedCard || !myTurn || !canAct}
                  onClick={() => selectedCard && play(selectedCard)}
                >
                  <Play size={14} />
                  打出选中牌
                </Button>
                <Button
                  variant={declared ? 'default' : 'outline'}
                  className={`uno-call ${game.hand.length === 2 && myTurn ? 'uno-ready' : ''}`}
                  aria-label="喊 UNO"
                  aria-pressed={Boolean(declared)}
                  disabled={game.hand.length !== 2 || !myTurn || !canAct || Boolean(declared)}
                  onClick={() => void action({ type: 'uno' })}
                >
                  {declared ? '已喊 UNO!' : 'UNO!'}
                </Button>
              </div>
              <p className="hand-hint">
                {game.winnerId
                  ? '本局已结束，房主可以发起下一局。'
                  : myTurn
                    ? game.drawnCardId
                      ? '只能打出刚摸到的牌，或结束回合。'
                      : game.hand.length === 2 && !declared
                        ? '先点 UNO，再打出倒数第二张；漏喊罚摸 2 张。'
                        : `匹配${colorNames[game.color]}或 ${cardLabel(game.topCard)}，也可以使用合法的万能牌。`
                    : '等待你的回合。只剩两张时，先喊 UNO 再出牌。'}
              </p>
            </section>
          )}
        </UnoArena>
      </div>
      <Dialog
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <DialogContent className="table-drawer">
          <DialogTitle className="modal-title">{panel === 'logs' ? '牌局动态' : '牌桌聊天'}</DialogTitle>
          <DialogDescription className="modal-desc">
            {panel === 'logs' ? '最近动作与本局规则' : '说点什么，一起享受这一局。'}
          </DialogDescription>
          {panel === 'logs' ? (
            <section className="log-panel table-log-panel">
              {[...game.logs].reverse().map((l) => (
                <p key={l.id} className="log-line">
                  {l.text}
                </p>
              ))}
              <p className="table-rule-note">
                只剩两张时先点 UNO，再出牌。漏喊由本大厅自动判罚摸 2 张。场上只保留最近两位玩家的出牌。
              </p>
            </section>
          ) : (
            <Chat room={room} />
          )}
        </DialogContent>
      </Dialog>
      <DrawFlights flights={draws.flights} complete={draws.complete} />
      {dragCard && <DraggedCard card={dragCard.card} point={dragCard.point} />}
      {flight && (
        <motion.div
          key={flight.card.id}
          className="flying-card"
          style={{
            position: 'fixed',
            left: flight.fromX,
            top: flight.fromY,
            zIndex: 55,
            pointerEvents: 'none',
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: flight.toX - flight.fromX,
            y: flight.toY - flight.fromY,
            opacity: [1, 1, 0],
            scale: [1, 0.9, 0.8],
          }}
          transition={{ duration: 0.45, times: [0, 0.8, 1] }}
          onAnimationComplete={() => setFlight(null)}
        >
          <PlayingCard card={flight.card} selected />
        </motion.div>
      )}
      <Dialog
        open={Boolean(wild)}
        onOpenChange={(v) => {
          if (!v) setWild(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="modal-title">下一回合，你来定色</DialogTitle>
          <DialogDescription className="modal-desc">
            选择一种颜色，让接下来的牌局顺着你的节奏。
          </DialogDescription>
          <div className="color-picker">
            {colors.map((c) => (
              <button
                key={c}
                style={{ background: cardColors[c] }}
                disabled={busy}
                onClick={() =>
                  wild && void action({ type: 'play', cardId: wild.id, color: c as Color }, wildOrigin)
                }
              >
                {colorNames[c]}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(winner) && dismissedWinner !== room.matchId}
        onOpenChange={(v) => {
          if (!v) setDismissedWinner(room.matchId);
        }}
      >
        <DialogContent>
          <span className="winner-icon">🏆</span>
          <DialogTitle className="modal-title text-center">
            {winner?.id === me ? '这局，你是主角！' : `${winner?.name} 拿下这一局`}
          </DialogTitle>
          <DialogDescription className="winner-desc">
            {winner?.id === me ? '手牌清空，快乐满格。奖励 +100 金币。' : '一局结束，下一局还有新的可能。'}
            <br />
            {room.resultSaved ? '服务器已记录比赛结果。' : '比赛结果正在保存，稍后即可开启下一局。'}
          </DialogDescription>
          <div className="winner-buttons">
            {room.hostId === me && (
              <Button
                disabled={!room.resultSaved}
                onClick={() =>
                  void perform(() => request((ack) => socket.emit('room:rematch', { roomId: room.id }, ack)))
                }
              >
                <RotateCcw size={14} />
                再来一局
              </Button>
            )}
            <Button variant="outline" onClick={() => setDismissedWinner(room.matchId)}>
              查看牌桌
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
function PlusIcon() {
  return <span style={{ fontSize: 19, lineHeight: 1 }}>＋</span>;
}
