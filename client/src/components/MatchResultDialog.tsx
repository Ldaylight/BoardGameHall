import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye, RotateCcw, Trophy } from 'lucide-react';
import type { RoomView } from '../../../shared/types';
import { useApp } from '@/stores/app';
import { perform, request, socket } from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
/** Dismissal is scoped to a match, so chat/result-save snapshots never reopen it. */
export function MatchResultDialog({
  room,
  connected,
  ready = true,
  onOpen,
}: {
  room: RoomView;
  connected: boolean;
  ready?: boolean;
  onOpen?: () => void;
}) {
  const me = useApp((s) => s.session?.user.id);
  const game = room.game,
    ended = !!game && (!!game.winnerId || ('draw' in game && game.draw));
  const [dismissed, setDismissed] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const opened = useRef<string | null>(null);
  const open = ended && ready && !!room.matchId && dismissed !== room.matchId;
  useEffect(() => {
    if (open && opened.current !== room.matchId) {
      opened.current = room.matchId;
      onOpen?.();
    }
  }, [open, room.matchId, onOpen]);
  const winner = room.players.find((p) => p.id === game?.winnerId),
    draw = !!game && 'draw' in game && game.draw,
    host = room.hostId === me,
    puzzle = room.gameId === 'xiangqi' && room.options.xiangqi?.mode === 'puzzle';
  const ddz = game && 'kind' in game && game.kind === 'doudizhu' ? game : null;
  const won = ddz ? ddz.winnerIds.includes(me ?? '') : winner?.id === me;
  async function rematch() {
    setBusy(true);
    await perform(() => request((ack) => socket.emit('room:rematch', { roomId: room.id }, ack)));
    setBusy(false);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setDismissed(room.matchId);
      }}
    >
      <DialogContent className="match-result-dialog">
        <span className={`result-emblem ${draw ? 'is-draw' : ''}`}>
          <Trophy size={42} />
        </span>
        <DialogTitle className="modal-title text-center">
          {draw
            ? '平局，棋逢对手'
            : won
              ? puzzle
                ? '残局已解开！'
                : '恭喜你，拿下这一局！'
              : ddz
                ? `${ddz.winningTeam === 'landlord' ? '地主' : '农民'} 阵营获胜`
                : `${winner?.name ?? '对手'} 获胜`}
        </DialogTitle>
        <DialogDescription className="winner-desc">
          {puzzle
            ? '教学残局已结束，继续挑战下一道，或重新试一局。'
            : draw
              ? '这局势均力敌，再来一局继续切磋。'
              : '这一局结束了，下一局还有新的可能。'}
          <br />
          {room.resultSaved ? '结果已记录。' : '正在保存结果，保存完成后可开启下一局。'}
          {!host && (
            <>
              <br />
              等待房主开启下一局，也可以返回大厅。
            </>
          )}
        </DialogDescription>
        {ddz && (
          <div className="ddz-scoreboard">
            <p>
              底分 {ddz.highestBid} × {ddz.multiplier} 倍
              {ddz.spring ? ` · ${ddz.spring === 'spring' ? '春天' : '反春天'}` : ''}
            </p>
            {room.players.map((p) => (
              <div key={p.id}>
                <span>
                  {p.name} · {p.id === ddz.landlordId ? '地主' : '农民'}
                </span>
                <b className={ddz.scores[p.id] > 0 ? 'positive' : 'negative'}>
                  {ddz.scores[p.id] > 0 ? '+' : ''}
                  {ddz.scores[p.id]} 分
                </b>
              </div>
            ))}
            <small>对局分为本场零和计分；大厅胜者 +30 战绩积分 / +100 金币，败者 +5 / +10。</small>
          </div>
        )}
        <div className="match-result-actions">
          {host && (
            <Button disabled={busy || !connected || !room.resultSaved} onClick={() => void rematch()}>
              <RotateCcw size={16} />
              {busy ? '正在准备…' : puzzle ? '重试残局' : '再来一局'}
            </Button>
          )}
          {puzzle && (
            <Button variant="outline" asChild>
              <Link to="/xiangqi/endgames">更多残局</Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to="/lobby">
              <ArrowLeft size={16} />
              返回大厅
            </Link>
          </Button>
          <Button variant="ghost" onClick={() => setDismissed(room.matchId)}>
            <Eye size={16} />
            查看
            {room.gameId === 'uno' || room.gameId === 'doudizhu' || room.gameId === 'exploding-kittens'
              ? '牌桌'
              : '棋盘'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
