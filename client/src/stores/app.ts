import { create } from 'zustand';
import type { RoomSummary, RoomView, Session, User } from '../../../shared/types';
import { applyTheme, savedTheme, type ThemeId } from '@/lib/themes';
interface AppState {
  session: Session | null;
  connected: boolean;
  rooms: RoomSummary[];
  room: RoomView | null;
  roomsById: Record<string, RoomView>;
  online: User[];
  toast: { text: string; kind: 'error' | 'success' } | null;
  motionEnabled: boolean;
  theme: ThemeId;
  activeRoomId: string | null;
  setTheme: (theme: ThemeId) => void;
  setActiveRoom: (room: RoomView | null) => void;
  setSession: (session: Session) => void;
  setConnected: (value: boolean) => void;
  setRooms: (rooms: RoomSummary[]) => void;
  setRoom: (room: RoomView | null) => void;
  setOnline: (users: User[]) => void;
  notify: (text: string, kind?: 'error' | 'success') => void;
}
let toastTimer: ReturnType<typeof setTimeout>;
export const useApp = create<AppState>((set) => ({
  session: null,
  connected: false,
  rooms: [],
  room: null,
  roomsById: {},
  online: [],
  toast: null,
  motionEnabled: localStorage.getItem('playroom-motion') !== 'off',
  theme: savedTheme(),
  activeRoomId: localStorage.getItem('playroom-room'),
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  setActiveRoom: (room) => {
    if (room) localStorage.setItem('playroom-room', room.id);
    else localStorage.removeItem('playroom-room');
    set((s) => {
      const cached = room ? s.roomsById[room.id] : null;
      const latest = cached && room && cached.revision > room.revision ? cached : room;
      return {
        activeRoomId: latest?.id ?? null,
        room: latest,
        roomsById: latest ? { ...s.roomsById, [latest.id]: latest } : s.roomsById,
      };
    });
  },
  setSession: (session) => set({ session }),
  setConnected: (connected) => set({ connected }),
  setRooms: (rooms) => set({ rooms }),
  setRoom: (room) =>
    set((s) => {
      if (room && (s.roomsById[room.id]?.revision ?? -1) > room.revision) return s;
      return { room, roomsById: room ? { ...s.roomsById, [room.id]: room } : s.roomsById };
    }),
  setOnline: (online) => set({ online }),
  notify: (text, kind = 'error') => {
    clearTimeout(toastTimer);
    set({ toast: { text, kind } });
    toastTimer = setTimeout(() => set({ toast: null }), 4500);
  },
}));
