import type { RoomView } from '../../../shared/types';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { leaveRoom, perform, request, socket } from './api';
import { useApp } from '@/stores/app';
export function useRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const connected = useApp((s) => s.connected);
  const room = useApp((s) => (roomId ? (s.roomsById[roomId] ?? null) : null));
  useEffect(() => {
    if (!roomId || !connected) return;
    let cancelled = false;
    void perform(async () => {
      const next = await request<RoomView>((ack) => socket.emit('room:sync', { roomId }, ack));
      if (!cancelled) {
        useApp.getState().setRoom(next);
        useApp.getState().setActiveRoom(useApp.getState().roomsById[next.id]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [roomId, connected]);
  async function leave() {
    if (!roomId) return;
    await perform(async () => {
      await leaveRoom(roomId);
      navigate('/lobby');
    });
  }
  return { roomId, room, connected, leave };
}
