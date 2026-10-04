import { useAudio } from '@/stores/audio';
import type { PieceKind } from '../../../shared/games/xiangqi/types';
import { getLocalTrack } from './audio-library';
import { musicTracks, type AudioScene } from './audio-settings';

export type SoundEffect =
  | `x-${PieceKind}-${'move' | 'capture'}`
  | 'x-check'
  | 'click'
  | 'hover'
  | 'deal'
  | 'draw'
  | 'play'
  | 'stone'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild4'
  | 'uno'
  | 'tick'
  | 'urgent'
  | 'turn'
  | 'win'
  | 'lose'
  | 'penalty';
const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

class AudioEngine {
  private context: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private effectsBus: GainNode | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voice: AudioBuffer | null = null;
  private voiceLoading = false;
  private sources = new Set<AudioScheduledSourceNode>();
  private musicSources = new Set<AudioScheduledSourceNode>();
  private musicTimer: ReturnType<typeof setInterval> | undefined;
  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private duckTimer: ReturnType<typeof setTimeout> | undefined;
  private media: HTMLAudioElement | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private mediaUrl: string | null = null;
  private scene: AudioScene = 'lobby';
  private previewScene: AudioScene | null = null;
  private trackId: string | null = null;
  private generation = 0;
  private hoverTime = -Infinity;
  private voiceTime = -Infinity;
  private ducked = false;

  get unlocked() {
    return this.context?.state === 'running';
  }

  async unlock(): Promise<void> {
    if (document.hidden) return;
    try {
      if (!this.context) {
        if (typeof AudioContext === 'undefined') {
          useAudio.getState().setStatus('unsupported', '当前浏览器不支持音频，请使用新版浏览器。');
          return;
        }
        this.context = new AudioContext();
        this.musicBus = this.context.createGain();
        this.effectsBus = this.context.createGain();
        this.master = this.context.createGain();
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -12;
        limiter.ratio.value = 8;
        this.musicBus.connect(limiter);
        this.effectsBus.connect(limiter);
        limiter.connect(this.master).connect(this.context.destination);
        this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
        const samples = this.noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      // resume() is invoked inside the first trusted click / key / touch gesture.
      if (this.context.state !== 'running') await this.context.resume();
      if (this.context.state !== 'running') return;
      if (useAudio.getState().status !== 'error') useAudio.getState().setStatus('ready');
      this.configure();
      this.loadVoice();
    } catch {
      useAudio.getState().setStatus('locked', '点击播放按钮重试开启声音。');
    }
  }

  configure() {
    if (!this.context || !this.musicBus || !this.effectsBus || !this.master) return;
    const p = useAudio.getState().preferences;
    const time = this.context.currentTime;
    this.master.gain.setTargetAtTime(p.muted ? 0 : 1, time, 0.025);
    this.musicBus.gain.setTargetAtTime(
      p.musicEnabled ? p.musicVolume * (this.ducked ? 0.25 : 1) : 0,
      time,
      0.04,
    );
    this.effectsBus.gain.setTargetAtTime(p.effectsEnabled ? p.effectsVolume : 0, time, 0.025);
    if (this.unlocked && !document.hidden && !p.muted && p.musicEnabled) this.ensureMusic();
    else this.stopMusic();
    if (p.muted || !p.effectsEnabled) this.stopEffects();
  }

  setScene(scene: AudioScene) {
    this.scene = scene;
    this.configure();
  }

  async preview(scene: AudioScene) {
    this.endPreview();
    this.previewScene = scene;
    await this.unlock();
    this.configure();
    this.previewTimer = setTimeout(() => this.endPreview(), 15000);
  }

  endPreview() {
    clearTimeout(this.previewTimer);
    if (!this.previewScene) return;
    this.previewScene = null;
    this.configure();
  }

  async visibilityChanged() {
    if (document.hidden) {
      this.endPreview();
      this.stopMusic();
      this.stopEffects();
      if (this.context?.state === 'running') await this.context.suspend().catch(() => {});
      if (this.context) useAudio.getState().setStatus('paused');
    } else if (this.context) await this.unlock();
  }

  async validateFile(file: File) {
    if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('请选择 20 MB 以内的音频文件。');
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(file.name))
      throw new Error('请选择 MP3、WAV、OGG 等音频文件。');
    await this.unlock();
    if (!this.context) throw new Error('当前浏览器无法播放音频。');
    try {
      await this.context.decodeAudioData(await file.arrayBuffer());
    } catch {
      throw new Error('此文件无法播放，请换用 MP3 或 WAV 音频。');
    }
  }

