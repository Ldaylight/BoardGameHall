import { test, expect, type Page } from '@playwright/test';
import type { PieceKind, Side } from '../../shared/games/xiangqi/types';
import { xiangqiTimelines } from '../../client/src/lib/xiangqi-timeline';

declare global {
  interface Window {
    xiangqiAudioProbe: {
      analyser: AnalyserNode | null;
      starts: number[];
      epoch: number | null;
      samples: { time: number; level: number; targetHidden: boolean }[];
    };
  }
}
const fixtureUrl = `/@fs/${process.cwd().replace(/\\/g, '/')}/tests/fixtures/xiangqi-effects.tsx`;
async function mount(page: Page, kind: PieceKind, side: Side, reduced = false, muted = false) {
  await page.evaluate(
    async ({ url, kind, side, reduced, muted }) => {
      const fixture = await import(/* @vite-ignore */ url);
      fixture.mountEffects(kind, side, reduced, muted);
    },
    { url: fixtureUrl, kind, side, reduced, muted },
  );
}
async function level(page: Page) {
  return page.evaluate(() => {
    const a = window.xiangqiAudioProbe.analyser;
    if (!a) return 0;
    const samples = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  });
}
test('all red/black capture motifs, synchronized audible impacts, movement sounds, mute and reduced motion', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.addInitScript(() => {
    window.xiangqiAudioProbe = { analyser: null, starts: [], epoch: null, samples: [] };
    const createGain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      const gain = createGain.call(this),
        connect = gain.connect.bind(gain),
        context = this;
      gain.connect = ((destination: AudioNode | AudioParam, output?: number, input?: number) => {
        if (destination instanceof AudioDestinationNode) {
          const a = context.createAnalyser();
          a.fftSize = 2048;
          connect(a);
          window.xiangqiAudioProbe.analyser = a;
          const samples = new Float32Array(a.fftSize);
          setInterval(() => {
            const probe = window.xiangqiAudioProbe;
            if (probe.epoch === null) return;
            a.getFloatTimeDomainData(samples);
            const target = document.querySelector('[data-motif="capture-target"]');
            probe.samples.push({
              time: context.currentTime - probe.epoch,
              level: Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length),
              targetHidden: !!target && Number(getComputedStyle(target).opacity) < 0.01,
            });
            if (probe.samples.length > 800) probe.samples.shift();
          }, 15);
        }
        return destination instanceof AudioParam
          ? connect(destination, output)
          : connect(destination, output, input);
      }) as GainNode['connect'];
      return gain;
    };
    function track<T extends AudioScheduledSourceNode>(source: T, context: AudioContext): T {
      const start = source.start.bind(source);
      source.start = (when) => {
        if (window.xiangqiAudioProbe.epoch === null) window.xiangqiAudioProbe.epoch = context.currentTime;
        window.xiangqiAudioProbe.starts.push((when ?? context.currentTime) - context.currentTime);
        start(when);
      };
      return source;
    }
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      return track(createOscillator.call(this), this);
    };
    const createBufferSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      return track(createBufferSource.call(this), this);
    };
  });
  await page.goto('/lobby');
  await expect(page.getByText('已连接 · 实时同步')).toBeVisible();
  await page.setViewportSize({ width: 1200, height: 900 });
  const motifs: Record<PieceKind, string[]> = {
    chariot: ['motor-trail', 'piece-shatter'],
    soldier: ['sword', 'piece-shatter'],
    advisor: ['sword', 'piece-shatter'],
    horse: ['hoof', 'piece-shatter'],
    elephant: ['trunk', 'glass-shatter'],
    general: ['dragon', 'dragon-banner', 'piece-shatter'],
    cannon: ['ion-charge', 'ion-projectile', 'piece-shatter'],
  };
  for (const side of ['red', 'black'] as const) {
    for (const kind of Object.keys(motifs) as PieceKind[]) {
      await mount(page, kind, side);
      await page.evaluate(async () => {
        await document.fonts.ready;
        window.xiangqiAudioProbe.starts = [];
        window.xiangqiAudioProbe.samples = [];
        window.xiangqiAudioProbe.epoch = null;
      });
      await page.getByRole('button', { name: '演示吃子' }).click();
      const fx = page.locator('.xiangqi-fx');
      await expect(fx).toHaveAttribute('data-effect', kind);
      await expect(fx).toHaveAttribute('data-impact', String(xiangqiTimelines[kind].impact));
      for (const motif of motifs[kind])
        await expect(fx.locator(`[data-motif="${motif}"]`).first()).toBeAttached();
      await expect(fx.locator('[data-piece-fragment]')).toHaveCount(
        kind === 'elephant' ? 18 : kind === 'chariot' ? 10 : 14,
      );
      expect(await page.evaluate(() => window.xiangqiAudioProbe.starts.some((delay) => delay > 0.6))).toBe(
        true,
      );
      const starts = await page.evaluate(() => window.xiangqiAudioProbe.starts);
      expect(starts.some((delay) => Math.abs(delay - xiangqiTimelines[kind].impact) < 0.04)).toBe(true);
      if (side === 'red') {
        await page.waitForTimeout(500);
        await page.screenshot({ path: `.artifacts/xiangqi-${kind}-anticipation.png` });
      }
      await expect
        .poll(
          () =>
            page.evaluate(
              ({ impact, kind }) =>
                window.xiangqiAudioProbe.samples.some(
                  (sample) =>
                    sample.time >= impact + 0.015 &&
                    sample.time <= impact + 0.23 &&
                    sample.level > 0.0005 &&
                    (kind === 'elephant' || sample.targetHidden),
                ),
              { impact: xiangqiTimelines[kind].impact, kind },
            ),
          { timeout: 5000, intervals: [20, 40, 50] },
        )
        .toBe(true);
      if (side === 'red') await page.screenshot({ path: `.artifacts/xiangqi-${kind}-impact.png` });
      await expect(fx).toHaveCount(0);
      await expect(page.locator('.xiangqi-piece')).toBeVisible();
    }
  }
  for (const kind of Object.keys(motifs) as PieceKind[]) {
    await mount(page, kind, 'red');
    await page.getByRole('button', { name: '演示移动' }).click();
    await expect.poll(() => level(page), { intervals: [30, 40, 50], timeout: 450 }).toBeGreaterThan(0.001);
    await expect(page.locator('.xiangqi-fx')).toHaveCount(0);
  }
  await mount(page, 'elephant', 'black', true, true);
  await page.getByRole('button', { name: '演示吃子' }).click();
  await expect(page.locator('.xiangqi-fx')).toHaveAttribute('data-reduced', 'true');
  await expect(page.locator('[data-motif="trunk"]')).toHaveCount(0);
  await page.waitForTimeout(250);
  expect(await level(page)).toBeLessThan(0.0001);
  expect(errors).toEqual([]);
});
