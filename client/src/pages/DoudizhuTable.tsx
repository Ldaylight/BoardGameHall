import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Crown, Eye, Lightbulb, List, LogOut, MessageSquare, Settings, X } from 'lucide-react';
import type { Player, RoomView } from '../../../shared/types';
import { comboNames, type DoudizhuAction, type DoudizhuView } from '../../../shared/games/doudizhu/types';
import { beats, classify, legalPlays } from '../../../shared/games/doudizhu/rules';
import { useApp } from '@/stores/app';
import { perform, request, socket } from '@/lib/api';
import { audioEngine } from '@/lib/audio-engine';
import { GameAudioTracker } from '@/lib/game-audio';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Avatar } from '@/components/Layout';
import { AudioButton } from '@/components/AudioController';
import { PokerCard } from '@/components/PokerCard';
import { Chat } from '@/components/Chat';
import { MatchResultDialog } from '@/components/MatchResultDialog';
import '../styles/doudizhu.css';

function Seat({
  player,
  game,
  position,
  now,
}: {
  player: Player;
  game: DoudizhuView;
  position: 'left' | 'right' | 'self';
  now: number;
}) {
  const active = game.phase !== 'finished' && player.id === game.currentPlayerId;
  const count = game.handCounts[player.id],
    landlord = player.id === game.landlordId;
  const bid = game.bids.find((b) => b.playerId === player.id);
  return (
    <div className={`ddz-seat ddz-seat-${position} ${active ? 'active' : ''}`} data-player-id={player.id}>
      <div className="ddz-player">
        <Avatar name={player.name} ai={player.isAI} />
        <div>
          <b>{player.name}</b>
          <small>
            {game.landlordId ? (landlord ? '♛ 地主' : '✦ 农民') : '等待叫分'}
            {!player.connected ? ' · 离线托管' : player.isAI ? ' · AI' : ''}
          </small>
        </div>
        {active && (
          <span className="ddz-clock" aria-label={`${player.name} 回合倒计时`}>
            {Math.max(0, Math.ceil((game.turnDeadline - now) / 1000))}
          </span>
        )}
      </div>
      {game.phase === 'bidding' && bid && (
        <span className="ddz-bid-badge">{bid.value ? `${bid.value} 分` : '不叫'}</span>
      )}
      {position !== 'self' && (
        <div className="ddz-back-stack" aria-label={`${player.name} 剩余 ${count} 张手牌`}>
          {Array.from({ length: count }, (_, i) => (
            <div className="ddz-back-slot" key={i} style={{ '--back-i': i } as React.CSSProperties}>
              <PokerCard small />
            </div>
          ))}
          <b>{count}</b>
        </div>
      )}
      {position === 'self' && (
        <span className="ddz-my-count">
          {count} 张手牌<small className="ddz-mobile-hint">左右滑动查看手牌</small>
        </span>
      )}
    </div>
  );
}
export function DoudizhuTable({
  room,
  connected,
  leave,
}: {
  room: RoomView<DoudizhuView>;
  connected: boolean;
  leave: () => Promise<void>;
}) {
  const me = useApp((s) => s.session?.user.id),
    motionEnabled = useApp((s) => s.motionEnabled);
  const navigate = useNavigate();
  const game = room.game;
  const [selection, setSelection] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now());
  const [panel, setPanel] = useState<'chat' | 'logs' | 'rules' | null>(null);
  const tracker = useRef(new GameAudioTracker()),
    hintIndex = useRef(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (room.status === 'waiting') navigate(`/room/${room.id}`, { replace: true });
  }, [room.status, room.id, navigate]);
  useEffect(() => {
    setSelection([]);
    hintIndex.current = 0;
  }, [room.matchId, game?.turnNumber]);
  useEffect(() => {
    for (const cue of tracker.current.update(room, connected && !document.hidden, me))
      audioEngine.effect(cue.effect, cue.delay);
  }, [room, connected, me]);
  useEffect(() => {
    for (const cue of tracker.current.countdown(room, now, connected && !document.hidden))
      audioEngine.effect(cue.effect, cue.delay);
  }, [room, now, connected]);
  const mine = room.players.find((p) => p.id === me && !p.hasLeft),
    myIndex = game?.players.indexOf(mine?.id ?? '') ?? -1;
  const selected = useMemo(
    () => game?.hand.filter((c) => selection.includes(c.id)) ?? [],
    [game?.hand, selection],
  );
  const combo = useMemo(() => classify(selected), [selected]);
  const possible = useMemo(
    () => (game?.phase === 'playing' ? legalPlays(game.hand, game.trick?.combination ?? null) : []),
    [game?.hand, game?.trick, game?.phase],
  );
  if (!game) return <div className="loading-panel">正在准备斗地主牌桌…</div>;
  const canAct = connected && !busy && !!mine && game.currentPlayerId === me && game.phase !== 'finished';
  const ordered = [0, 1, 2].map((offset) =>
    room.players.find((p) => p.id === game.players[((myIndex < 0 ? 0 : myIndex) + offset) % 3])!,
  );
  const recent = game.moves.slice(-3),
    lastMove = game.moves.at(-1);
  const effectKind = lastMove?.combination?.kind;
  const canPlay =
    canAct && game.phase === 'playing' && !!combo && beats(combo, game.trick?.combination ?? null);
  async function send(action: DoudizhuAction) {
    setBusy(true);
    await perform(() =>
      request((ack) => socket.emit('game:action', { roomId: room.id, action, revision: room.revision }, ack)),
    );
    setBusy(false);
  }
  function hint() {
    if (!possible.length) {
      useApp.getState().notify('没有能压过上一手的牌，可以选择「不出」。');
      return;
    }
    const cards = possible[hintIndex.current++ % possible.length];
    setSelection(cards.map((c) => c.id));
  }
  return (
    <section className={`ddz-table ${motionEnabled ? '' : 'ddz-reduced'}`} data-testid="doudizhu-table">
      <header className="ddz-toolbar">
        <Link to="/lobby" className="ddz-back">
          <ArrowLeft size={17} />
          <span>桌游大厅</span>
        </Link>
        <strong>
          斗地主 <small>#{room.code}</small>
        </strong>
        <div className="ddz-tools">
          <AudioButton />
          <Button variant="ghost" size="icon" aria-label="斗地主规则" onClick={() => setPanel('rules')}>
            <Eye size={17} />
          </Button>
          <Button variant="ghost" size="icon" aria-label="牌桌动态" onClick={() => setPanel('logs')}>
            <List size={17} />
          </Button>
          <Button variant="ghost" size="icon" aria-label="牌桌聊天" onClick={() => setPanel('chat')}>
            <MessageSquare size={17} />
          </Button>
          <Link to="/settings" className="icon-button" aria-label="设置">
            <Settings size={17} />
          </Link>
          <Button variant="ghost" size="icon" aria-label="离开斗地主房间" onClick={() => void leave()}>
            <LogOut size={17} />
          </Button>
        </div>
      </header>
      {!connected && <div className="ddz-offline">连接断开，正在恢复房间。重连前暂不能出牌。</div>}
      <div className="ddz-felt">
        <div className="ddz-table-rim" />
        <div className="ddz-kitty">
          <span>底牌</span>
          <div>
            {[0, 1, 2].map((i) => (
              <PokerCard key={`${room.matchId}-${game.bidRound}-${i}`} card={game.kitty[i]} small />
            ))}
          </div>
          <p>
            底分 <b>{game.highestBid || '—'}</b>
            <i />
            倍数 <b>×{game.multiplier}</b>
          </p>
        </div>
        <Seat player={ordered[2]} game={game} position="left" now={now} />
        <Seat player={ordered[1]} game={game} position="right" now={now} />
        <div className="ddz-center" aria-live="polite">
          {game.phase === 'bidding' ? (
            <div className="ddz-auction">
              <Crown size={28} />
              <span className="eyebrow">MAKE YOUR CALL</span>
              <h1>谁来当地主？</h1>
              <p>
                {canAct
                  ? '看看手牌，叫个好分。'
                  : `${room.players.find((p) => p.id === game.currentPlayerId)?.name} 正在叫分…`}
              </p>
              <small>{game.bidRound ? `第 ${game.bidRound + 1} 次发牌 · ` : ''}三家不叫会重新发牌</small>
            </div>
          ) : (
            <>
              {!game.trick && game.phase !== 'finished' && (
                <div className="ddz-lead">
                  <span>✦</span>
                  <p>{canAct ? '轮到你领出，自由选择牌型' : '等待下一手好牌'}</p>
                </div>
              )}
              {ordered.map((p, index) => {
                const move = [...recent].reverse().find((m) => m.playerId === p.id);
                return move ? (
                  <div
                    className={`ddz-played ddz-played-${index === 0 ? 'self' : index === 1 ? 'right' : 'left'}`}
                    key={p.id}
                  >
                    <span>
                      {p.name} · {move.combination ? comboNames[move.combination.kind] : '不出'}
                    </span>
                    <div className="ddz-public-cards" key={move.number}>
                      {move.cards.map((card) => (
                        <PokerCard key={card.id} card={card} small />
                      ))}
                    </div>
                  </div>
                ) : null;
              })}
            </>
          )}
          {motionEnabled &&
            lastMove &&
            (effectKind === 'bomb' || effectKind === 'rocket' || effectKind?.startsWith('plane')) && (
              <div key={lastMove.number} className={`ddz-combo-effect ${effectKind}`} aria-hidden="true">
                <b>{effectKind === 'bomb' ? '✹ 炸弹' : effectKind === 'rocket' ? '🚀 王炸' : '✈ 飞机'}</b>
                <i />
                <i />
                <i />
              </div>
            )}
        </div>
        {!mine && (
          <div className="ddz-spectator">
            <Eye size={16} />
            观战中 · 对局期间手牌不公开
          </div>
        )}
      </div>
      <footer className="ddz-hand-area">
        <Seat player={ordered[0]} game={game} position="self" now={now} />
        <div className="ddz-hand-body">
          <div className="ddz-action-row">
            <p>
              {game.phase === 'finished'
                ? '对局已结束'
                : game.phase === 'bidding'
                  ? canAct
                    ? '请选择叫分'
                    : '等待叫分'
                  : canAct
                    ? selected.length
                      ? combo
                        ? `${comboNames[combo.kind]} · ${selected.length} 张${canPlay ? '' : ' · 无法压过上一手'}`
                        : '所选手牌不是合法牌型'
                      : possible.length
                        ? '轮到你 · 点选多张手牌，或使用提示'
                        : '没有可跟的牌 · 请选择不出'
                    : '等待其他玩家出牌'}
            </p>
            {game.phase === 'bidding' ? (
              <div className="ddz-bid-actions">
                {([0, 1, 2, 3] as const).map((value) => (
                  <Button
                    key={value}
                    variant={value === 3 ? 'default' : 'outline'}
                    size="sm"
                    disabled={!canAct || (value !== 0 && value <= game.highestBid)}
                    onClick={() => void send({ type: 'bid', value })}
                  >
                    {value ? `${value} 分` : '不叫'}
                  </Button>
                ))}
              </div>
            ) : game.phase === 'playing' ? (
              <div className="ddz-play-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!selection.length || busy}
                  onClick={() => setSelection([])}
                >
                  <X size={14} />
                  清空
                </Button>
                <Button variant="outline" size="sm" disabled={!canAct} onClick={hint}>
                  <Lightbulb size={14} />
                  提示
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canAct || !game.trick}
                  onClick={() => void send({ type: 'pass' })}
                >
                  不出
                </Button>
                <Button
                  size="sm"
                  disabled={!canPlay}
                  onClick={() => void send({ type: 'play', cardIds: selection })}
                >
                  出牌
                </Button>
              </div>
            ) : null}
          </div>
          <div className="ddz-hand-scroll">
            <div
              className="ddz-hand"
              key={`${room.matchId}-${game.bidRound}`}
              style={{ '--hand-count': game.hand.length } as React.CSSProperties}
            >
              {game.hand.map((card, i) => (
                <div key={card.id} className="ddz-hand-slot" style={{ '--card-i': i } as React.CSSProperties}>
                  <PokerCard
                    card={card}
                    selected={selection.includes(card.id)}
                    disabled={busy || game.phase === 'finished'}
                    onSelect={() =>
                      setSelection((current) =>
                        current.includes(card.id)
                          ? current.filter((id) => id !== card.id)
                          : [...current, card.id],
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </footer>
      <Dialog
        open={!!panel}
        onOpenChange={(v) => {
          if (!v) setPanel(null);
        }}
      >
        <DialogContent className="ddz-drawer">
          <DialogTitle className="modal-title">
            {panel === 'chat' ? '牌桌聊天' : panel === 'logs' ? '牌桌动态' : '斗地主 · 本桌规则'}
          </DialogTitle>
          <DialogDescription className="modal-desc">
            {panel === 'rules' ? '三人叫分，地主对阵两位农民。' : '共享一张牌桌，也分享好心情。'}
          </DialogDescription>
          {panel === 'chat' ? (
            <Chat room={room} />
          ) : panel === 'logs' ? (
            <div className="ddz-log-list">
              {game.logs.map((log) => (
                <p key={log.id}>
                  {log.text.replace(
                    /座位 (\d)/g,
                    (_, n: string) =>
                      room.players.find((p) => p.id === game.players[Number(n) - 1])?.name ?? `座位 ${n}`,
                  )}
                </p>
              ))}
            </div>
          ) : (
            <div className="ddz-rule-copy">
              <p>
                54 张牌，每人 17 张。每人依次选择不叫或 1–3 分，只能叫更高的分数。3
                分立即定地主，三家不叫重新发牌。地主公开获得三张底牌并先出。
              </p>
              <p>
                支持单张、对子、三张、三带一 / 对、顺子（至少 5 张）、连对（至少 3
                对）、飞机及其附件、四带二单 / 两对、炸弹和王炸。2 和王不能参加顺子、连对、飞机主体。
              </p>
              <p>
                普通牌须同类型、同张数并比较主体点数；炸弹压普通牌，王炸最大。两家连续不出后，由最后出牌者重新领出。首出不能不出。
              </p>
              <p>
                本桌采用独立单翼：飞机单翼必须不同点数，不带双王；四带二单须为两张不同点数的普通牌，四带二对须为两组不同点数的对子。
              </p>
              <p>
                地主出完则地主胜；任一农民出完，两位农民共同胜。每个炸弹 /
                王炸翻倍；地主胜且农民均未出牌为春天，农民胜且地主只出过一手为反春天，再翻倍。底分 ×
                倍数计分，地主承担两份，农民各一份，三方分数之和为零。
              </p>
              <p>
                叫分 20 秒，出牌 45 秒，超时或离线由 AI 临时代打。AI
                仅获取自己的手牌、已公开底牌、出牌记录和剩余张数。
              </p>
              <a
                href="https://alumni.pbcsf.tsinghua.edu.cn/info/1002/1568.htm"
                target="_blank"
                rel="noreferrer"
              >
                叫分与计分规则参考 ↗
              </a>
              <a href="https://mm.pook.com/ddz/rule/rule-2.html" target="_blank" rel="noreferrer">
                附件牌型规则参考 ↗
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <MatchResultDialog room={room} connected={connected} onOpen={() => setPanel(null)} />
    </section>
  );
}
