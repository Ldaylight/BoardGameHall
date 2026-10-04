import { test, expect } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents, Result, RoomView } from '../../shared/types';
function request<T>(send: (ack: (r: Result<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket timeout')), 10000);
    send((r) => {
      clearTimeout(timer);
      r.ok ? resolve(r.data) : reject(new Error(r.error));
    });
  });
}
test('two humans play gomoku, consent to undo, chat, reconnect, win, rematch and resign on mobile', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const ca = await browser.newContext(),
    cb = await browser.newContext(),
    cs = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage(),
    spectator = await cs.newPage();
  const errors: string[] = [];
  for (const page of [a, b, spectator]) {
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
  }
  const sockets: Socket<ServerEvents, ClientEvents>[] = [];
  try {
    await a.setViewportSize({ width: 1440, height: 1000 });
    await a.goto('/lobby');
    await expect(a.getByText('已连接 · 实时同步')).toBeVisible();
    await a
      .locator('.game-tile')
      .filter({ has: a.getByRole('heading', { name: '五子棋', exact: true }) })
      .getByRole('button', { name: '开始游戏' })
      .click();
    await expect(a.getByLabel('选择游戏')).toHaveValue('gomoku');
    await expect(a.getByLabel('座位数量')).toHaveValue('2');
    await a.getByLabel('允许申请悔棋（需对手同意）').check();
    await a.getByRole('dialog').getByRole('button', { name: '创建房间', exact: true }).click();
    await expect(a.locator('.room-code')).toBeVisible();
    const code = (await a.locator('.room-code').innerText()).replace('#', '');
    const roomId = a.url().split('/').at(-1)!;
    await b.goto(`/lobby?invite=${code}`);
    await expect(b).toHaveURL(/\/room\//);
    await a.getByRole('button', { name: '我准备好了' }).click();
    await b.getByRole('button', { name: '我准备好了' }).click();
    await a.getByRole('button', { name: '开始游戏' }).click();
    await expect(a.locator('.gomoku-board')).toBeVisible();
    await expect(b.locator('.gomoku-board')).toBeVisible();
    for (const page of [a, b]) {
      const token = await page.evaluate(() => localStorage.getItem('playroom-token'));
      const socket: Socket<ServerEvents, ClientEvents> = io('http://localhost:3001', {
        auth: { token },
        transports: ['websocket'],
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
    }
    const sync = () => request<RoomView>((ack) => sockets[0].emit('room:sync', { roomId }, ack));
    await expect(a.locator('.gomoku-point')).toHaveCount(225);
    await expect(b.getByRole('button', { name: '落子 H8', exact: true })).toBeDisabled();
    await a.getByRole('button', { name: '落子 H8', exact: true }).click();
    await expect(b.getByRole('button', { name: '黑棋 H8', exact: true })).toBeVisible();
    let view = await sync();
    await expect(
      request((ack) =>
        sockets[0].emit(
          'game:action',
          { roomId, revision: view.revision, action: { type: 'place', x: 0, y: 0 } },
          ack,
        ),
      ),
    ).rejects.toThrow('轮到');
    await a.getByRole('button', { name: '申请悔棋' }).click();
    await expect(b.getByRole('status')).toContainText('对手申请悔棋');
    await b.getByRole('button', { name: '同意', exact: true }).click();
    await expect(a.locator('.gomoku-stone')).toHaveCount(0);
    await expect(a.getByRole('button', { name: '落子 H8', exact: true })).toBeEnabled();
    await a.getByRole('button', { name: '棋局聊天' }).click();
    await a.getByRole('textbox', { name: '聊天消息' }).fill('黑白之间，一起下棋');
    await a.getByRole('button', { name: '发送消息' }).click();
    await expect(a.getByText('黑白之间，一起下棋')).toBeVisible();
    await a.getByRole('button', { name: '关闭', exact: true }).click();
    await spectator.goto('/lobby');
    await expect(spectator.getByText('已连接 · 实时同步')).toBeVisible();
    const stoken = await spectator.evaluate(() => localStorage.getItem('playroom-token'));
    const ss: Socket<ServerEvents, ClientEvents> = io('http://localhost:3001', {
      auth: { token: stoken },
      transports: ['websocket'],
    });
    sockets.push(ss);
    await new Promise<void>((r) => ss.once('connect', r));
    const watched = await request<RoomView>((ack) => ss.emit('room:join', { code, spectate: true }, ack));
    await spectator.goto(`/game/${roomId}`);
    await expect(spectator.locator('.gomoku-board')).toBeVisible();
    await expect(spectator.getByRole('button', { name: '落子 H8', exact: true })).toBeDisabled();
    await expect(
      request((ack) =>
        ss.emit(
          'game:action',
          { roomId, revision: watched.revision, action: { type: 'place', x: 0, y: 0 } },
          ack,
        ),
      ),
    ).rejects.toThrow();
    for (let i = 0; i < 4; i++) {
      await a.getByRole('button', { name: `落子 ${String.fromCharCode(69 + i)}8`, exact: true }).click();
      await expect(
        b.getByRole('button', { name: `落子 ${String.fromCharCode(66 + i)}12`, exact: true }),
      ).toBeEnabled();
      await b.getByRole('button', { name: `落子 ${String.fromCharCode(66 + i)}12`, exact: true }).click();
      await expect(a.locator('.gomoku-stone')).toHaveCount((i + 1) * 2);
    }
    await a.waitForTimeout(450);
    await a.screenshot({ path: '.artifacts/gomoku-desktop.png' });
    const before = (await sync()).game;
    await a.reload();
    await expect(a.locator('.gomoku-stone')).toHaveCount(8);
    expect((await sync()).game).toEqual(before);
    await a.setViewportSize({ width: 390, height: 844 });
    await a.screenshot({ path: '.artifacts/gomoku-mobile.png' });
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = await a.locator('.gomoku-board').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThan(844);
    await a.setViewportSize({ width: 844, height: 390 });
    await a.screenshot({ path: '.artifacts/gomoku-landscape.png' });
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await a.setViewportSize({ width: 1440, height: 1000 });
    await a.getByRole('button', { name: '落子 I8', exact: true }).click();
    await expect(a.locator('.gomoku-winning-line')).toBeVisible();
    await expect(b.locator('.gomoku-status')).toContainText('获胜');
    await expect.poll(async () => (await sync()).resultSaved).toBe(true);
    await a.screenshot({ path: '.artifacts/gomoku-win.png' });
    await a.getByRole('button', { name: '再来一局' }).click();
    await expect(a).toHaveURL(/\/room\//);
    await expect(b).toHaveURL(/\/room\//);
    await a.getByRole('button', { name: '我准备好了' }).click();
    await b.getByRole('button', { name: '我准备好了' }).click();
    await a.getByRole('button', { name: '开始游戏' }).click();
    await expect(a.locator('.gomoku-stone')).toHaveCount(0);
    await a.getByRole('button', { name: '认输', exact: true }).click();
    await a.getByRole('button', { name: '确认认输', exact: true }).click();
    await expect(b.locator('.gomoku-status')).toContainText('获胜');
    expect(errors).toEqual([]);
  } finally {
    sockets.forEach((s) => s.disconnect());
    await Promise.all([ca.close(), cb.close(), cs.close()]);
  }
});
test('gomoku hard AI waits, moves through the shared game action flow and accepts undo', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/lobby');
  await expect(page.getByText('已连接 · 实时同步')).toBeVisible();
  await page.locator('.heading-buttons').getByRole('button', { name: '创建房间' }).click();
  await page.getByLabel('选择游戏').selectOption('gomoku');
  await page.getByLabel('AI 难度').selectOption('hard');
  await page.getByLabel('允许申请悔棋（需对手同意）').check();
  await page.getByRole('dialog').getByRole('button', { name: '创建房间', exact: true }).click();
  await page.getByRole('button', { name: '添加 AI', exact: true }).click();
  await page.getByRole('button', { name: '我准备好了' }).click();
  await page.getByRole('button', { name: '开始游戏' }).click();
  await expect(page.locator('.gomoku-board')).toBeVisible();
  await page.getByRole('button', { name: '落子 H8', exact: true }).click();
  await expect(page.locator('.gomoku-stone')).toHaveCount(1);
  await page.waitForTimeout(250);
  await expect(page.locator('.gomoku-stone')).toHaveCount(1);
  await expect(page.locator('.gomoku-stone')).toHaveCount(2, { timeout: 10000 });
  await page.getByRole('button', { name: '申请悔棋' }).click();
  await expect(page.locator('.gomoku-stone')).toHaveCount(0, { timeout: 10000 });
  await expect(page.getByRole('button', { name: '落子 H8', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '认输', exact: true }).click();
  await page.getByRole('button', { name: '确认认输', exact: true }).click();
  await expect(page.locator('.gomoku-status')).toContainText('获胜');
  expect(errors).toEqual([]);
});
