import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Coins, Eye, List, LogOut, MessageSquare, Settings, Spade, Trophy } from 'lucide-react';
import type { Player, RoomView } from '../../../shared/types';
import type { HoldemView, HoldemAction, HoldemEvent } from '../../../shared/games/holdem/types';
import { streetNames } from '../../../shared/games/holdem/types';
import { holdem } from '../../../shared/games/holdem';
import { evaluateHand } from '../../../shared/games/holdem/rules';
import { useApp } from '@/stores/app';
import { perform, request, socket } from '@/lib/api';
import { GameAudioTracker } from '@/lib/game-audio';
import { audioEngine } from '@/lib/audio-engine';
import { Avatar } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PokerCard } from '@/components/PokerCard';
import { AudioButton } from '@/components/AudioController';
import { Chat } from '@/components/Chat';
import { SeatCountdown } from '@/components/SeatCountdown';
import { HoldemChipFlight } from '@/components/HoldemChipFlight';
import '../styles/doudizhu.css';
import '../styles/holdem.css';
const positions: Record<number, number[][]> = {
  6: [
    [14, 57],
    [27, 30],
    [50, 13],
    [73, 30],
    [86, 57],
    [50, 89],
  ],
  1: [[50, 17]],
  2: [
    [17, 42],
    [83, 42],
  ],
  3: [
    [16, 46],
    [50, 16],
    [84, 46],
  ],
  4: [
    [15, 53],
    [35, 18],
    [65, 18],
    [85, 53],
  ],
  5: [
    [15, 56],
    [27, 31],
    [50, 13],
    [73, 31],
    [85, 56],
  ],
};
const actionNames: Partial<Record<HoldemEvent['type'], string>> = {
  fold: '弃牌',
  check: '过牌',
  call: '跟注',
  raise: '加注',
  'all-in': '全下',
  blind: '盲注',
};
function Seat({
  player,
  game,
  own = false,
  index = 0,
  position,
  now,
}: {
  player: Player;
  game: HoldemView;
  own?: boolean;
  index?: number;
  position?: number[];
  now: number;
}) {
  const out = !game.alive.includes(player.id),
    folded = game.folded.includes(player.id),
    active = game.phase === 'betting' && game.currentPlayerId === player.id;
  const action = [...game.events].reverse().find((e) => e.playerId === player.id && actionNames[e.type]);
  const shown = game.revealed[player.id];
  return (
    <div
      className={`holdem-seat ${own ? 'holdem-seat-own' : 'holdem-seat-other'} ${active ? 'active' : ''} ${out ? 'busted' : ''} ${folded ? 'folded' : ''}`}
      data-player-id={player.id}
      data-position={index}
      data-clock-side={position && position[0] > 60 ? 'left' : 'right'}
      style={position ? { left: `${position[0]}%`, top: `${position[1]}%` } : undefined}
    >
      <div className="holdem-seat-name">
        <Avatar name={player.name} ai={player.isAI} />
        <div>
          <b>{player.name}</b>
          <small>
            {out
              ? '已淘汰'
              : folded
                ? '已弃牌'
                : game.allIn.includes(player.id)
                  ? 'ALL IN'
                  : active
                    ? '正在行动'
                    : player.isAI
                      ? 'AI 牌友'
                      : player.connected
                        ? '等待回合'
                        : '离线托管'}
          </small>
        </div>
      </div>
      <div className="holdem-stack">
        <Coins size={12} />
        <b>{game.stacks[player.id].toLocaleString()}</b>
        {game.dealerId === player.id && <i title="庄家按钮">D</i>}
        {game.smallBlindId === player.id && <em>SB</em>}
        {game.bigBlindId === player.id && <em>BB</em>}
      </div>
      {!own && (active || game.readyPlayers.includes(player.id)) && (
        <SeatCountdown
          playerId={player.id}
          name={player.name}
          ready={game.readyPlayers.includes(player.id)}
          seconds={active ? Math.ceil((game.turnDeadline - now) / 1000) : undefined}
        />
      )}
      {!own && game.handCounts[player.id] > 0 && (
        <div className="holdem-opponent-cards">
          {[0, 1].map((i) => (
            <PokerCard key={`${game.handNumber}-${i}`} card={shown?.[i]} small />
          ))}
        </div>
      )}
      {!own && game.bets[player.id] > 0 && (
        <span className="holdem-seat-bet">
          <span className="poker-chip" />
          {game.bets[player.id]}
        </span>
      )}
      {action && game.phase === 'betting' && (
        <span className={`holdem-last-action action-${action.type}`}>
          {actionNames[action.type]}
          {action.amount ? ` ${action.amount}` : ''}
        </span>
      )}
    </div>
  );
}
export function HoldemTable({
  room,
  connected,
  leave,
}: {
  room: RoomView<HoldemView>;
  connected: boolean;
  leave: () => Promise<void>;
}) {
  const game = room.game,
    me = useApp((s) => s.session?.user.id),
    motion = useApp((s) => s.motionEnabled),
    navigate = useNavigate();
  const [now, setNow] = useState(Date.now()),
    [busy, setBusy] = useState(false),
    [panel, setPanel] = useState<'chat' | 'logs' | 'rules' | null>(null),
    [raiseTo, setRaiseTo] = useState(40),
    [confirmAllIn, setConfirmAllIn] = useState(false);
  const tracker = useRef(new GameAudioTracker()),
    checkpoint = useRef<{ match: string | null; sequence: number } | null>(null);
  const [closedResult, setClosedResult] = useState('');
  const [flights, setFlights] = useState<HoldemEvent[]>([]);
  const resultKey =
    game?.lastResult && game.phase !== 'betting' ? `${room.matchId}:${game.lastResult.handNumber}` : '';
  const resultOpen =
    !!resultKey &&
    closedResult !== resultKey &&
    sessionStorage.getItem(`poker-result:${resultKey}`) !== 'closed';
  const [fx, setFx] = useState<HoldemEvent | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (room.status === 'waiting') navigate(`/room/${room.id}`, { replace: true });
  }, [room.status, room.id]);
  useEffect(() => {
    setRaiseTo(game?.minRaiseTo ?? 40);
    setConfirmAllIn(false);
  }, [game?.currentBet, game?.handNumber, game?.currentPlayerId]);
  useEffect(() => {
    for (const cue of tracker.current.update(room, connected && !document.hidden, me))
      audioEngine.effect(cue.effect, cue.delay);
    if (!game || !connected || document.hidden) {
      checkpoint.current = null;
      setFlights([]);
      setFx(null);
      return;
    }
    const previous = checkpoint.current;
    checkpoint.current = { match: room.matchId, sequence: game.logSequence };
    if (!previous || previous.match !== room.matchId) {
      setFlights([]);
      setFx(null);
      return;
    }
    const fresh = game.events.filter((e) => e.number > previous.sequence);
    if (fresh.length <= 10) {
      setFlights((current) =>
        [
          ...current,
          ...fresh.filter(
            (e) => ['blind', 'call', 'raise', 'all-in'].includes(e.type) && e.amount && e.amount > 0,
          ),
        ].slice(-16),
      );
      setFx(fresh.filter((e) => ['raise', 'all-in', 'call', 'payout'].includes(e.type)).at(-1) ?? null);
    }
  }, [room, connected, me]);
  useEffect(() => {
    for (const cue of tracker.current.countdown(room, now, connected && !document.hidden))
      audioEngine.effect(cue.effect, cue.delay);
  }, [room, now, connected]);
  if (!game) return <div className="loading-panel">正在准备德州牌桌…</div>;
  const mine = room.players.find((p) => p.id === me && !p.hasLeft),
    legal = holdem.getLegalActions(game, me ?? ''),
    can = (type: HoldemAction['type']) => connected && !busy && !!mine && legal.some((a) => a.type === type);
  const myIndex = game.players.indexOf(me ?? ''),
    order = [...game.players.slice(Math.max(0, myIndex)), ...game.players.slice(0, Math.max(0, myIndex))];
  const others = order
    .filter((id) => id !== me)
    .map((id) => room.players.find((p) => p.id === id))
    .filter((p): p is Player => !!p);
  const ownRank =
    game.hand.length === 2 && game.community.length >= 3
      ? evaluateHand([...game.hand, ...game.community])
      : null;
  const best = new Set(ownRank?.cards.map((c) => c.id));
  const name = (id: string) => room.players.find((p) => p.id === id)?.name ?? '牌友';
  const seconds = Math.max(0, Math.ceil((game.turnDeadline - now) / 1000));
  function closeResult() {
    sessionStorage.setItem(`poker-result:${resultKey}`, 'closed');
    setClosedResult(resultKey);
  }
  async function prepare() {
    setBusy(true);
    await perform(() =>
      request((ack) =>
        socket.emit('room:ready', { roomId: room.id, ready: !game!.readyPlayers.includes(me!) }, ack),
      ),
    );
    setBusy(false);
  }
  async function send(action: HoldemAction) {
    setBusy(true);
    await perform(() =>
      request((ack) => socket.emit('game:action', { roomId: room.id, revision: room.revision, action }, ack)),
    );
    setBusy(false);
  }
  return (
    <section
      className={`holdem-table holdem-opponents-${others.length} ${motion ? '' : 'holdem-still'}`}
      data-testid="holdem-table"
      data-opponents={others.length}
    >
      <header className="holdem-toolbar">
        <Link className="holdem-back" to="/lobby">
          <ArrowLeft size={16} />
          桌游大厅
        </Link>
        <strong>
          德州扑克 <small>#{room.code}</small>
        </strong>
        <div className="holdem-tools">
          <AudioButton />
          <button className="icon-button" aria-label="德州扑克规则" onClick={() => setPanel('rules')}>
            <Eye size={17} />
          </button>
          <button className="icon-button" aria-label="牌桌动态" onClick={() => setPanel('logs')}>
            <List size={17} />
          </button>
          <button className="icon-button" aria-label="牌桌聊天" onClick={() => setPanel('chat')}>
            <MessageSquare size={17} />
          </button>
          <Link className="icon-button" aria-label="设置" to="/settings">
            <Settings size={17} />
          </Link>
          <button className="icon-button" aria-label="离开房间" onClick={() => void leave()}>
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <main className="holdem-felt">
        <div className="holdem-rim" />
        <span className="holdem-hand-info">
          第 {game.handNumber} 手 · 盲注 {game.smallBlind}/{game.bigBlind}
          <small>每 {game.options.blindEvery} 手翻倍</small>
        </span>
        {others.map((p, i) => (
          <Seat
            key={p.id}
            player={p}
            game={game}
            now={now}
            index={i}
            position={positions[others.length]?.[i]}
          />
        ))}
        <div className="holdem-board-zone">
          <div className="holdem-pot">
            <Spade size={18} />
            <span>{game.phase === 'betting' ? '底池' : '本手分配'}</span>
            <b>
              {(game.phase === 'betting'
                ? game.pot
                : Object.values(game.lastResult?.payouts ?? {}).reduce((a, b) => a + b, 0)
              ).toLocaleString()}
            </b>
            <div className="holdem-pot-chips">
              {Array.from({ length: 5 }, (_, i) => (
                <i className="poker-chip" key={i} />
              ))}
            </div>
          </div>
          <div className="holdem-community" aria-label="公共牌">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={`${game.handNumber}-${i}-${game.community[i]?.id ?? 'back'}`}
                className={`holdem-community-slot ${game.community[i] ? 'dealt' : ''} ${best.has(game.community[i]?.id ?? '') ? 'best-card' : ''}`}
                style={{ '--deal-delay': `${i * 0.07}s` } as CSSProperties}
              >
                <PokerCard card={game.community[i]} />
              </div>
            ))}
          </div>
          <span className="holdem-street">
            {game.phase === 'betting'
              ? streetNames[game.street]
              : game.lastResult?.uncontested
                ? '其余玩家弃牌'
                : '摊牌结算'}{' '}
            · NO LIMIT
          </span>
          {game.phase !== 'betting' && game.lastResult && (
            <div className="holdem-hand-result" data-testid="holdem-hand-result">
              <Trophy size={16} />
              <div>
                {game.lastResult.pots.map((pot, i) => (
                  <p key={i}>
                    {i === 0 ? '主池' : `边池 ${i}`} · {pot.amount} →{' '}
                    {pot.winners.map((id) => name(id)).join(' / ')}
                  </p>
                ))}
                <small>
                  {Object.entries(game.lastResult.ranks)
                    .map(([id, r]) => `${name(id)}：${r.name}`)
                    .join(' · ')}
                </small>
              </div>
            </div>
          )}
        </div>
        {!connected && <div className="holdem-reconnecting">正在重连，暂时无法下注…</div>}
        {motion && fx && (
          <div
            key={`${room.matchId}-${fx.number}`}
            className={`holdem-action-fx fx-${fx.type}`}
            aria-hidden="true"
          >
            {fx.type === 'payout' ? (
              <>
                <Trophy size={42} />
                <b>底池已分配</b>
              </>
            ) : (
              <>
                <div className="poker-chip" />
                <b>
                  {name(fx.playerId)} · {actionNames[fx.type]} {fx.amount}
                </b>
              </>
            )}
          </div>
        )}
      </main>
      <footer className="holdem-hand-area">
        <div className="holdem-turn">
          <span>
            {game.winnerId
              ? '锦标赛结束'
              : game.phase === 'showdown'
                ? `等待准备 · ${game.readyPlayers.filter((id) => game.alive.includes(id)).length}/${game.alive.length}`
                : `${name(game.currentPlayerId)} 正在行动`}
          </span>
          {mine &&
            ((game.phase === 'betting' && game.currentPlayerId === me) ||
              game.readyPlayers.includes(me!)) && (
              <SeatCountdown
                playerId={me!}
                name={mine.name}
                ready={game.readyPlayers.includes(me!)}
                seconds={game.phase === 'betting' ? seconds : undefined}
              />
            )}
          <em>
            {ownRank ? `当前最佳：${ownRank.name}` : mine ? '选择时机，读懂牌桌' : '观战视野 · 底牌不公开'}
          </em>
        </div>
        <div className="holdem-controls">
          {game.phase === 'betting' ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={!can('poker:fold')}
                onClick={() => void send({ type: 'poker:fold' })}
              >
                弃牌
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!can('poker:check')}
                onClick={() => void send({ type: 'poker:check' })}
              >
                过牌
              </Button>
              <Button
                size="sm"
                disabled={!can('poker:call')}
                onClick={() => void send({ type: 'poker:call' })}
              >
                跟注 {game.callAmount || ''}
              </Button>
              <label className="holdem-raise-input">
                <span>加注到</span>
                <input
                  aria-label="加注本轮总额"
                  type="number"
                  min={game.minRaiseTo}
                  max={game.maxRaiseTo}
                  step="1"
                  value={raiseTo}
                  disabled={!can('poker:raise')}
                  onChange={(e) => setRaiseTo(Number(e.target.value))}
                />
              </label>
              <Button
                size="sm"
                disabled={
                  !can('poker:raise') ||
                  !Number.isInteger(raiseTo) ||
                  raiseTo < game.minRaiseTo ||
                  raiseTo > game.maxRaiseTo
                }
                onClick={() => void send({ type: 'poker:raise', amount: raiseTo })}
              >
                {game.currentBet ? '加注' : '下注'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="holdem-allin"
                disabled={!can('poker:all-in')}
                onClick={() => setConfirmAllIn(true)}
              >
                全下
              </Button>
            </>
          ) : (
            <>
              {mine && (game.winnerId || game.alive.includes(me!)) && (
                <Button
                  size="sm"
                  disabled={!connected || busy || (room.status === 'finished' && !room.resultSaved)}
                  onClick={() => void prepare()}
                >
                  {game.readyPlayers.includes(me!) ? '取消准备' : '准备'}
                </Button>
              )}
              <Button size="sm" variant="outline" asChild>
                <Link to="/lobby">回到大厅</Link>
              </Button>
            </>
          )}
        </div>
        {mine && <Seat player={mine} game={game} now={now} own />}
        <div
          className={`holdem-own-cards ${game.folded.includes(me ?? '') ? 'folded' : ''}`}
          aria-label="自己的两张底牌"
        >
          {game.hand.map((card) => (
            <div key={`${game.handNumber}-${card.id}`} className={best.has(card.id) ? 'best-card' : ''}>
              <PokerCard card={card} />
            </div>
          ))}
          {!game.hand.length && <span>{mine ? '已淘汰 · 继续观战' : '仅公开牌可见'}</span>}
        </div>
        <small className="holdem-table-note">桌面筹码不扣大厅金币 · 加注金额为本轮总额</small>
      </footer>
      <Dialog open={confirmAllIn} onOpenChange={setConfirmAllIn}>
        <DialogContent>
          <DialogTitle>确认全下？</DialogTitle>
          <DialogDescription>
            投入剩余 {game.stacks[me ?? ''] ?? 0} 个桌面筹码。短码全下可能只够跟注，边池由服务端独立结算。
          </DialogDescription>
          <Button
            disabled={!can('poker:all-in')}
            onClick={() => {
              setConfirmAllIn(false);
              void send({ type: 'poker:all-in' });
            }}
          >
            确认全下
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!panel}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <DialogContent className="holdem-drawer">
          <DialogTitle>
            {panel === 'chat' ? '牌桌聊天' : panel === 'logs' ? '牌桌动态' : '德州扑克 · 本桌规则'}
          </DialogTitle>
          <DialogDescription>2–6 人无限注休闲锦标赛，最后拥有筹码的玩家获胜。</DialogDescription>
          {panel === 'chat' ? (
            <Chat room={room} />
          ) : panel === 'logs' ? (
            <div>
              {game.logs.map((log) => (
                <p key={log.id}>
                  {name(log.event?.playerId ?? '')} · {log.text}
                </p>
              ))}
            </div>
          ) : (
            <div>
              <p>
                52
                张牌，每人两张秘密底牌。翻牌三张、转牌一张、河牌一张；从底牌和公共牌中任意选择最佳五张。A2345
                可作最小顺子，花色不分大小。
              </p>
              <p>
                庄家左侧为小盲，再左为大盲；翻牌前大盲之后先行动，之后每轮庄家左侧先行动。单挑中庄家兼小盲，翻牌前先行动、翻牌后后行动。
              </p>
              <p>
                只能在本人回合弃牌、过牌、跟注、加注或全下。加注到本轮总额，最少增加上一完整下注/加注的幅度；短码全下不重新开放已行动者的加注，累计短码达到完整幅度时重新开放。没有可继续下注的对手时不能额外加注。
              </p>
              <p>
                全下筹码分层形成主池和边池，只有对该层有贡献且未弃牌的人有资格赢取；未跟注的超额退回。相同最佳五张牌平分，奇数余筹从庄家左侧的获胜者起分配。只剩一人未弃牌时无需亮牌，弃牌者的底牌永不公开。
              </p>
              <p>
                每人 {game.options.startingStack} 桌面筹码，初始盲注 {game.options.smallBlind}/
                {game.options.smallBlind * 2}，每 {game.options.blindEvery}{' '}
                手翻倍。每手结束展示未弃牌玩家的最佳五张牌，关闭弹窗后所有存活玩家准备才发下一手；AI
                自动准备。锦标赛结束后所有在座玩家准备，才开启新比赛。行动时限 {game.options.turnSeconds}{' '}
                秒，离线或超时由公平 AI 代打。
              </p>
              <a href="https://www.pokerstars.com/poker/games/texas-holdem/" target="_blank" rel="noreferrer">
                官方规则参考 ↗
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {motion &&
        connected &&
        flights.map((event) => <HoldemChipFlight key={`${room.matchId}-${event.number}`} event={event} />)}
      <Dialog
        open={resultOpen}
        onOpenChange={(open) => {
          if (!open) closeResult();
        }}
      >
        <DialogContent className="holdem-showdown-dialog">
          <DialogTitle>
            {game.winnerId ? '锦标赛结束' : `第 ${game.lastResult?.handNumber} 手 · 摊牌结算`}
          </DialogTitle>
          <DialogDescription>
            {game.winnerId
              ? `${name(game.winnerId)} 赢得锦标赛。`
              : '依座位顺序展示所有未弃牌玩家的最佳五张牌。关闭后，在桌面准备下一手。'}
          </DialogDescription>
          <div className="holdem-showdown-list">
            {game.lastResult &&
              game.players
                .filter(
                  (id) =>
                    !game.folded.includes(id) &&
                    (game.lastResult!.ranks[id] ||
                      (game.lastResult!.uncontested && game.lastResult!.payouts[id] > 0)),
                )
                .map((id) => {
                  const rank = game.lastResult!.ranks[id];
                  return (
                    <section
                      key={id}
                      className="holdem-showdown-player"
                      data-testid="holdem-showdown-player"
                      data-player-id={id}
                    >
                      <header>
                        <b>{name(id)}</b>
                        <span>{rank?.name ?? '其余玩家弃牌 · 无需亮牌'}</span>
                        <em>获得 {game.lastResult!.payouts[id] ?? 0} 筹码</em>
                      </header>
                      {rank ? (
                        <div className="holdem-showdown-cards">
                          {rank.cards.map((card) => (
                            <PokerCard key={card.id} card={card} small />
                          ))}
                        </div>
                      ) : (
                        <p>保护底牌隐私，本手没有五张牌摊牌结果。</p>
                      )}
                    </section>
                  );
                })}
          </div>
          <Button onClick={closeResult}>关闭</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
