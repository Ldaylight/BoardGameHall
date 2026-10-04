/** Browser-only visual/audio harness; never imported by the application or its production bundle. */
import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { XiangqiBoard } from '@/components/XiangqiBoard';
import { audioEngine } from '@/lib/audio-engine';
import { eventCues } from '@/lib/game-audio';
import { xiangqiMoveDuration } from '@/lib/xiangqi-timeline';
import { useAudio } from '@/stores/audio';
import { useApp } from '@/stores/app';
import { xiangqi } from '../../shared/games/xiangqi';
import type { PieceKind, Side, XiangqiMove } from '../../shared/games/xiangqi/types';
import '@/xiangqi.css';

let root: Root;
let sequence = 0;
export function mountEffects(kind: PieceKind, side: Side, reduced = false, muted = false) {
  useAudio.getState().update({ musicEnabled: false, effectsEnabled: true, muted });
  useApp.setState({ motionEnabled: !reduced });
  if (!root) {
    const node = document.createElement('div');
    document.body.append(node);
    root = createRoot(node);
  }
  root.render(<Fixture key={++sequence} kind={kind} side={side} />);
}
function Fixture({ kind, side }: { kind: PieceKind; side: Side }) {
  const [active, setActive] = useState<XiangqiMove | null>(null);
  const [capture, setCapture] = useState(false);
  const move: XiangqiMove = {
    type: 'move',
    number: sequence,
    from: { x: 2, y: 6 },
    to: { x: 4, y: 4 },
    piece: { id: 'actor', kind, side },
    captured: { id: 'victim', kind: 'soldier', side: side === 'red' ? 'black' : 'red' },
    check: false,
    chaseIds: [],
  };
  const game = xiangqi.getView(xiangqi.createState(['r', 'b']), 'r');
  game.board = Array.from({ length: 10 }, () => Array(9).fill(null));
  game.board[capture ? move.to.y : move.from.y][capture ? move.to.x : move.from.x] = move.piece;
  if (!capture) game.board[move.to.y][move.to.x] = move.captured;
  game.moves = capture ? [move] : [];
  game.turnNumber = capture ? move.number : 0;
  async function play(captures: boolean) {
    await audioEngine.unlock();
    const action = { ...move, captured: captures ? move.captured : null };
    setCapture(true);
    setActive(action);
    for (const cue of eventCues(
      { type: 'xiangqi-move', playerId: 'r', piece: kind, capture: captures, check: false },
      'r',
    ))
      audioEngine.effect(cue.effect, cue.delay);
    setTimeout(() => setActive(null), xiangqiMoveDuration(kind, captures) * 1000);
  }
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        background: '#101b23',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div style={{ position: 'absolute', top: 18, left: 22, color: '#a0bfc1' }}>
        {side === 'red' ? '红方' : '黑方'} · {kind}
      </div>
      <div style={{ position: 'absolute', top: 18, right: 22, display: 'flex', gap: 16 }}>
        <button className="button" onClick={() => void play(true)}>
          演示吃子
        </button>
        <button className="button" onClick={() => void play(false)}>
          演示移动
        </button>
      </div>
      <XiangqiBoard
        game={game}
        me="r"
        canAct={false}
        connected={true}
        matchId="fixture"
        onMove={() => {}}
        move={active}
      />
    </div>
  );
}
