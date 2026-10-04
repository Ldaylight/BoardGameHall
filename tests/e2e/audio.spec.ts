import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

declare global {
  interface Window {
    audioProbe: { analyser: AnalyserNode | null; oscillators: number; voices: number; mediaPlays: number };
  }
}

async function probe(page: Page) {
  await page.addInitScript(() => {
    window.audioProbe = { analyser: null, oscillators: 0, voices: 0, mediaPlays: 0 };
    const createGain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      const gain = createGain.call(this),
        connect = gain.connect.bind(gain),
        context = this;
      gain.connect = ((destination: AudioNode | AudioParam, output?: number, input?: number) => {
        if (destination instanceof AudioDestinationNode) {
          const analyser = context.createAnalyser();
          analyser.fftSize = 2048;
          connect(analyser);
          window.audioProbe.analyser = analyser;
        }
        return destination instanceof AudioParam
          ? connect(destination, output)
          : connect(destination, output, input);
      }) as GainNode['connect'];
      return gain;
    };
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const oscillator = createOscillator.call(this),
        start = oscillator.start.bind(oscillator);
      oscillator.start = (when) => {
        window.audioProbe.oscillators++;
        start(when);
      };
      return oscillator;
    };
    const createBuffer = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = createBuffer.call(this),
        start = source.start.bind(source);
      source.start = (when, offset, duration) => {
        window.audioProbe.voices++;
        start(when, offset, duration);
      };
      return source;
    };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.audioProbe.mediaPlays++;
      return play.call(this);
    };
  });
}

async function level(page: Page) {
  return page.evaluate(() => {
    const analyser = window.audioProbe.analyser;
    if (!analyser) return 0;
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
  });
}

test('audio produces a real signal, mutes, persists controls and imports local music across refresh', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await probe(page);
  await page.goto('/settings');
  await expect(page.locator('.audio-status')).toHaveAttribute('data-audio-status', 'locked');
  await page.locator('.audio-status').getByRole('button', { name: '开启声音' }).click();
  await expect(page.locator('.audio-status')).toHaveAttribute('data-audio-status', 'ready');
  await expect
    .poll(() => level(page), { intervals: [50, 70, 90, 130, 170, 230], timeout: 10000 })
    .toBeGreaterThan(0.001);
  await page.getByLabel('大厅音乐', { exact: true }).selectOption('lobby-rain');
  await page.getByLabel('音乐音量', { exact: true }).fill('22');
  await page.getByLabel('音效音量', { exact: true }).fill('41');
  await page.getByRole('switch', { name: '每秒倒计时音效' }).click();
  await page.getByRole('button', { name: '静音所有声音', exact: true }).click();
  await expect.poll(() => level(page)).toBeLessThan(0.0001);
  await page.getByRole('button', { name: '取消静音', exact: true }).click();
  await expect
    .poll(() => level(page), { intervals: [50, 70, 90, 130, 170, 230], timeout: 10000 })
    .toBeGreaterThan(0.001);
  await page.getByRole('button', { name: '试听 UNO 语音' }).click();
  await expect.poll(() => page.evaluate(() => window.audioProbe.voices)).toBeGreaterThan(0);
  await page
    .getByLabel('大厅音乐文件', { exact: true })
    .setInputFiles({ name: 'invalid.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('not audio') });
  await expect(page.getByRole('alert')).toContainText('此文件无法播放');
  const clip = readFileSync('client/public/audio/uno.wav');
  await page
    .getByLabel('大厅音乐文件', { exact: true })
    .setInputFiles({ name: 'bleach.wav', mimeType: 'audio/wav', buffer: clip });
  await expect(page.locator('.audio-notice')).toContainText('已导入「bleach」');
  await expect.poll(() => page.evaluate(() => window.audioProbe.mediaPlays)).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByLabel('音乐音量', { exact: true })).toHaveValue('22');
  await expect(page.getByLabel('音效音量', { exact: true })).toHaveValue('41');
  await expect(page.getByRole('switch', { name: '每秒倒计时音效' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByLabel('大厅音乐', { exact: true })).toContainText('bleach');
  await page.locator('.audio-status').getByRole('button', { name: '开启声音' }).click();
  await expect.poll(() => page.evaluate(() => window.audioProbe.mediaPlays)).toBeGreaterThan(0);
  await expect
    .poll(() => level(page), { intervals: [50, 70, 90, 130, 170, 230], timeout: 10000 })
    .toBeGreaterThan(0.001);
  await page.getByRole('button', { name: '删除音乐 bleach' }).click();
  await expect(page.getByLabel('大厅音乐', { exact: true })).toHaveValue('lobby-glow');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: '.artifacts/audio-settings-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: '.artifacts/audio-settings-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('game switches music, deals audibly, hovers cards, ticks each second and returns to lobby music', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await probe(page);
  await page.goto('/settings');
  await page.locator('.audio-status').getByRole('button', { name: '开启声音' }).click();
  const clip = readFileSync('client/public/audio/uno.wav');
  await page
    .getByLabel('对局音乐文件', { exact: true })
    .setInputFiles({ name: 'Once Upon A Time.wav', mimeType: 'audio/wav', buffer: clip });
  await expect(page.locator('.audio-notice')).toContainText('已导入');
  expect(await page.evaluate(() => window.audioProbe.mediaPlays)).toBe(0);
  await page.locator('.brand').click();
  await expect(page.getByText('已连接 · 实时同步')).toBeVisible();
  await page.locator('.heading-buttons').getByRole('button', { name: '创建房间' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '创建房间', exact: true }).click();
  await page.getByRole('button', { name: '添加 AI' }).first().click();
  await page.getByRole('button', { name: '我准备好了' }).click();
  const buffers = await page.evaluate(() => window.audioProbe.voices);
  await page.getByRole('button', { name: '开始游戏' }).click();
  await expect(page).toHaveURL(/\/game\//);
  await expect.poll(() => page.evaluate(() => window.audioProbe.mediaPlays)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.audioProbe.voices)).toBeGreaterThanOrEqual(buffers + 7);
  await expect
    .poll(() => level(page), { intervals: [50, 70, 90, 130, 170, 230], timeout: 10000 })
    .toBeGreaterThan(0.001);
  const card = page.locator('.hand-slot button:not([disabled])').first();
  if (await card.count()) {
    const count = await page.evaluate(() => window.audioProbe.oscillators);
    await card.hover();
    await expect.poll(() => page.evaluate(() => window.audioProbe.oscillators)).toBeGreaterThan(count);
  }
  const before = await page.evaluate(() => window.audioProbe.oscillators);
  await expect
    .poll(() => page.evaluate(() => window.audioProbe.oscillators), { timeout: 4000 })
    .toBeGreaterThanOrEqual(before + 2);
  await page.getByRole('link', { name: '大厅', exact: true }).click();
  const mediaPlays = await page.evaluate(() => window.audioProbe.mediaPlays);
  await expect
    .poll(() => level(page), { intervals: [50, 70, 90, 130, 170, 230], timeout: 10000 })
    .toBeGreaterThan(0.001);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.audioProbe.mediaPlays)).toBe(mediaPlays);
  expect(errors).toEqual([]);
});