  private register(source: AudioScheduledSourceNode, nodes: AudioNode[], music: boolean) {
    const group = music ? this.musicSources : this.sources;
    group.add(source);
    source.onended = () => {
      group.delete(source);
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
  }

  private tone(
    midi: number,
    delay: number,
    duration: number,
    amplitude: number,
    wave: OscillatorType = 'sine',
    music = false,
    endMidi?: number,
  ) {
    const ctx = this.context,
      bus = music ? this.musicBus : this.effectsBus;
    if (!ctx || !bus || this.sources.size + this.musicSources.size > 64) return;
    const time = ctx.currentTime + delay;
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(frequency(midi), time);
    if (endMidi !== undefined)
      osc.frequency.exponentialRampToValueAtTime(frequency(endMidi), time + duration);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(amplitude, time + Math.min(0.015, duration / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain).connect(bus);
    this.register(osc, [gain], music);
    osc.start(time);
    osc.stop(time + duration + 0.01);
  }

  private swish(delay: number, duration = 0.12) {
    const ctx = this.context;
    if (!ctx || !this.noise || !this.effectsBus || this.sources.size > 48) return;
    const time = ctx.currentTime + delay;
    const source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    source.buffer = this.noise;
    filter.type = 'highpass';
    filter.frequency.value = 1900;
    gain.gain.setValueAtTime(0.08, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(gain).connect(this.effectsBus);
    this.register(source, [filter, gain], false);
    source.start(time);
    source.stop(time + duration);
  }

  private impact(delay: number, duration: number, cutoff: number, amplitude: number) {
    const ctx = this.context;
    if (!ctx || !this.noise || !this.effectsBus || this.sources.size > 48) return;
    const time = ctx.currentTime + delay,
      source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    source.buffer = this.noise;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, time);
    filter.frequency.exponentialRampToValueAtTime(90, time + duration);
    gain.gain.setValueAtTime(amplitude, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(gain).connect(this.effectsBus);
    this.register(source, [filter, gain], false);
    source.start(time);
    source.stop(time + duration);
  }
  private xiangqiSound(effect: SoundEffect, delay: number) {
    if (effect === 'x-check') {
      [69, 73, 76].forEach((n, i) => this.tone(n, delay + i * 0.1, 0.3, 0.1, 'triangle'));
      return;
    }
    const kind = effect.split('-')[1] as PieceKind,
      capture = effect.endsWith('capture');
    switch (kind) {
      case 'cannon':
        if (capture) {
          this.impact(delay, 0.8, 1700, 0.65);
          this.tone(40, delay, 0.8, 0.3, 'sine', false, 19);
          [0.08, 0.15, 0.24].forEach((d) => this.impact(delay + d, 0.2, 4500, 0.12));
        } else {
          this.tone(59, delay, 0.35, 0.14, 'sawtooth', false, 32);
          this.swish(delay, 0.3);
        }
        break;
      case 'chariot':
        this.swish(delay, capture ? 0.35 : 0.16);
        this.tone(capture ? 64 : 72, delay, capture ? 0.35 : 0.13, 0.13, 'triangle', false, 42);
        if (capture) {
          this.impact(delay, 0.35, 3800, 0.35);
          this.tone(45, delay, 0.25, 0.12);
        }
        break;
      case 'horse':
        [0, 0.11, 0.22].forEach((d, i) => {
          this.impact(delay + d, 0.08, 900 + i * 200, capture ? 0.25 : 0.12);
          this.tone(43 + i * 3, delay + d, 0.1, 0.08, 'triangle');
        });
        if (capture) this.tone(36, delay + 0.23, 0.45, 0.19, 'sine', false, 24);
        break;
      case 'elephant':
        this.tone(capture ? 31 : 40, delay, capture ? 0.6 : 0.25, 0.2, 'sine', false, 22);
        this.impact(delay, capture ? 0.55 : 0.15, 500, capture ? 0.45 : 0.15);
        break;
      case 'advisor':
        [79, 86, 91].forEach((n, i) => this.tone(n, delay + i * 0.06, capture ? 0.3 : 0.16, 0.07, 'sine'));
        if (capture) this.swish(delay + 0.07, 0.22);
        break;
      case 'soldier':
        this.tone(67, delay, 0.12, 0.12, 'triangle', false, 48);
        this.swish(delay, 0.1);
        if (capture) {
          this.impact(delay, 0.25, 2300, 0.3);
          this.tone(48, delay, 0.2, 0.12);
        }
        break;
      case 'general':
        [48, 55, 60, 67].forEach((n, i) =>
          this.tone(n, delay + i * 0.05, capture ? 0.7 : 0.3, 0.075, 'triangle'),
        );
        if (capture) {
          this.impact(delay, 0.6, 1200, 0.3);
          this.tone(31, delay, 0.6, 0.18);
        }
        break;
    }
  }
  effect(effect: SoundEffect, delay = 0) {
    const p = useAudio.getState().preferences;
    if (!this.unlocked || p.muted || !p.effectsEnabled || p.effectsVolume === 0 || document.hidden) return;
    if (effect.startsWith('x-')) {
      this.xiangqiSound(effect, delay);
      return;
    }
    const chord = (notes: number[], step = 0.07, duration = 0.2, amplitude = 0.12) =>
      notes.forEach((n, i) => this.tone(n, delay + i * step, duration, amplitude));
    switch (effect) {
      case 'click':
        this.tone(83, delay, 0.055, 0.12, 'sine', false, 76);
        break;
      case 'hover':
        if (performance.now() - this.hoverTime < 80) return;
        this.hoverTime = performance.now();
        this.tone(88, delay, 0.075, 0.065);
        break;
      case 'deal':
        for (let i = 0; i < 7; i++) this.swish(delay + i * 0.065, 0.085);
        break;
      case 'draw':
        this.swish(delay);
        this.tone(65, delay + 0.03, 0.1, 0.07, 'triangle', false, 72);
        break;
      case 'play':
        this.swish(delay, 0.07);
        this.tone(52, delay, 0.1, 0.2, 'triangle');
        break;
      case 'stone':
        this.tone(48, delay, 0.09, 0.24, 'triangle', false, 34);
        this.tone(86, delay, 0.035, 0.08, 'sine');
        break;
      case 'skip':
        chord([79, 67, 55], 0.05, 0.15);
        break;
      case 'reverse':
        this.tone(60, delay, 0.16, 0.16, 'triangle', false, 84);
        this.tone(84, delay + 0.16, 0.18, 0.14, 'triangle', false, 60);
        break;
      case 'draw2':
        chord([55, 62, 67], 0.09, 0.24);
        break;
      case 'wild':
        chord([72, 76, 79, 84], 0.07, 0.32);
        break;
      case 'wild4':
        chord([48, 55, 60, 67, 72, 79], 0.065, 0.3, 0.18);
        break;
      case 'tick':
        if (p.countdownEnabled) this.tone(77, delay, 0.035, 0.065);
        break;
      case 'urgent':
        if (p.countdownEnabled) {
          this.tone(89, delay, 0.075, 0.14);
          this.tone(89, delay + 0.11, 0.06, 0.1);
        }
        break;
      case 'turn':
        chord([72, 79], 0.1, 0.28, 0.09);
        break;
      case 'win':
        chord([60, 64, 67, 72, 76, 79, 84], 0.1, 0.5);
        break;
      case 'lose':
        chord([67, 64, 60], 0.15, 0.4, 0.08);
        break;
      case 'penalty':
        chord([60, 56, 52], 0.09, 0.2);
        break;
      case 'uno':
        this.sayUno(delay);
        break;
    }
  }

  private loadVoice() {
    if (this.voice || this.voiceLoading || !this.context) return;
    this.voiceLoading = true;
    void fetch('/audio/uno.wav')
      .then((response) => {
        if (!response.ok) throw new Error('voice');
        return response.arrayBuffer();
      })
      .then((buffer) => this.context!.decodeAudioData(buffer))
      .then((buffer) => {
        this.voice = buffer;
      })
      .catch(() => {})
      .finally(() => {
        this.voiceLoading = false;
      });
  }

  private sayUno(delay: number) {
    if (performance.now() - this.voiceTime < 700) return;
    this.voiceTime = performance.now();
    this.ducked = true;
    this.configure();
    clearTimeout(this.duckTimer);
    this.duckTimer = setTimeout(
      () => {
        this.ducked = false;
        this.configure();
      },
      1400 + delay * 1000,
    );
    if (this.voice && this.context && this.effectsBus) {
      const source = this.context.createBufferSource();
      source.buffer = this.voice;
      source.connect(this.effectsBus);
      this.register(source, [], false);
      source.start(this.context.currentTime + delay);
    } else {
      this.loadVoice();
      if ('speechSynthesis' in window) {
        const voice = new SpeechSynthesisUtterance('Uno!');
        voice.lang = 'en-US';
        voice.rate = 1.15;
        voice.volume = useAudio.getState().preferences.effectsVolume;
        speechSynthesis.speak(voice);
      }
      this.tone(79, delay, 0.25, 0.13);
    }
  }

  private ensureMusic() {
    const p = useAudio.getState().preferences;
    const scene = this.previewScene ?? this.scene;
    const id = scene === 'lobby' ? p.lobbyTrack : p.gameTrack;
    if (this.trackId === id) return;
    this.stopMusic();
    this.trackId = id;
    const generation = this.generation;
    if (id.startsWith('custom:')) {
      void getLocalTrack(id)
        .then(async (track) => {
          if (generation !== this.generation || !this.context || !this.musicBus) return;
          if (!track) throw new Error('导入的音乐已不可用，请重新导入或选择默认曲目。');
          if (!this.media) {
            this.media = new Audio();
            this.media.loop = true;
            this.mediaSource = this.context.createMediaElementSource(this.media);
            this.mediaSource.connect(this.musicBus);
          }
          this.mediaUrl = URL.createObjectURL(track.blob);
          this.media.src = this.mediaUrl;
          await this.media.play();
          if (generation === this.generation) useAudio.getState().setStatus('ready');
        })
        .catch(() => {
          if (generation !== this.generation) return;
          this.stopMusic();
          this.trackId = id;
          useAudio
            .getState()
            .setStatus('error', '这首音乐暂时无法播放，已使用默认音乐。请重新导入或换一首。');
          this.startSynth(scene === 'lobby' ? 'lobby-glow' : 'game-pulse');
        });
    } else {
      this.startSynth(id);
      useAudio.getState().setStatus('ready');
    }
  }

  private startSynth(id: string) {
    const ctx = this.context;
    if (!ctx) return;
    const track = musicTracks.find((t) => t.id === id) ?? musicTracks[0];
    const beat = 60 / track.bpm / 2;
    let step = 0,
      next = ctx.currentTime + 0.04;
    const schedule = () => {
      if (document.hidden || !this.unlocked) return;
      // Skip elapsed beats after a stalled tab instead of scheduling a burst of notes.
      if (next < ctx.currentTime - 0.1) next = ctx.currentTime + 0.04;
      while (next < ctx.currentTime + 0.2) {
        const offset = Math.max(0, next - ctx.currentTime);
        const note = track.notes[step % track.notes.length];
        this.tone(note, offset, beat * 1.8, track.scene === 'game' ? 0.07 : 0.065, 'triangle', true);
        if (step % 4 === 0) this.tone(track.notes[step % 16] - 24, offset, beat * 3.5, 0.13, 'sine', true);
        if (step % 8 === 0)
          for (const interval of [0, 4, 7])
            this.tone(track.notes[step % 16] - 12 + interval, offset, beat * 7, 0.025, 'sine', true);
        if (track.scene === 'game' && step % 2 === 0) this.tone(38, offset, 0.1, 0.1, 'sine', true, 23);
        step++;
        next += beat;
      }
    };
    schedule();
    this.musicTimer = setInterval(schedule, 100);
  }

  private stopSources(sources: Set<AudioScheduledSourceNode>) {
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
    }
    sources.clear();
  }
  private stopEffects() {
    this.stopSources(this.sources);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
  private stopMusic() {
    this.generation++;
    clearInterval(this.musicTimer);
    this.stopSources(this.musicSources);
    this.trackId = null;
    if (this.media) {
      this.media.pause();
      this.media.removeAttribute('src');
      this.media.load();
    }
    if (this.mediaUrl) {
      URL.revokeObjectURL(this.mediaUrl);
      this.mediaUrl = null;
    }
  }
  stop() {
    clearTimeout(this.previewTimer);
    clearTimeout(this.duckTimer);
    this.previewScene = null;
    this.ducked = false;
    this.stopMusic();
    this.stopEffects();
  }
}

export const audioEngine = new AudioEngine();
