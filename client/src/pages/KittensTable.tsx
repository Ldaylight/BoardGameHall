import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bomb,
  Eye,
  List,
  LogOut,
  MessageSquare,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { Player, RoomView } from '../../../shared/types';
import type { KittensAction, KittensView, KittenEvent } from '../../../shared/games/exploding-kittens/types';
import { kittenInfo, kittenKinds } from '../../../shared/games/exploding-kittens/types';
import { kittens } from '../../../shared/games/exploding-kittens';
import { sortedKittenHand, kittenHandSpacing } from '../../../shared/games/exploding-kittens/presentation';
import { useApp } from '@/stores/app';
import { perform, request, socket } from '@/lib/api';
import { audioEngine } from '@/lib/audio-engine';
import { GameAudioTracker } from '@/lib/game-audio';
import { Avatar } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { KittenCard, KittenIllustration } from '@/components/KittenCard';
import { AudioButton } from '@/components/AudioController';
import { Chat } from '@/components/Chat';
import { MatchResultDialog } from '@/components/MatchResultDialog';
import '../styles/kittens.css';

const seatPositions: Record<number, number[][]> = {
  1: [[50, 16]],
  2: [
    [18, 39],
    [82, 39],
  ],
  3: [
    [17, 46],
    [50, 14],
    [83, 46],
  ],
  4: [
    [16, 48],
    [35, 15],
    [65, 15],
    [84, 48],
  ],
};
function Seat({
  player,
  game,
  now,
  own = false,
  position,
}: {
  player: Player;
  game: KittensView;
  now: number;
  own?: boolean;
  position?: number[];
}) {
  const alive = game.alive.includes(player.id),
    active = !game.winnerId && game.actorId === player.id && game.phase !== 'reaction';
  const responding = game.pending && alive && !game.pending.allowed.includes(player.id);
  return (
    <div
      className={`kittens-seat ${own ? 'kittens-seat-own' : ''} ${active ? 'active' : ''} ${alive ? '' : 'eliminated'}`}
      style={position ? { left: `${position[0]}%`, top: `${position[1]}%` } : undefined}
      data-player-id={player.id}
    >
      <div className="kittens-seat-name">
        <Avatar name={player.name} ai={player.isAI} />
        <div>
          <b>{player.name}</b>
          <small>
            {!alive
              ? '已淘汰'
              : responding
                ? '等待响应'
                : active
                  ? game.phase === 'favor'
                    ? '选择赠牌'
                    : '正在行动'
                  : player.isAI
                    ? 'AI 伙伴'
                    : !player.connected
                      ? '离线托管'
                      : '等待回合'}
          </small>
        </div>
      </div>
      {!own && alive && (
        <div
          className="kittens-opponent-hand"
          aria-label={`${player.name} 剩余 ${game.handCounts[player.id]} 张牌`}
        >
          {Array.from({ length: Math.min(6, game.handCounts[player.id]) }, (_, i) => (
            <div key={i} style={{ '--back-i': i } as CSSProperties}>
              <KittenCard small />
            </div>
          ))}
          <strong>{game.handCounts[player.id]}</strong>
        </div>
      )}
      {!alive && (
        <span className="kittens-eliminated-mark">
          <Bomb size={20} />
          BOOM
        </span>
      )}
    </div>
  );
}
export function KittensTable({
  room,
  connected,
  leave,
}: {
  room: RoomView<KittensView>;
  connected: boolean;
  leave: () => Promise<void>;
}) {
  const me = useApp((s) => s.session?.user.id),
    motionEnabled = useApp((s) => s.motionEnabled),
    navigate = useNavigate();
  const game = room.game;
  const [selection, setSelection] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now());
  const [panel, setPanel] = useState<'chat' | 'logs' | 'rules' | null>(null),
    [target, setTarget] = useState(''),
    [requestKind, setRequestKind] =
      useState<import('../../../shared/games/exploding-kittens/types').KittenKind>('defuse'),
    [insertIndex, setInsertIndex] = useState(0);
  const [resultReady, setResultReady] = useState(false),
    tracker = useRef(new GameAudioTracker());
  const effectCheckpoint = useRef<{ matchId: string | null; sequence: number } | null>(null);
  const [visual, setVisual] = useState<{ special?: KittenEvent; draw?: KittenEvent; transfer?: KittenEvent }>(
    {},
  );
  const handScroll = useRef<HTMLDivElement>(null);
  const [spacing, setSpacing] = useState({ step: 120, width: 0 });
  useEffect(() => {
    const element = handScroll.current;
    if (!element) return;
    const card = element.querySelector<HTMLElement>('.kitten-playing-card');
    const measure = () =>
      setSpacing(
        kittenHandSpacing(
          game?.hand.length ?? 0,
          element.clientWidth,
          card?.getBoundingClientRect().width ?? 108,
        ),
      );
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (card) observer.observe(card);
    measure();
    return () => observer.disconnect();
  }, [game?.hand.length]);
  useEffect(() => {
    if (!game || !connected || document.hidden) {
      effectCheckpoint.current = null;
      setVisual({});
      return;
    }
    const previous = effectCheckpoint.current;
    effectCheckpoint.current = { matchId: room.matchId, sequence: game.logSequence };
    if (!previous || previous.matchId !== room.matchId) {
      setVisual({});
      return;
    }
    const fresh = game.events.filter((e) => e.number > previous.sequence);
    if (!fresh.length) return;
    if (fresh.length > 8) {
      setVisual({});
      return;
    }
    const special = [...fresh]
      .reverse()
      .find(
        (e) =>
          e.type === 'nope' ||
          e.type === 'defuse' ||
          e.type === 'explode' ||
          (e.type === 'effect' && !e.canceled),
      );
    const draw = fresh.at(-1)?.type === 'draw' ? fresh.at(-1) : undefined;
    const transfer = [...fresh].reverse().find((e) => e.type === 'give' && e.count !== 0);
    setVisual((current) => ({
      special: special ?? current.special,
      draw,
      transfer: transfer ?? current.transfer,
    }));
  }, [room.matchId, game?.logSequence, connected]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (room.status === 'waiting') navigate(`/room/${room.id}`, { replace: true });
  }, [room.status, room.id, navigate]);
  useEffect(() => {
    setSelection([]);
  }, [room.matchId, game?.turnNumber, game?.hand.length]);
  useEffect(() => {
    void audioEngine.preloadKittens();
    for (const cue of tracker.current.update(room, connected && !document.hidden, me))
      audioEngine.effect(cue.effect, cue.delay);
  }, [room, connected, me]);
  useEffect(() => {
    for (const cue of tracker.current.countdown(room, now, connected && !document.hidden))
      audioEngine.effect(cue.effect, cue.delay);
  }, [room, now, connected]);
  useEffect(() => {
    setResultReady(false);
    if (!game?.winnerId) return;
    const timer = setTimeout(() => setResultReady(true), motionEnabled ? 1400 : 0);
    return () => clearTimeout(timer);
  }, [game?.winnerId, room.matchId, motionEnabled]);
  const targets = game?.alive.filter((id) => id !== me && game.handCounts[id] > 0) ?? [];
  useEffect(() => {
    if (game?.phase === 'insert') setInsertIndex(0);
  }, [game?.phase, room.matchId]);
  const targetKey = targets.join('|');
  useEffect(() => {
    if (!targets.includes(target)) setTarget(targets[0] ?? '');
  }, [targetKey, target]);
  if (!game) return <div className="loading-panel">正在准备炸弹猫牌桌…</div>;
  const mine = room.players.find((p) => p.id === me && !p.hasLeft),
    alive = !!mine && game.alive.includes(me!),
    actor = alive && game.actorId === me;
  const canAct = connected && !busy && alive && !game.winnerId;
  const hand = sortedKittenHand(game.hand);
  const selected = hand.filter((c) => selection.includes(c.id));
  const needsTarget = selected.length > 1 || selected[0]?.kind === 'favor';
  const playAction: KittensAction = {
    type: 'ek:play',
    cardIds: selection,
    ...(needsTarget ? { targetId: target } : {}),
    ...(selected.length === 3 ? { requestKind } : {}),
  };
  const legal = kittens.getLegalActions(game, me ?? '');
  // The UI allows any interchangeable physical cards; authority validates their actual IDs.
  const canPlay =
    canAct &&
    actor &&
    game.phase === 'playing' &&
    selected.length >= 1 &&
    selected.length <= 3 &&
    selected.every((c) => c.kind === selected[0].kind) &&
    (selected.length > 1
      ? !!target
      : ['attack', 'skip', 'shuffle', 'future', 'favor'].includes(selected[0].kind) &&
        (selected[0].kind !== 'favor' || !!target));
  const canDraw = canAct && legal.some((a) => a.type === 'ek:draw');
  const myIndex = game.players.indexOf(mine?.id ?? ''),
    order = [
      ...game.players.slice(myIndex < 0 ? 0 : myIndex),
      ...game.players.slice(0, myIndex < 0 ? 0 : myIndex),
    ];
  const opponents = order.slice(1).map((id) => room.players.find((p) => p.id === id)!);
  const latest = visual.draw,
    special = visual.special;
  const nope = legal.find((a) => a.type === 'ek:nope'),
    allow = legal.find((a) => a.type === 'ek:allow');
  const seatName = (id: string) => room.players.find((p) => p.id === id)?.name ?? '牌友';
  const point = (id: string) =>
    id === me
      ? [50, 96]
      : (seatPositions[opponents.length]?.[opponents.findIndex((p) => p.id === id)] ?? [50, 16]);
  const targeted = game.pending
    ? { playerId: game.pending.playerId, targetId: game.pending.targetId }
    : special;
  const from = targeted ? point(targeted.playerId) : null,
    to = targeted?.targetId ? point(targeted.targetId) : null;
  const hint = !mine
    ? '观战中 · 玩家手牌不会公开'
    : !alive
      ? '你已淘汰，仍可观看牌局和聊天'
      : game.phase === 'reaction'
        ? `等待否决响应 · ${Math.max(0, Math.ceil((game.turnDeadline - now) / 1000))} 秒`
        : game.phase === 'favor'
          ? `等待 ${seatName(game.favor!.from)} 选择赠牌`
          : game.phase === 'defuse'
            ? `${seatName(game.currentPlayerId)} 正在拆弹`
            : game.phase === 'insert'
              ? `${seatName(game.currentPlayerId)} 正在秘密放回炸弹`
              : actor
                ? `轮到你 · 可连续出牌，摸牌结束一次回合${game.turnsRemaining > 1 ? ` · 还需 ${game.turnsRemaining} 轮` : ''}`
                : `等待 ${seatName(game.currentPlayerId)} 行动`;
  async function send(action: KittensAction) {
    setBusy(true);
    await perform(() =>
      request((ack) => socket.emit('game:action', { roomId: room.id, revision: room.revision, action }, ack)),
    );
    setBusy(false);
  }
  return (
    <section className={`kittens-table ${motionEnabled ? '' : 'kittens-still'}`} data-testid="kittens-table">
      <header className="kittens-toolbar">
        <Link to="/lobby" className="kittens-back">
          <ArrowLeft size={16} />
          桌游大厅
        </Link>
        <strong>
          炸弹猫<small>#{room.code}</small>
        </strong>
        <div className="kittens-tools">
          <AudioButton />
          <button className="icon-button" aria-label="炸弹猫规则" onClick={() => setPanel('rules')}>
            <Eye size={17} />
          </button>
          <button className="icon-button" aria-label="牌桌动态" onClick={() => setPanel('logs')}>
            <List size={17} />
          </button>
          <button className="icon-button" aria-label="牌桌聊天" onClick={() => setPanel('chat')}>
            <MessageSquare size={17} />
          </button>
          <Link className="icon-button" to="/settings" aria-label="设置">
            <Settings size={17} />
          </Link>
          <button className="icon-button" aria-label="离开房间" onClick={() => void leave()}>
            <LogOut size={17} />
          </button>
        </div>
      </header>
      {!connected && <div className="kittens-offline">正在重连，暂时无法出牌…</div>}
      <main className="kittens-felt">
        <div className="kittens-rim" />
        <div className="kittens-table-wordmark">
          A LITTLE CHAOS.
          <br />A LOT OF CATS.
        </div>
        {opponents.map((p, i) => (
          <Seat key={p.id} player={p} game={game} now={now} position={seatPositions[opponents.length]?.[i]} />
        ))}
        <div className="kittens-piles">
          <button
            className={`kittens-draw-pile ${canDraw ? 'available' : ''}`}
            aria-label="摸一张结束回合"
            disabled={!canDraw}
            onClick={() => void send({ type: 'ek:draw' })}
          >
            <i />
            <i />
            <KittenCard />
            <b>{game.deckCount}</b>
            <span>摸一张</span>
          </button>
          <div className="kittens-discard" aria-label="公开弃牌堆">
            {game.discard.slice(-3).map((card, i, cards) => (
              <div
                key={card.id}
                style={{ '--pile-rotation': `${(i - cards.length + 1) * -14 + 9}deg` } as CSSProperties}
              >
                <KittenCard card={card} />
              </div>
            ))}
            {!game.discard.length && (
              <span>
                弃牌区
                <br />
                <Sparkles size={26} />
              </span>
            )}
          </div>
        </div>
        {game.pending && (
          <div className="kittens-reaction" data-testid="kitten-reaction">
            <b>{game.pending.nopes % 2 ? '当前效果已否决' : '等待否决响应'}</b>
            <span>
              {seatName(game.pending.playerId)} →{' '}
              {game.pending.targetId ? seatName(game.pending.targetId) : '本桌'} ·{' '}
              {game.pending.cards.length > 1
                ? `${game.pending.cards.length} 张同名组合`
                : kittenInfo[game.pending.cards[0].kind].name}
              {game.pending.requestKind ? ` · 索取${kittenInfo[game.pending.requestKind].name}` : ''}
            </span>
            <div>
              <Button
                size="sm"
                variant="outline"
                disabled={!canAct || !allow}
                onClick={() => allow && void send(allow)}
              >
                不否决
              </Button>
              <Button size="sm" disabled={!canAct || !nope} onClick={() => nope && void send(nope)}>
                否决！
              </Button>
            </div>
            <small>{Math.max(0, Math.ceil((game.turnDeadline - now) / 1000))}s · 否决可被再次否决</small>
          </div>
        )}
        {from && to && targeted?.playerId !== targeted?.targetId && (
          <svg
            className="kittens-target-arrow"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-label={`${seatName(targeted!.playerId)} 对 ${seatName(targeted!.targetId!)} 使用效果`}
            data-target-id={targeted!.targetId}
          >
            <defs>
              <marker
                id="kitten-arrow-head"
                markerWidth="5"
                markerHeight="5"
                refX="4"
                refY="2.5"
                orient="auto"
              >
                <path d="M0 0 5 2.5 0 5Z" fill="#f0c78b" />
              </marker>
            </defs>
            <path
              d={`M${from[0]} ${from[1]} Q50 40 ${to[0]} ${to[1]}`}
              fill="none"
              stroke="#f0c78b"
              strokeWidth=".55"
              strokeDasharray="2 1.5"
              markerEnd="url(#kitten-arrow-head)"
            />
          </svg>
        )}
        {targeted && (
          <div className="kittens-effect-target" aria-live="polite">
            {seatName(targeted.playerId)} → {targeted.targetId ? seatName(targeted.targetId) : '本桌 / 自己'}
          </div>
        )}
        {motionEnabled && visual.transfer?.targetId && (
          <TransferFlight key={`${room.matchId}-${visual.transfer.number}`} event={visual.transfer} />
        )}
        {motionEnabled && special && !(special.type === 'effect' && special.canceled) && special.kind && (
          <div
            className={`kittens-fx kfx-${special.kind}`}
            key={`${room.matchId}-${special.number}`}
            aria-hidden="true"
          >
            <div className="kittens-fx-art">
              <KittenIllustration kind={special.kind} />
            </div>
            <b>
              {special.cards && special.cards.length > 1 ? '猫咪组合！' : kittenInfo[special.kind].name}
              {special.type === 'explode' ? ' · BOOM!' : ''}
            </b>
            {Array.from({ length: 12 }, (_, i) => (
              <i key={i} style={{ '--particle-angle': `${i * 30}deg` } as CSSProperties} />
            ))}
          </div>
        )}
        {motionEnabled && latest?.type === 'draw' && (
          <div className="kittens-draw-flight" key={`${room.matchId}-${latest.number}`} aria-hidden="true">
            <KittenCard small />
          </div>
        )}
        {game.hasBomb && (
          <div className="kittens-danger">
            <Bomb size={23} />
            炸弹现身 · {game.phase === 'insert' ? '已拆弹，等待放回' : '需要拆弹！'}
          </div>
        )}
        {game.turnsRemaining > 1 && !game.winnerId && (
          <span className="kittens-debt">
            {seatName(game.currentPlayerId)} 还需 {game.turnsRemaining} 轮
          </span>
        )}
      </main>
      <footer className="kittens-hand-area">
        {!game.winnerId && (
          <div
            className={`kittens-countdown ${game.turnDeadline - now < 5000 ? 'urgent' : ''}`}
            data-testid="kittens-countdown"
          >
            <span>{game.phase === 'reaction' ? '否决响应' : `${seatName(game.actorId)} · 行动倒计时`}</span>
            <b>
              {Math.max(0, Math.ceil((game.turnDeadline - now) / 1000))}
              <small>秒</small>
            </b>
          </div>
        )}
        <div className="kittens-actions">
          <p>{hint}</p>
          {game.phase === 'playing' && (
            <div className="kittens-play-controls">
              {needsTarget && (
                <label>
                  目标
                  <select
                    aria-label="索取或组合目标"
                    value={target}
                    disabled={!canAct}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    {targets.map((id) => (
                      <option key={id} value={id}>
                        {seatName(id)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selected.length === 3 && (
                <label>
                  索取
                  <select
                    aria-label="三张组合索取牌型"
                    value={requestKind}
                    onChange={(e) => setRequestKind(e.target.value as typeof requestKind)}
                  >
                    {kittenKinds
                      .filter((k) => k !== 'explode')
                      .map((kind) => (
                        <option key={kind} value={kind}>
                          {kittenInfo[kind].name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={!selection.length || busy}
                onClick={() => setSelection([])}
              >
                <X size={13} />
                清空
              </Button>
              <Button size="sm" disabled={!canPlay} onClick={() => void send(playAction)}>
                出牌{selected.length > 1 ? ` · ${selected.length}张组合` : ''}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={canDraw ? 'kitten-draw-ready' : ''}
                disabled={!canDraw}
                onClick={() => void send({ type: 'ek:draw' })}
              >
                摸一张
              </Button>
            </div>
          )}
          {game.phase === 'favor' && (
            <Button
              disabled={!canAct || !actor || selected.length !== 1}
              onClick={() => void send({ type: 'ek:give', cardId: selection[0] })}
            >
              赠予选中的牌
            </Button>
          )}
          {game.phase === 'defuse' && (
            <Button
              disabled={!canAct || !actor}
              onClick={() => {
                const card = game.hand.find((c) => c.kind === 'defuse');
                if (card) void send({ type: 'ek:defuse', cardId: card.id });
              }}
            >
              <ShieldCheck size={16} />
              使用拆弹牌
            </Button>
          )}
        </div>
        {mine && <Seat player={mine} game={game} own now={now} />}
        <div className="kittens-hand-scroll" ref={handScroll}>
          <div
            className="kittens-hand"
            style={
              {
                '--hand-count': hand.length,
                '--hand-step': `${spacing.step}px`,
                '--hand-width': `${spacing.width}px`,
              } as CSSProperties
            }
          >
            {hand.map((card, i) => (
              <div className="kittens-hand-slot" key={card.id} style={{ '--card-i': i } as CSSProperties}>
                <KittenCard
                  card={card}
                  selected={selection.includes(card.id)}
                  disabled={!canAct}
                  onSelect={() =>
                    setSelection((ids) =>
                      ids.includes(card.id)
                        ? ids.filter((id) => id !== card.id)
                        : [...ids, card.id].slice(-3),
                    )
                  }
                />
              </div>
            ))}
            {!game.hand.length && (
              <span className="kittens-empty-hand">
                {!mine ? '观战视野' : !alive ? '已淘汰 · 继续观看牌局' : '手牌为空，仍可继续摸牌'}
              </span>
            )}
          </div>
        </div>
      </footer>
      <Dialog
        open={game.phase === 'future' && actor}
        onOpenChange={(open) => {
          if (!open && canAct) void send({ type: 'ek:continue' });
        }}
      >
        <DialogContent className="kittens-future-dialog">
          <DialogTitle>预知未来 · 只有你能看到</DialogTitle>
          <DialogDescription>
            从左到右是接下来的摸牌顺序。洗牌、摸牌或放回炸弹后，已知牌序失效。
          </DialogDescription>
          <div className="kittens-future-cards">
            {game.future.map((card, i) => (
              <div key={card.id}>
                <span>{i === 0 ? '下一张' : `第 ${i + 1} 张`}</span>
                <KittenCard card={card} />
              </div>
            ))}
          </div>
          <Button disabled={!canAct} onClick={() => void send({ type: 'ek:continue' })}>
            记住了，继续
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={game.phase === 'insert' && actor} onOpenChange={() => {}}>
        <DialogContent>
          <DialogTitle>秘密放回炸弹</DialogTitle>
          <DialogDescription>
            只改变炸弹位置，不查看或调整其他牌。位置不会告诉其他玩家。当前牌堆 {game.deckCount} 张。
          </DialogDescription>
          <label className="kittens-insert-input">
            放回位置
            <input
              aria-label="炸弹放回位置"
              type="number"
              min={0}
              max={game.deckCount}
              value={insertIndex}
              onChange={(e) => setInsertIndex(Number(e.target.value))}
            />
          </label>
          <p className="modal-desc">
            0 = 下一张；{game.deckCount} = 牌堆底部。被攻击时，放回后可能仍是你的回合。
          </p>
          <Button
            disabled={
              !canAct || !Number.isInteger(insertIndex) || insertIndex < 0 || insertIndex > game.deckCount
            }
            onClick={() => void send({ type: 'ek:insert', index: insertIndex })}
          >
            确认秘密放回
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!panel}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <DialogContent className="kittens-drawer">
          <DialogTitle>
            {panel === 'chat' ? '牌桌聊天' : panel === 'logs' ? '牌桌动态' : '炸弹猫 · 本桌规则'}
          </DialogTitle>
          <DialogDescription>经典版 2–5 人，最后一位幸存者获胜。</DialogDescription>
          {panel === 'chat' ? (
            <Chat room={room} />
          ) : panel === 'logs' ? (
            <div className="kittens-log-list">
              {game.logs.map((log) => (
                <p key={log.id}>
                  <b>{log.event ? seatName(log.event.playerId) : '牌桌'}</b> · {log.text}
                </p>
              ))}
            </div>
          ) : (
            <div className="kittens-rule-copy">
              <p>
                每人 7 张普通牌 + 1
                张拆弹。牌堆中放入玩家数减一张炸弹，多余拆弹最多放回两张。没有手牌上限；手牌为空仍可摸牌。
              </p>
              <p>
                轮到你时可连续打出普通效果牌，摸一张结束一次回合。攻击让下一家承担两轮，被攻击者再攻击会转移尚未完成的轮数并额外加两轮。跳过或拆弹只结束一次回合。
              </p>
              <p>
                每张主动效果或同名组合进入 12
                秒否决窗口；所有存活玩家点击“不否决”可提前结算。否决能再被否决；摸牌、炸弹及拆弹不能被否决。
              </p>
              <p>
                索取由目标选择赠牌。同名两张（含普通效果牌）随机偷一张；同名三张可索取指定牌型，目标没有则无所得。普通猫牌不能单张打出。采用当前经典版规则，不包含扩展卡和旧版五张回收组合。
              </p>
              <p>
                预知结果只发给使用者；秘密放回位置、未公开手牌与赠牌内容不会出现在其他玩家视野或日志。超时或离线由
                AI 临时代打，AI 也只能读取合法视野。
              </p>
              <a
                href="https://www.explodingkittens.com/pages/rules-kittens/thanks"
                target="_blank"
                rel="noreferrer"
              >
                官方经典版规则 ↗
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <MatchResultDialog
        room={room}
        connected={connected}
        ready={resultReady}
        onOpen={() => setPanel(null)}
      />
    </section>
  );
}
function TransferFlight({ event }: { event: KittenEvent }) {
  const [flight, setFlight] = useState<CSSProperties | null>(null);
  useEffect(() => {
    const endpoint = (id: string) => {
      const seat = document.querySelector<HTMLElement>(`.kittens-seat[data-player-id="${id}"]`);
      const cards = seat?.classList.contains('kittens-seat-own')
        ? document.querySelector<HTMLElement>('.kittens-hand-scroll')
        : seat?.querySelector<HTMLElement>('.kittens-opponent-hand');
      const rect = (cards ?? seat)?.getBoundingClientRect();
      return rect ? { x: rect.x + rect.width / 2 - 20, y: rect.y + rect.height / 2 - 28 } : null;
    };
    const from = endpoint(event.playerId),
      to = endpoint(event.targetId!);
    if (!from || !to) return;
    setFlight({
      left: from.x,
      top: from.y,
      '--transfer-x': `${to.x - from.x}px`,
      '--transfer-y': `${to.y - from.y}px`,
    } as CSSProperties);
  }, [event.number]);
  return flight ? (
    <div
      className="kittens-transfer-flight"
      style={flight}
      data-testid="kitten-transfer"
      aria-label="一张未公开手牌被转移"
    >
      <KittenCard small />
    </div>
  ) : null;
}
