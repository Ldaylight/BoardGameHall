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
  assert.equal(await page.locator('.game-tile').count(), 8);
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
  await page.locator('.nav-room-actions').getByRole('button', { name: '创建房间' }).click();
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
  await page.goto(`http://localhost:${port}/lobby`);
  await page.locator('.nav-room-actions').getByRole('button', { name: '创建房间' }).click();
  await page.getByLabel('选择游戏').selectOption('xiangqi');
  await page.getByLabel('AI 难度').selectOption('hard');
  await page.getByRole('dialog').getByRole('button', { name: '创建房间', exact: true }).click();
  await page.getByRole('button', { name: '添加 AI', exact: true }).click();
  await page.getByRole('button', { name: '我准备好了' }).click();
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.locator('.xiangqi-board').waitFor();
  await page.locator('.xiangqi-point[data-x="1"][data-y="7"]').click();
  await page.locator('.xiangqi-point[data-x="1"][data-y="0"]').click();
  await page.locator('.xiangqi-fx[data-effect="cannon"]').waitFor();
  await page.waitForFunction(() => document.querySelector('.recent-moves>strong')?.textContent === '02');
  await page.reload();
  await page.locator('.xiangqi-board').waitFor();
  assert.equal(await page.locator('.xiangqi-fx').count(), 0);
  await page.getByRole('button', { name: '认输', exact: true }).click();
  await page.getByRole('button', { name: '确认认输', exact: true }).click();
  await page.getByRole('button', { name: '再来一局', exact: true }).waitFor();
  await page.goto(`http://localhost:${port}/xiangqi/endgames`);
  assert.equal(await page.locator('.endgame-card').count(), 5);
  await page
    .locator('.endgame-card')
    .filter({ has: page.getByRole('heading', { name: '重炮杀' }) })
    .getByRole('button', { name: '挑战残局' })
    .click();
  await page.locator('.xiangqi-board').waitFor();
  await page.locator('.xiangqi-point[data-x="3"][data-y="2"]').click();
  await page.locator('.xiangqi-point[data-x="4"][data-y="2"]').click();
  await page.getByRole('button', { name: '重试残局' }).waitFor();
  assert.match(await page.locator('.xiangqi-status').innerText(), /残局已解开/);
  const laugh = await page.request.get(`http://localhost:${port}/audio/joker-laugh.wav`);
  assert.equal(laugh.status(), 200);
  assert.equal((await laugh.body()).subarray(0, 4).toString(), 'RIFF');
  await page.goto(`http://localhost:${port}/lobby`);
  await page.locator('.nav-room-actions').getByRole('button', { name: '创建房间' }).click();
  await page.getByLabel('选择游戏').selectOption('doudizhu');
  await page.getByLabel('AI 难度').selectOption('hard');
  await page.getByRole('dialog').getByRole('button', { name: '创建房间', exact: true }).click();
  await page.getByRole('button', { name: '添加 AI', exact: true }).first().click();
  await page.getByRole('button', { name: '添加 AI', exact: true }).first().click();
  await page.getByRole('button', { name: '我准备好了' }).click();
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await page.getByTestId('doudizhu-table').waitFor();
  const { io } = await import('socket.io-client');
  const { doudizhu } = await import('../dist/server/shared/games/doudizhu/index.js');
  const token = await page.evaluate(() => localStorage.getItem('playroom-token')),
    socket = io(`http://localhost:${port}`, { auth: { token }, transports: ['websocket'] });
  const request = (event, payload) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`production ${event} timeout`)), 10000);
      socket.emit(event, payload, (result) => {
        clearTimeout(timer);
        result.ok ? resolve(result.data) : reject(new Error(result.error));
      });
    });
  try {
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    const roomId = page.url().split('/').at(-1);
    let actions = 0;
    while (actions++ < 8) {
      const r = await request('room:sync', { roomId });
      const game = r.game;
      if (game.phase === 'finished') break;
      if (game.currentPlayerId === r.hostId)
        await request('game:action', {
          roomId,
          revision: r.revision,
          action: doudizhu.aiMove(game, r.hostId, 'medium'),
        });
      else {
        const start = Date.now();
        let changed = false;
        while (Date.now() - start < 10000) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          if ((await request('room:sync', { roomId })).game.turnNumber > game.turnNumber) {
            changed = true;
            break;
          }
        }
        assert.equal(changed, true);
      }
    }
    assert.equal((await request('room:sync', { roomId })).game.phase, 'playing');
    await page.getByTestId('performance-bar').waitFor();
    await page.waitForFunction(() =>
      /^\d+$/.test(document.querySelector('[data-testid="performance-rtt"]')?.textContent ?? ''),
    );
    await request('room:leave', { roomId });
  } finally {
    socket.disconnect();
  }
  await page.goto(`http://localhost:${port}/lobby`);
  await page.locator('.nav-room-actions').getByRole('button', { name: '创建房间' }).click();
  await page.getByLabel('选择游戏').selectOption('exploding-kittens');
  await page.getByLabel('座位数量').selectOption('2');
  await page.getByRole('dialog').getByRole('button', { name: '创建房间', exact: true }).click();
  await page.getByRole('button', { name: '添加 AI', exact: true }).click();
  await page.getByRole('button', { name: '我准备好了' }).click();
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await page.getByTestId('kittens-table').waitFor();
  assert.equal(await page.locator('.kittens-hand-slot').count(), 8);
  const { kittens } = await import('../dist/server/shared/games/exploding-kittens/index.js');
  const ks = io(`http://localhost:${port}`, { auth: { token }, transports: ['websocket'] });
  const kRequest = (event, payload) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`production kitten ${event} timeout`)), 10000);
      ks.emit(event, payload, (result) => {
        clearTimeout(timer);
        result.ok ? resolve(result.data) : reject(new Error(result.error));
      });
    });
  try {
    await new Promise((resolve, reject) => {
      ks.once('connect', resolve);
      ks.once('connect_error', reject);
    });
    const roomId = page.url().split('/').at(-1);
    for (let i = 0; i < 8; i++) {
      const r = await kRequest('room:sync', { roomId }),
        g = r.game;
      if (g.phase === 'finished') break;
      const legal = kittens.getLegalActions(g, r.hostId);
      const allow = legal.find((a) => a.type === 'ek:allow');
      if (g.phase === 'reaction' ? !!allow : legal.length > 0) {
        const action = g.phase === 'reaction' ? allow : kittens.aiMove(g, r.hostId, 'medium');
        try {
          await kRequest('game:action', { roomId, revision: r.revision, action });
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes('状态已更新')) throw error;
          i--;
        }
      } else {
        const start = Date.now();
        while (
          Date.now() - start < 10000 &&
          (await kRequest('room:sync', { roomId })).revision === r.revision
        )
          await new Promise((resolve) => setTimeout(resolve, 200));
        assert.ok((await kRequest('room:sync', { roomId })).revision > r.revision);
      }
    }
    const r = await kRequest('room:sync', { roomId });
    assert.equal('hands' in r.game || 'deck' in r.game, false);
    assert.ok(r.game.events.length > 0);
    await page.reload();
    await page.getByTestId('kittens-table').waitFor();
    for (const file of ['card-shuffle', 'forceField_000', 'lowFrequency_explosion_000']) {
      const sample = await page.request.get(`http://localhost:${port}/audio/kenney/${file}.ogg`);
      assert.equal(sample.status(), 200);
      assert.equal((await sample.body()).subarray(0, 4).toString(), 'OggS');
    }
  } finally {
    ks.disconnect();
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: compiled Express SPA, deep routes, Socket.IO, UNO/clown WAV, CC0 OGG and RTT monitor; Gomoku, Xiangqi, Doudizhu and Kittens lazy tables/AI; capture effects, reconnect, resign, endgame checkmate; zero browser errors.',
  );
} finally {
  await browser?.close();
  server.kill();
}
