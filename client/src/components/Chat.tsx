import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { Button } from './ui/button';
import type { RoomView } from '../../../shared/types';
import { useApp } from '@/stores/app';
import { perform, request, socket } from '@/lib/api';
export function Chat({ room }: { room: RoomView }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const me = useApp((s) => s.session?.user.id);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [room.chats.length]);
  async function send(message: string) {
    if (!message.trim() || busy) return;
    setBusy(true);
    await perform(async () => {
      await request((ack) => socket.emit('room:chat', { roomId: room.id, text: message.trim() }, ack));
      setText('');
    });
    setBusy(false);
  }
  return (
    <section className="panel chat-panel">
      <h2 className="panel-title">
        <MessageSquare size={17} />
        牌桌聊天 <span>{room.players.filter((p) => p.connected && !p.isAI).length} 在线</span>
      </h2>
      <div className="chat-messages" aria-live="polite">
        {!room.chats.length && (
          <p className="chat-empty">
            打个招呼吧
            <br />
            好牌局，从认识新朋友开始。
          </p>
        )}
        {room.chats.map((m) => (
          <div key={m.id} className={`chat-message ${m.userId === me ? 'mine' : ''}`}>
            <div>
              <span>{m.name}</span>
              <time>
                {new Date(m.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </time>
            </div>
            <p>{m.text}</p>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <input
          aria-label="聊天消息"
          placeholder="聊两句…"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" disabled={!text.trim() || busy} aria-label="发送消息">
          <Send size={15} />
        </Button>
      </form>
      <div className="emoji-row">
        {['👋', '😎', '🔥', '😂', '👏', '💚'].map((e) => (
          <button key={e} onClick={() => void send(e)} aria-label={`发送表情 ${e}`}>
            {e}
          </button>
        ))}
      </div>
    </section>
  );
}
