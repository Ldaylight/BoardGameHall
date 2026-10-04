import type { PieceKind } from '../../../shared/games/xiangqi/types';
import { xiangqiTimelines } from './xiangqi-timeline';
type Synth = {
  context: AudioContext;
  bus: GainNode;
  register: (source: AudioScheduledSourceNode, nodes: AudioNode[]) => void;
  tone: (
    midi: number,
    delay: number,
    duration: number,
    amplitude: number,
    wave?: OscillatorType,
    music?: boolean,
    endMidi?: number,
  ) => void;
  impact: (delay: number, duration: number, cutoff: number, amplitude: number) => void;
  swish: (delay: number, duration?: number) => void;
};
/** Harmonics, pitch contours and breath resonances create local animal/engine effects without downloads. */
export function playXiangqiSound(effect: string, delay: number, s: Synth) {
  const { tone, impact, swish } = s;
  function voice(
    points: [number, number][],
    duration: number,
    formants: number[],
    amplitude: number,
    roughness = 2,
    vibrato = 7,
  ) {
    const ctx = s.context,
      t = ctx.currentTime + delay,
      osc = ctx.createOscillator(),
      vib = ctx.createOscillator(),
      depth = ctx.createGain(),
      shape = ctx.createWaveShaper(),
      gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(points[0][1], t);
    for (const [at, hz] of points.slice(1)) osc.frequency.exponentialRampToValueAtTime(hz, t + at);
    vib.frequency.value = vibrato;
    depth.gain.value = points[0][1] * 0.035;
    vib.connect(depth).connect(osc.frequency);
    const curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) curve[i] = Math.tanh((i / 255.5 - 1) * roughness);
    shape.curve = curve;
    shape.oversample = '2x';
    osc.connect(shape);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(amplitude, t + 0.055);
    gain.gain.setValueAtTime(amplitude * 0.8, t + duration * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    const filters = formants.map((f, i) => {
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = i === 0 ? 0.8 : 1.7;
      filter.frequency.setValueAtTime(f, t);
      filter.frequency.linearRampToValueAtTime(f * 0.65, t + duration);
      shape.connect(filter).connect(gain);
      return filter;
    });
    gain.connect(s.bus);
    s.register(osc, [shape, ...filters, gain]);
    s.register(vib, [depth]);
    osc.start(t);
    vib.start(t);
    osc.stop(t + duration + 0.01);
    vib.stop(t + duration + 0.01);
  }
  const steps = (heavy = false) =>
    [0, 0.16, 0.32].forEach((at, i) => {
      impact(delay + at, heavy ? 0.23 : 0.08, heavy ? 340 : 1000, heavy ? 0.27 : 0.15);
      tone(
        heavy ? 29 : 42 + (i % 2),
        delay + at,
        heavy ? 0.28 : 0.1,
        heavy ? 0.16 : 0.08,
        'sine',
        false,
        heavy ? 20 : 33,
      );
    });
  const metal = (at: number, force = 1) => {
    swish(at, 0.12);
    [81, 87, 94, 101].forEach((n, i) =>
      tone(n, at + i * 0.009, 0.32, 0.06 * force, 'triangle', false, n - 2),
    );
    impact(at, 0.13, 6500, 0.13 * force);
  };
  if (effect === 'x-check') {
    [69, 73, 76].forEach((n, i) => tone(n, delay + i * 0.1, 0.25, 0.07, 'triangle'));
    return;
  }
  const kind = effect.split('-')[1] as PieceKind,
    phase = effect.split('-')[2],
    timing = xiangqiTimelines[kind];
  if (phase === 'move') {
    switch (kind) {
      case 'soldier':
      case 'advisor':
        steps();
        break;
      case 'horse':
        [0, 0.08, 0.23, 0.31].forEach((at, i) => {
          impact(delay + at, 0.055, 800 + (i % 2) * 1000, 0.13);
          tone(44 + (i % 2) * 4, delay + at, 0.06, 0.055, 'triangle');
        });
        break;
      case 'elephant':
        steps(true);
        break;
      case 'general':
        [0, 0.12, 0.28].forEach((at) => metal(delay + at, 0.55));
        tone(43, delay, 0.3, 0.045);
        break;
      case 'cannon':
        [0, 0.13, 0.26, 0.39].forEach((at, i) => {
          impact(delay + at, 0.075, 650, 0.09);
          tone(52 + (i % 2) * 3, delay + at, 0.1, 0.055, 'triangle', false, 43);
        });
        break;
      case 'chariot':
        impact(delay, 0.12, 700, 0.1);
        tone(40, delay, 0.25, 0.08, 'triangle', false, 48);
        break;
    }
    return;
  }
  if (phase === 'capture') {
    switch (kind) {
      case 'chariot':
        voice(
          [
            [0, 48],
            [0.2, 72],
            [0.48, 120],
            [timing.impact, 210],
          ],
          timing.impact + 0.15,
          [180, 680, 1800],
          0.14,
          5,
          28,
        );
        impact(delay, 0.2, 600, 0.14);
        break;
      case 'soldier':
      case 'advisor':
        swish(delay + timing.impact - 0.18, 0.2);
        break;
      case 'horse':
        voice(
          [
            [0, 280],
            [0.2, 640],
            [0.45, 790],
            [0.7, 440],
            [1.1, 300],
          ],
          1.3,
          [950, 2200, 3400],
          0.13,
          2.8,
          11,
        );
        break;
      case 'elephant':
        voice(
          [
            [0, 105],
            [0.2, 260],
            [0.5, 390],
            [1.0, 250],
            [1.5, 120],
          ],
          1.7,
          [380, 950, 1800],
          0.17,
          4,
          5,
        );
        break;
      case 'general':
        voice(
          [
            [0, 95],
            [0.35, 195],
            [0.7, 360],
            [1.15, 530],
            [1.55, 150],
          ],
          1.8,
          [440, 1100, 2700],
          0.16,
          5,
          13,
        );
        tone(28, delay, 1.4, 0.1, 'sine', false, 40);
        break;
      case 'cannon':
        [48, 55, 67].forEach((n, i) =>
          tone(n, delay + i * 0.15, timing.impact - i * 0.15, 0.055, 'sawtooth', false, n + 24),
        );
        voice(
          [
            [0, 65],
            [0.4, 130],
            [0.85, 320],
            [1.2, 740],
          ],
          1.3,
          [600, 1800],
          0.09,
          2,
          18,
        );
        break;
    }
    return;
  }
  if (phase === 'impact') {
    switch (kind) {
      case 'chariot':
        impact(delay, 0.6, 3200, 0.45);
        tone(34, delay, 0.5, 0.18, 'sine', false, 20);
        metal(delay, 0.8);
        break;
      case 'soldier':
      case 'advisor':
        metal(delay, 1.7);
        impact(delay, 0.18, 1800, 0.2);
        break;
      case 'horse':
        impact(delay, 0.45, 650, 0.38);
        tone(30, delay, 0.4, 0.2, 'sine', false, 17);
        break;
      case 'elephant':
        [0, 0.035, 0.085, 0.15, 0.24, 0.34].forEach((at, i) => {
          impact(delay + at, 0.18, 7800 - i * 800, 0.17);
          tone(100 + i * 2, delay + at, 0.13, 0.06, 'triangle', false, 89);
        });
        break;
      case 'general':
        impact(delay, 0.4, 1200, 0.35);
        metal(delay, 0.9);
        [40, 47, 52].forEach((n) => tone(n, delay, 0.6, 0.09, 'triangle'));
        break;
      case 'cannon':
        impact(delay, 0.85, 2700, 0.6);
        tone(34, delay, 0.85, 0.28, 'sine', false, 15);
        [0.07, 0.16, 0.28].forEach((at) => impact(delay + at, 0.25, 4400, 0.17));
        break;
    }
  }
}
