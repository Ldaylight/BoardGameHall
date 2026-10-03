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
  assert.deepEqual(errors, []);
  console.log(
    'PASS: compiled Express serves SPA, assets, deep routes and same-origin Socket.IO; zero browser errors.',
  );
} finally {
  await browser?.close();
  server.kill();
}
