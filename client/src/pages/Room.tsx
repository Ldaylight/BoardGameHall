import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bot, Check, ChevronRight, Crown, Layers3, LogOut, Play, Plus, Users } from 'lucide-react';
import type { Difficulty } from '../../../shared/types';
import { useRoom } from '@/lib/useRoom';
import { useApp } from '@/stores/app';
import { perform, request, socket } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/Layout';
import { InviteButton } from '@/components/RoomDialogs';
import { Chat } from '@/components/Chat';
import { defaultGomokuOptions } from '../../../shared/games/gomoku/types';
export function Room() {
  const { room, roomId, connected, leave } = useRoom();
  const user = useApp((s) => s.session?.user);
  const navigate = useNavigate();
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (room) setDifficulty(room.options.difficulty);
  }, [room?.id, room?.options.difficulty]);
  useEffect(() => {
    if (room?.status === 'playing') navigate(`/game/${room.id}`, { replace: true });
  }, [room?.status, room?.id, navigate]);
  if (!room)
    return (
      <div className="loading-panel">
        <Layers3 size={36} />
        <p>{connected ? '正在同步房间… 房间不存在时请返回大厅。' : '正在连接，恢复你的座位…'}</p>
        <Button variant="outline" asChild>
          <Link to="/lobby">返回大厅</Link>
        </Button>
      </div>
    );
  const host = room.hostId === user?.id;
  const me = room.players.find((p) => p.id === user?.id);
  const humansReady = room.players.filter((p) => !p.isAI).every((p) => p.ready);
  const isGomoku = room.gameId === 'gomoku';
  const isXiangqi = room.gameId === 'xiangqi';
  const gameName = isXiangqi ? '中国象棋' : isGomoku ? '五子棋' : 'UNO';
  const rules = { ...defaultGomokuOptions, ...room.options.gomoku };
  async function execute(task: () => Promise<unknown>) {
    setBusy(true);
    await perform(task);
    setBusy(false);
  }
  return (
    <>
      <div className="breadcrumb">
        <Link to="/lobby">桌游大厅</Link>
        <ChevronRight size={13} />
        <span>{gameName} 房间</span>
      </div>
      <div className="page-heading">
        <div>
          <span className="eyebrow">GOOD COMPANY, GREAT GAME</span>
          <h1>{room.name}</h1>
          <p>
            {isXiangqi
              ? '红方先手，黑方后手。邀请朋友切磋，或添加 AI 练棋。'
              : isGomoku
                ? '黑白之间，落下一步好棋。座位 1 执黑先手，座位 2 执白后手。'
                : host
                  ? '你是房主，召集伙伴开始一场好牌局。'
                  : '找个舒服的座位，准备好就出发。'}
          </p>
        </div>
        <div className="room-head-actions">
          <span className="room-code">#{room.code}</span>
          <InviteButton code={room.code} />
          <Button variant="ghost" size="sm" onClick={() => void leave()}>
            <LogOut size={15} />
            离开
          </Button>
        </div>
      </div>
      {!connected && <div className="refresh-warning">连接已断开，正在重连。房间与手牌由服务器保留。</div>}
      <div className="room-grid">
        <div>
          <section className="panel">
            <h2 className="panel-title">
              <Users size={18} />
              入座，快乐就位{' '}
              <span>
                {room.playerCount}/{room.maxPlayers} 位玩家
              </span>
            </h2>
            <div className="seats-grid">
              {Array.from({ length: room.maxPlayers }, (_, seat) => {
                const p = room.players.find((p) => p.seat === seat);
                return p ? (
                  <div className="seat-card" key={seat}>
                    <span className="seat-number">
                      {isXiangqi
                        ? seat === 0
                          ? '红方 · 先手'
                          : '黑方 · 后手'
                        : isGomoku
                          ? seat === 0
                            ? '● 黑棋 · 先手'
                            : '○ 白棋 · 后手'
                          : `SEAT 0${seat + 1}`}
                    </span>
                    {p.id === room.hostId && <Crown className="seat-crown" size={16} />}
                    <Avatar name={p.name} ai={p.isAI} />
                    <h3>
                      {p.name}
                      {p.id === user?.id ? '（你）' : ''}
                    </h3>
                    <span className="seat-status">
                      {p.ready ? (
                        <>
                          <Check size={12} />
                          已准备
                        </>
                      ) : !p.connected ? (
                        '暂时离线'
                      ) : (
                        '等待准备'
                      )}
                    </span>
                    {p.isAI && (
                      <>
                        <span className="seat-options">
                          {p.difficulty === 'easy'
                            ? '简单'
                            : p.difficulty === 'medium'
                              ? '中等'
                              : isGomoku || isXiangqi
                                ? '困难'
                                : '困难*'}
                        </span>
                        {host && (
                          <button
                            className="seat-remove"
                            disabled={busy}
                            onClick={() =>
                              void execute(() =>
                                request((ack) =>
                                  socket.emit(
                                    'room:ai',
                                    { roomId: room.id, difficulty, removeId: p.id },
                                    ack,
                                  ),
                                ),
                              )
                            }
                          >
                            移除 AI
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="seat-card seat-empty" key={seat}>
                    <span className="seat-number">SEAT 0{seat + 1}</span>
                    <Plus size={26} />
                    <p>虚位以待</p>
                    {host && room.options.allowAI && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void execute(() =>
                            request((ack) => socket.emit('room:ai', { roomId: room.id, difficulty }, ack)),
                          )
                        }
                      >
                        <Bot size={13} />
                        添加 AI
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="room-control">
              {host && room.options.allowAI && (
                <select
                  aria-label="AI 难度"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                >
                  <option value="easy">AI · 简单</option>
                  <option value="medium">AI · 中等</option>
                  <option value="hard">
                    AI · 困难{isGomoku || isXiangqi ? '（Alpha-Beta）' : '（中等策略）'}
                  </option>
                </select>
              )}
              {me && !me.isAI && (
                <Button
                  variant={me.ready ? 'outline' : 'default'}
                  disabled={busy || !connected || room.status !== 'waiting'}
                  onClick={() =>
                    void execute(() =>
                      request((ack) => socket.emit('room:ready', { roomId: room.id, ready: !me.ready }, ack)),
                    )
                  }
                >
                  <Check size={16} />
                  {me.ready ? '取消准备' : '我准备好了'}
                </Button>
              )}
              {host && (
                <Button
                  disabled={
                    busy || !connected || !humansReady || room.playerCount < 2 || room.status !== 'waiting'
                  }
                  onClick={() =>
                    void execute(() => request((ack) => socket.emit('room:start', { roomId: room.id }, ack)))
                  }
                >
                  <Play size={15} />
                  开始游戏
                </Button>
              )}
              {room.status === 'finished' && (
                <Button
                  disabled={!host || busy}
                  onClick={() =>
                    void execute(() =>
                      request((ack) => socket.emit('room:rematch', { roomId: room.id }, ack)),
                    )
                  }
                >
                  再来一局
                </Button>
              )}
            </div>
            <p className="room-hint">
              {room.status === 'finished'
                ? '本局已结束，房主可重置房间开始下一局。'
                : !me
                  ? '你正在观战。牌局开始后将自动进入游戏桌。'
                  : room.playerCount < 2
                    ? '至少需要 2 位玩家。邀请朋友，或添加一个 AI 伙伴。'
                    : !humansReady
                      ? '等待所有真人玩家准备。AI 已经迫不及待了。'
                      : '大家都准备好了，房主可以开始！'}{' '}
              {isXiangqi
                ? '困难 AI 使用迭代加深 Alpha-Beta 搜索；残局可准备后重新开始。'
                : isGomoku
                  ? '困难 AI 使用 4–6 层 Alpha-Beta 搜索。'
                  : '困难 AI 当前使用中等策略。'}
            </p>
          </section>
          <section className="panel rules-panel">
            <h2 className="panel-title">
              <Layers3 size={18} />
              {gameName} · 本大厅规则
            </h2>
            {isXiangqi ? (
              <>
                <div className="rule-tags">
                  <span>9 × 10 棋盘</span>
                  <span>红先黑后</span>
                  <span>{room.options.xiangqi?.mode === 'puzzle' ? '经典残局' : '标准对局'}</span>
                  <span>{room.options.xiangqi?.turnSeconds ?? 60} 秒回合</span>
                </div>
                <p>
                  将帅走九宫直线一步，仕士斜一步；相象走田不过河且不能塞眼，马走日不能蹩腿，车直行，炮吃子必须隔一枚炮架。兵卒向前一步，过河可平移，不能后退。被将军必须应将，不能将帅照面；将死和困毙均判负。三次重复同一局面及走棋方时，单方长将或持续追捉同一无保护大子判负，其余判和；60
                  回合无吃子且无兵卒向前判和。采用休闲判罚，未覆盖竞赛长捉全部例外。AI 延迟
                  500–1500ms，棋谱和结果保存到战绩。
                </p>
              </>
            ) : isGomoku ? (
              <>
                <div className="rule-tags">
                  <span>15 × 15 棋盘</span>
                  <span>黑棋先手</span>
                  <span>{rules.turnSeconds} 秒回合</span>
                  <span>
                    {rules.blackForbidden
                      ? '黑棋禁手'
                      : rules.overlineForbidden
                        ? '黑棋长连禁手'
                        : '自由规则'}
                  </span>
                </div>
                <p>
                  在空交叉点轮流落子，横、竖、斜连续五子或以上获胜，棋盘满且无人获胜则平局。
                  {rules.blackForbidden
                    ? '黑棋三三、四四、长连禁手（真活三检测），恰好五连优先获胜。'
                    : rules.overlineForbidden
                      ? '黑棋不可形成六连或以上，白棋不受限制。'
                      : '双方均无禁手，长连同样获胜。'}
                  禁手位置由服务器拒绝落子。
                  {rules.allowUndo
                    ? '悔棋需要对手同意，每人每局限一次；对手继续落子会取消申请。'
                    : '此房间未启用悔棋。'}
                  {rules.allowResign ? '可主动认输。' : '此房间未启用认输。'}
                  {rules.timeoutLoss
                    ? '超过回合时限直接判负，离线也继续计时。'
                    : '超时或离线由 AI 临时代下。'}
                  AI 只读取公开棋盘，行动延迟 500–1500 毫秒。
                </p>
              </>
            ) : (
              <>
                <div className="rule-tags">
                  <span>2–6 人</span>
                  <span>每人 7 张</span>
                  <span>45 秒回合</span>
                  <span>免费开局</span>
                </div>
                <p>
                  出与弃牌颜色或数字相同的牌，万能牌可指定颜色；+4 仅在没有当前颜色的牌时可出。不叠加罚牌，+2
                  / +4
                  让下一位摸牌并跳过。无牌可出时摸一张：能出则选择打出或结束回合，不能出则自动跳过。轮到自己且只剩两张时，先点「UNO!」按钮，再打出倒数第二张；漏喊由本大厅自动判罚摸两张。声明本回合有效，摸牌后需重新声明。两人局反转等同跳过。率先清空手牌获胜。超时或离线由
                  AI 临时代打。
                </p>
              </>
            )}
          </section>
        </div>
        <aside className="room-side">
          <Chat room={room} />
          <div className="room-note">
            <h3>✦ 好牌局，值得分享</h3>
            <p>
              点击「邀请好友」复制房间链接。朋友用另一个浏览器或设备打开即可加入。刷新页面会自动恢复座位。
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
