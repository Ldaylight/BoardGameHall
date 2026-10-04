export type AudioScene = 'lobby' | 'game';
export const musicTracks = [
  {
    id: 'lobby-glow',
    name: '微光大厅',
    description: '轻柔电子 · 原创循环',
    scene: 'lobby',
    bpm: 92,
    notes: [64, 67, 71, 74, 71, 67, 64, 62, 60, 64, 67, 71, 67, 64, 62, 59],
  },
  {
    id: 'lobby-rain',
    name: '雨夜漫游',
    description: '舒缓氛围 · 原创循环',
    scene: 'lobby',
    bpm: 76,
    notes: [69, 72, 76, 79, 76, 72, 69, 67, 65, 69, 72, 76, 72, 69, 67, 64],
  },
  {
    id: 'game-pulse',
    name: '星际牌局',
    description: '律动合成器 · 原创循环',
    scene: 'game',
    bpm: 116,
    notes: [64, 76, 71, 67, 74, 71, 67, 64, 60, 72, 67, 64, 71, 67, 62, 59],
  },
  {
    id: 'game-orbit',
    name: '霓虹轨道',
    description: '复古街机 · 原创循环',
    scene: 'game',
    bpm: 128,
    notes: [69, 81, 76, 72, 79, 76, 72, 69, 65, 77, 72, 69, 76, 72, 67, 64],
  },
] as const;
export interface AudioPreferences {
  muted: boolean;
  musicEnabled: boolean;
  effectsEnabled: boolean;
  countdownEnabled: boolean;
  musicVolume: number;
  effectsVolume: number;
  lobbyTrack: string;
  gameTrack: string;
}
export const defaultAudio: AudioPreferences = {
  muted: false,
  musicEnabled: true,
  effectsEnabled: true,
  countdownEnabled: true,
  musicVolume: 0.35,
  effectsVolume: 0.6,
  lobbyTrack: 'lobby-glow',
  gameTrack: 'game-pulse',
};
export function normalizeAudio(input: unknown): AudioPreferences {
  const data = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const result = { ...defaultAudio };
  for (const key of ['muted', 'musicEnabled', 'effectsEnabled', 'countdownEnabled'] as const)
    if (typeof data[key] === 'boolean') result[key] = data[key];
  for (const key of ['musicVolume', 'effectsVolume'] as const)
    if (typeof data[key] === 'number' && Number.isFinite(data[key]))
      result[key] = Math.min(1, Math.max(0, data[key]));
  for (const key of ['lobbyTrack', 'gameTrack'] as const)
    if (
      typeof data[key] === 'string' &&
      (musicTracks.some((t) => t.id === data[key]) || /^custom:[a-f0-9-]{36}$/i.test(data[key]))
    )
      result[key] = data[key];
  return result;
}
