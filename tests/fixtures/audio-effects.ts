/** Vite resolves the same module URL (including HMR revision) as AudioController. Test-only. */
import { audioEngine, type SoundEffect } from '@/lib/audio-engine';
export function playEffect(effect: SoundEffect, delay = 0) {
  audioEngine.effect(effect, delay);
  return audioEngine.unlocked;
}
export async function preloadKittenEffects() {
  await audioEngine.preloadKittens();
}
