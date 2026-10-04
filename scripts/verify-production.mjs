import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const port = 3098;
const server = spawn(process.execPath, ['dist/server/server/src/index.js'], {
  env: {
    ...process.env,
    PORT: String(port),
    DEMO_MODE: 'true',
    REDIS_URL: '',
    CLIENT_ORIGIN: `http://localhost:${port}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => process.stdout.write(d));
server.stderr.on('data', (d) => process.stderr.write(d));
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`http://localhost:${port}/api/health`);
      break;
    } catch {
      if (server.exitCode !== null) throw new Error('production server exited');
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`http://localhost:${port}/lobby`);
  await page.getByText('已连接 · 实时同步').waitFor();
  assert.equal(await page.locator('.game-tile').count(), 5);
  await page.goto(`http://localhost:${port}/profile`);
  await page.getByRole('heading', { name: '我的游乐场', exact: true }).waitFor();
  await page.goto(`http://localhost:${port}/settings`);
  await page.getByRole('heading', { name: '按你的方式，玩得尽兴' }).waitFor();
  const voiceResponse = page.waitForResponse((response) => response.url().endsWith('/audio/uno.wav'));
  await page.locator('.audio-status').getByRole('button', { name: '开启声音' }).click();
  await page.locator('.audio-status[data-audio-status="ready"]').waitFor();
  const response = await voiceResponse;
  assert.equal(response.status(), 200);
  const wave = await response.body();
  assert.equal(wave.subarray(0, 4).toString(), 'RIFF');
  assert.equal(wave.subarray(8, 12).toString(), 'WAVE');
  await page.getByRole('button', { name: '试听 UNO 语音' }).click();
  await page.goto(`http://localhost:${port}/lobby`);
  await page.locator('.heading-buttons').getByRole('button', { name: '创建房间' }).click();
  await page.getByLabel('选择游戏').selectOption('gomoku');
  await page.getByLabel('AI 难度').selectOption('hard');
  await page.getByRole('dialog').getByRole('button', { name: '创建房间', exact: true }).click();
  await page.getByRole('button', { name: '添加 AI', exact: true }).click();
  await page.getByRole('button', { name: '我准备好了' }).click();
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.locator('.gomoku-board').waitFor();
  await page.getByRole('button', { name: '落子 H8', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.gomoku-stone').length === 2);
  await page.reload();
  await page.locator('.gomoku-board').waitFor();
  assert.equal(await page.locator('.gomoku-stone').count(), 2);
  await page.getByRole('button', { name: '认输', exact: true }).click();
  await page.getByRole('button', { name: '确认认输', exact: true }).click();
  await page.getByRole('button', { name: '再来一局', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    'PASS: compiled Express serves SPA, assets, deep routes, same-origin Socket.IO and local UNO WAV; Gomoku lazy module, compiled hard-AI worker, placement, refresh and resign; zero browser errors.',
  );
} finally {
  await browser?.close();
  server.kill();
}
