import { useEffect, useState } from 'react';
import { defaultGomokuOptions, type GomokuOptions } from '../../../shared/games/gomoku/types';
import { ArrowUpRight, Bot, Copy, DoorOpen, Plus, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { games } from '../../../shared/catalog';
import type { Difficulty, GameId, RoomView } from '../../../shared/types';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { perform, request, socket } from '@/lib/api';
import { useApp } from '@/stores/app';
export function CreateRoomDialog({
  open,
  onOpenChange,
  initialGame = 'uno',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialGame?: GameId;
}) {
  const navigate = useNavigate();
  const [gameId, setGameId] = useState<GameId>(initialGame);
  const [name, setName] = useState('来一局，交个朋友');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [allowAI, setAllowAI] = useState(true);
  const [allowSpectators, setAllowSpectators] = useState(true);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [busy, setBusy] = useState(false);
  const [gomoku, setGomoku] = useState<GomokuOptions>({ ...defaultGomokuOptions });
  useEffect(() => {
    if (open) setGameId(initialGame);
  }, [open, initialGame]);
  useEffect(() => {
    if (gameId === 'gomoku') setMaxPlayers(2);
  }, [gameId]);
  const connected = useApp((s) => s.connected);
  async function create() {
    setBusy(true);
    await perform(async () => {
      const room = await request<RoomView>((ack) =>
        socket.emit(
          'room:create',
          {
            gameId,
            name,
            maxPlayers: gameId === 'gomoku' ? 2 : maxPlayers,
            allowAI,
            allowSpectators,
            difficulty,
            ...(gameId === 'gomoku' ? { gomoku } : {}),
          },
          ack,
        ),
      );
      useApp.getState().setActiveRoom(room);
      onOpenChange(false);
      navigate(`/room/${room.id}`);
    });
    setBusy(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="modal-icon">
          <Plus />
        </div>
        <DialogTitle className="modal-title">组个局，好戏开场</DialogTitle>
        <DialogDescription className="modal-desc">
          邀请朋友，或让 AI 加入你的牌桌。创建房间免费。
        </DialogDescription>
        <div className="form-stack">
          <label>
            选择游戏
            <select value={gameId} onChange={(e) => setGameId(e.target.value as GameId)}>
              {games.map((g) => (
                <option key={g.id} value={g.id} disabled={!g.available}>
                  {g.name}
                  {!g.available && ' · 即将上线'}
                </option>
              ))}
            </select>
          </label>
          <label>
            房间名称
            <input
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="给你的牌桌起个名字"
            />
          </label>
          <div className="form-row">
            <label>
              座位数量
              <select value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}>
                {(gameId === 'gomoku' ? [2] : [2, 3, 4, 5, 6]).map((n) => (
                  <option key={n} value={n}>
                    {n} 人
                  </option>
                ))}
              </select>
            </label>
            <label>
              AI 难度
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                <option value="easy">简单 · {gameId === 'gomoku' ? '随机落子' : '随机出牌'}</option>
                <option value="medium">中等 · {gameId === 'gomoku' ? '进攻与防守' : '策略出牌'}</option>
                <option value="hard">
                  困难 · {gameId === 'gomoku' ? 'Alpha-Beta 搜索' : '预留（当前中等）'}
                </option>
              </select>
            </label>
          </div>
          {gameId === 'gomoku' && (
            <fieldset className="gomoku-options">
              <legend>五子棋规则 · 默认自由规则</legend>
              {(
                [
                  ['blackForbidden', '黑棋禁手（三三、四四、长连）'],
                  ['overlineForbidden', '黑棋长连禁手'],
                  ['allowUndo', '允许申请悔棋（需对手同意）'],
                  ['allowResign', '允许认输'],
                  ['timeoutLoss', '超时判负'],
                ] as const
              ).map(([key, label]) => (
                <label className="check-row" key={key}>
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={gomoku[key]}
                    disabled={key === 'overlineForbidden' && gomoku.blackForbidden}
                    onChange={(e) => setGomoku({ ...gomoku, [key]: e.target.checked })}
                  />
                </label>
              ))}
              <label>
                每步时限
                <select
                  value={gomoku.turnSeconds}
                  onChange={(e) => setGomoku({ ...gomoku, turnSeconds: Number(e.target.value) })}
                >
                  {[15, 30, 45, 60, 90, 120, 180].map((s) => (
                    <option value={s} key={s}>
                      {s} 秒
                    </option>
                  ))}
                </select>
              </label>
              <p className="room-hint">
                禁手位置不可落子。未开启超时判负时，超时由 AI 临时代下；悔棋每人每局限一次。
              </p>
            </fieldset>
          )}
          <label className="check-row">
            <span>
              <Bot size={17} />
              允许 AI 补位
            </span>
            <input type="checkbox" checked={allowAI} onChange={(e) => setAllowAI(e.target.checked)} />
          </label>
          <label className="check-row">
            <span>
              <Users size={17} />
              允许其他玩家观战
            </span>
            <input
              type="checkbox"
              checked={allowSpectators}
              onChange={(e) => setAllowSpectators(e.target.checked)}
            />
          </label>
        </div>
        <Button className="w-full mt-6" onClick={create} disabled={busy || !connected || !name.trim()}>
          {busy ? '创建中…' : '创建房间'}
          <ArrowUpRight size={18} />
        </Button>
      </DialogContent>
    </Dialog>
  );
}
export function JoinRoomDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const connected = useApp((s) => s.connected);
  async function join(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    await perform(async () => {
      const room = await request<RoomView>((ack) =>
        socket.emit('room:join', { code: code.trim().toUpperCase() }, ack),
      );
      useApp.getState().setActiveRoom(room);
      onOpenChange(false);
      navigate(`/room/${room.id}`);
    });
    setBusy(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="modal-icon">
          <DoorOpen />
        </div>
        <DialogTitle className="modal-title">朋友的牌桌，等你入座</DialogTitle>
        <DialogDescription className="modal-desc">输入 6 位房间码，立即加入。</DialogDescription>
        <form onSubmit={join} className="form-stack">
          <label>
            房间码
            <input
              className="room-code-input"
              placeholder="例如 A7B9C2"
              value={code}
              maxLength={6}
              autoFocus
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
          </label>
          <Button type="submit" disabled={code.length !== 6 || busy || !connected}>
            {busy ? '加入中…' : '加入房间'}
            <ArrowUpRight size={18} />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export async function copyInvite(code: string) {
  await perform(async () => {
    await navigator.clipboard.writeText(`${location.origin}/lobby?invite=${code}`);
    useApp.getState().notify('邀请链接已复制，发给朋友就能加入', 'success');
  });
}
export function InviteButton({ code }: { code: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => copyInvite(code)}>
      <Copy size={15} />
      邀请好友
    </Button>
  );
}
