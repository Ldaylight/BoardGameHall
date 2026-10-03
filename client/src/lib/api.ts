import { io, type Socket } from 'socket.io-client';
import type {
  ClientEvents,
  ProfileData,
  Result,
  RoomView,
  ServerEvents,
  Session,
} from '../../../shared/types';
import { useApp } from '@/stores/app';
export let socket: Socket<ServerEvents, ClientEvents>;
const base = import.meta.env.VITE_SERVER_URL || '';
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${base}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('playroom-token') || ''}`,
      ...options.headers,
    },
  });
  const body = (await response.json()) as Result<T>;
  if (!body.ok) throw new Error(body.error);
  return body.data;
}
export async function connectSession() {
  const session = await api<Session>('/session', {
    method: 'POST',
    body: JSON.stringify({
      name: localStorage.getItem('playroom-name') || '冒险家',
      token: localStorage.getItem('playroom-token'),
    }),
  });
  localStorage.setItem('playroom-token', session.token);
  useApp.getState().setSession(session);
  socket = io(base || undefined, {
    auth: { token: session.token },
    transports: ['websocket'],
    reconnection: true,
  });
  socket.on('connect', () => {
    useApp.getState().setConnected(true);
    // Query server membership even when refreshing the lobby, rather than a room route.
    const activeId = useApp.getState().activeRoomId;
    void perform(async () => {
      const room = await request<RoomView | null>((ack) => socket.emit('room:current', ack));
      if (useApp.getState().activeRoomId !== activeId) return;
      const newer = room ? useApp.getState().roomsById[room.id] : null;
      useApp.getState().setActiveRoom(newer && room && newer.revision > room.revision ? newer : room);
    });
  });
  socket.on('disconnect', () => useApp.getState().setConnected(false));
  socket.on('connect_error', () => useApp.getState().setConnected(false));
  const receivedMatches = new Set<string>();
  function receive(room: RoomView) {
    const active = useApp.getState().roomsById[room.id];
    if (active?.id === room.id && active.revision > room.revision) return;
    useApp.getState().setRoom(room);
    if (room.resultSaved && room.matchId && !receivedMatches.has(room.matchId)) {
      receivedMatches.add(room.matchId);
      void api<ProfileData>('/profile')
        .then((p) => {
          const s = useApp.getState().session;
          if (s) useApp.getState().setSession({ ...s, user: p.user });
        })
        .catch(() => receivedMatches.delete(room.matchId!));
    }
  }
  socket.on('room:state', receive);
  socket.on('game:state', receive);
  socket.on('lobby:update', (rooms) => useApp.getState().setRooms(rooms));
  socket.on('presence:update', (users) => useApp.getState().setOnline(users));
  socket.on('server:error', (error) => useApp.getState().notify(error));
}
export function request<T>(send: (ack: (r: Result<T>) => void) => void): Promise<T> {
  if (!socket?.connected) return Promise.reject(new Error('连接尚未建立，请稍后重试'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('请求超时，请重试或刷新房间')), 10000);
    send((result) => {
      clearTimeout(timer);
      if (result.ok) resolve(result.data);
      else reject(new Error(result.error));
    });
  });
}
export async function perform(task: () => Promise<unknown>) {
  try {
    await task();
  } catch (error) {
    useApp.getState().notify(error instanceof Error ? error.message : '操作失败');
  }
}
export async function leaveRoom(roomId: string) {
  await request<null>((ack) => socket.emit('room:leave', { roomId }, ack));
  if (useApp.getState().activeRoomId === roomId) useApp.getState().setActiveRoom(null);
}
