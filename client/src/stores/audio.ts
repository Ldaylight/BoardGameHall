import { create } from 'zustand';
import { defaultAudio, normalizeAudio, type AudioPreferences } from '@/lib/audio-settings';
export type AudioStatus = 'locked' | 'ready' | 'paused' | 'error' | 'unsupported';
interface AudioStore {
  preferences: AudioPreferences;
  status: AudioStatus;
  message: string;
  update: (patch: Partial<AudioPreferences>) => void;
  setStatus: (status: AudioStatus, message?: string) => void;
}
function readPreferences() {
  try {
    return normalizeAudio(JSON.parse(localStorage.getItem('playroom-audio') ?? 'null'));
  } catch {
    return { ...defaultAudio };
  }
}
export const useAudio = create<AudioStore>((set) => ({
  preferences: readPreferences(),
  status: 'locked',
  message: '',
  update: (patch) =>
    set((s) => {
      const preferences = normalizeAudio({ ...s.preferences, ...patch });
      try {
        localStorage.setItem('playroom-audio', JSON.stringify(preferences));
      } catch {
        /* Storage may be disabled. */
      }
      return { preferences };
    }),
  setStatus: (status, message = '') => set({ status, message }),
}));
