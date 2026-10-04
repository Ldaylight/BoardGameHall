import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Volume2, VolumeX, Play } from 'lucide-react';
import { audioEngine } from '@/lib/audio-engine';
import { useAudio } from '@/stores/audio';

/** Lives above all routes so music remains continuous through lobby/room/settings. */
export function AudioController() {
  const { pathname } = useLocation();
  useEffect(() => {
    audioEngine.endPreview();
    audioEngine.setScene(pathname.startsWith('/game/') ? 'game' : 'lobby');
  }, [pathname]);
  useEffect(() => {
    const unsubscribe = useAudio.subscribe((state, previous) => {
      if (state.preferences !== previous.preferences) audioEngine.configure();
    });
    const unlock = () => {
      void audioEngine.unlock();
    };
    const click = (event: MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest('button, a[href], [role="button"], [role="switch"]')
          : null;
      if (!target || target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true')
        return;
      void audioEngine.unlock().then(() => audioEngine.effect('click'));
    };
    const visibility = () => {
      void audioEngine.visibilityChanged();
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('click', click, true);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      unsubscribe();
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('visibilitychange', visibility);
      audioEngine.stop();
    };
  }, []);
  return null;
}

export function AudioButton() {
  const muted = useAudio((s) => s.preferences.muted);
  const status = useAudio((s) => s.status);
  const locked = status === 'locked';
  const label = locked ? '开启声音' : muted ? '取消静音' : '静音所有声音';
  return (
    <button
      type="button"
      className={`icon-button audio-toggle ${muted ? 'muted' : ''}`}
      aria-label={label}
      title={label}
      onClick={() => {
        useAudio.getState().update({ muted: locked ? false : !muted });
        void audioEngine.unlock();
      }}
    >
      {locked ? <Play size={16} /> : muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
    </button>
  );
}
