import { test, expect, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents, Result, RoomView } from '../../shared/types';
import { xiangqiView } from '../../shared/games/views';
function request<T>(send: (ack: (r: Result<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Socket timeout')), 10000);
    send((r) => {
      clearTimeout(t);
      r.ok ? resolve(r.data) : reject(new Error(r.error));
    });
  });
}
async function move(page: Page, x: number, y: number, tx: number, ty: number) {
  const from = page.locator(`.xiangqi-point[data-x="${x}"][data-y="${y}"]`),
    to = page.locator(`.xiangqi-point[data-x="${tx}"][data-y="${ty}"]`);
  await expect(from).toBeEnabled();
  await from.click();
  await expect(to).toHaveAttribute('data-legal', 'true');
  await to.click();
}
test('Xiangqi standard multiplayer: selection, cannon explosion, side orientation, chat, reconnect and mobile', async ({
  browser,
}) => {
  test.setTimeout(90000);
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  const errors: string[] = [];
  const sockets: Socket<ServerEvents, ClientEvents>[] = [];
  for (const p of [a, b]) {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
  }
  try {
    await a.setViewportSize({ width: 1440, height: 1000 });
    await a.goto('/lobby');
    await expect(a.getByText('已连接 · 实时同步')).toBeVisible();
    await a
      .locator('.game-tile')
      .filter({ has: a.getByRole('heading', { name: '中国象棋', exact: true }) })
      .getByRole('button', { name: '开始游戏' })
      .click();
    await a.getByRole('button', { name: /标准对局/ }).click();
    await expect(a.getByLabel('选择游戏')).toHaveValue('xiangqi');
    await expect(a.getByLabel('座位数量')).toHaveValue('2');
    await a.getByRole('dialog').getByRole('button', { name: '创建房间', exact: true }).click();
    await expect(a.locator('.room-code')).toBeVisible();
    const code = (await a.locator('.room-code').innerText()).replace('#', ''),
      roomId = a.url().split('/').at(-1)!;
    await b.goto(`/lobby?invite=${code}`);
    await expect(b).toHaveURL(/\/room\//);
    await a.getByRole('button', { name: '我准备好了' }).click();
    await b.getByRole('button', { name: '我准备好了' }).click();
    await a.getByRole('button', { name: '开始游戏' }).click();
    await expect(a.locator('.xiangqi-piece')).toHaveCount(32);
    await expect(b.locator('.xiangqi-board')).toHaveAttribute('data-flipped', 'true');
    await expect(a.locator('.xiangqi-point')).toHaveCount(90);
    for (const page of [a, b]) {
      const token = await page.evaluate(() => localStorage.getItem('playroom-token'));
      const s: Socket<ServerEvents, ClientEvents> = io('http://localhost:3001', {
        auth: { token },
        transports: ['websocket'],
      });
      sockets.push(s);
      await new Promise<void>((resolve, reject) => {
        s.once('connect', resolve);
        s.once('connect_error', reject);
      });
    }
    const sync = () => request<RoomView>((ack) => sockets[0].emit('room:sync', { roomId }, ack));
    const view = await sync();
    await expect(
      request((ack) =>
        sockets[1].emit(
          'game:action',
          {
            roomId,
            revision: view.revision,
            action: { type: 'move', from: { x: 0, y: 0 }, to: { x: 0, y: 1 } },
          },
          ack,
        ),
      ),
    ).rejects.toThrow('轮到');
    await move(a, 1, 7, 1, 0);
    await expect(a.locator('.xiangqi-fx[data-effect="cannon"][data-capture="true"]')).toBeVisible();
    await a.screenshot({ path: '.artifacts/xiangqi-cannon.png' });
    await expect(b.locator('.xiangqi-piece')).toHaveCount(31);
    await move(b, 7, 2, 7, 9);
    await expect(a.locator('.xiangqi-piece')).toHaveCount(30);
    await a.waitForTimeout(1500);
    await a.screenshot({ path: '.artifacts/xiangqi-desktop.png' });
    await a.getByRole('button', { name: '象棋聊天' }).click();
    await a.getByRole('textbox', { name: '聊天消息' }).fill('炮火轰鸣，来一盘象棋');
    await a.getByRole('button', { name: '发送消息' }).click();
    await expect(a.getByText('炮火轰鸣，来一盘象棋')).toBeVisible();
    await a.getByRole('button', { name: '关闭', exact: true }).click();
    const before = xiangqiView(await sync());
    await a.reload();
    await expect(a.locator('.xiangqi-piece')).toHaveCount(30);
    expect(xiangqiView(await sync())).toEqual(before);
    await expect(a.locator('.xiangqi-fx')).toHaveCount(0);
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await a.setViewportSize(viewport);
      await a.waitForTimeout(100);
      const box = await a.locator('.xiangqi-board').boundingBox();
      expect(box!.width).toBeGreaterThan(150);
      expect(box!.y + box!.height).toBeLessThan(viewport.height);
      expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await a.screenshot({
        path: `.artifacts/xiangqi-${viewport.width === 390 ? 'mobile' : 'landscape'}.png`,
      });
    }
    await a.setViewportSize({ width: 390, height: 844 });
    await move(a, 0, 6, 0, 5);
    await expect.poll(async () => xiangqiView(await sync()).turnNumber).toBe(3);
    await a.getByRole('button', { name: '认输', exact: true }).click();
    await a.getByRole('button', { name: '确认认输' }).click();
    await expect(b.locator('.xiangqi-status')).toContainText('获胜');
    await expect.poll(async () => (await sync()).resultSaved).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    sockets.forEach((s) => s.disconnect());
    await ca.close();
    await cb.close();
  }
});
test('classic puzzles launch with hard AI, forced replies, solve, remember progress and retry', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/xiangqi/endgames');
  await expect(page.locator('.endgame-card')).toHaveCount(5);
  await expect(page.getByText('已连接 · 实时同步')).toBeVisible();
  await page
    .locator('.endgame-card')
    .filter({ has: page.getByRole('heading', { name: '双车错' }) })
    .getByRole('button', { name: '挑战残局' })
    .click();
  await expect(page.locator('.xiangqi-board')).toBeVisible();
  await move(page, 3, 3, 3, 0);
  await expect(page.locator('.xiangqi-fx[data-effect="chariot"][data-capture="true"]')).toBeVisible();
  await expect(page.locator('.xiangqi-point[data-x="4"][data-y="1"]')).toHaveAttribute(
    'data-piece',
    'general',
    { timeout: 10000 },
  );
  await move(page, 6, 2, 6, 1);
  await expect(page.locator('.xiangqi-status')).toContainText('残局已解开');
  await expect(page.getByRole('dialog')).toContainText('残局已解开！');
  await expect(page.getByRole('dialog').getByRole('button', { name: '重试残局' })).toBeVisible();
  await page.screenshot({ path: '.artifacts/xiangqi-puzzle-win.png' });
  await page.getByRole('link', { name: '更多残局' }).click();
  await expect(page.getByText('已解开 1 / 5 个残局')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator('.endgame-card')
    .filter({ has: page.getByRole('heading', { name: '重炮杀' }) })
    .getByRole('button', { name: '挑战残局' })
    .click();
  await expect(page.locator('.xiangqi-board')).toBeVisible();
  await page.getByRole('button', { name: '提示', exact: true }).click();
  await expect(page.locator('.xiangqi-mobile-hint')).toContainText('D8');
  await page.getByRole('button', { name: '提示', exact: true }).click();
  await move(page, 3, 2, 4, 2);
  await expect(page.locator('.xiangqi-status')).toContainText('残局已解开');
  await page.getByRole('button', { name: '重试残局' }).click();
  await expect(page).toHaveURL(/\/room\//);
  await page.getByRole('button', { name: '我准备好了' }).click();
  await page.getByRole('button', { name: '开始游戏' }).click();
  await expect(page.locator('.xiangqi-point[data-x="3"][data-y="2"]')).toHaveAttribute(
    'data-piece',
    'cannon',
  );
  await move(page, 3, 2, 4, 2);
  await expect(page.locator('.xiangqi-status')).toContainText('残局已解开');
  await page.getByRole('link', { name: '更多残局' }).click();
  await page.reload();
  await expect(page.getByText('已解开 2 / 5 个残局')).toBeVisible();
  expect(errors).toEqual([]);
});
