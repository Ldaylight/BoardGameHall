import { test, expect, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents, Result, RoomView } from '../../shared/types';
import { holdemView } from '../../shared/games/views';
import type { HoldemAction } from '../../shared/games/holdem/types';
function request<T>(send: (ack: (r: Result<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Error('Socket timeout')), 10000);
    send((r) => {
      clearTimeout(t);
      r.ok ? resolve(r.data) : reject(Error(r.error));
    });
  });
}
async function connect(page: Page) {
  const token = await page.evaluate(() => localStorage.getItem('playroom-token'));
  const s: Socket<ServerEvents, ClientEvents> = io('http://localhost:3001', {
    auth: { token },
    transports: ['websocket'],
  });
  await new Promise<void>((resolve, reject) => {
    s.once('connect', resolve);
    s.once('connect_error', reject);
  });
  return s;
}
async function create(page: Page, seats: string) {
  await page.goto('/lobby');
  await expect(page.getByText('已连接 · 实时同步')).toBeVisible();
  await page
    .locator('.game-tile')
    .filter({ has: page.getByRole('heading', { name: '德州扑克', exact: true }) })
    .getByRole('button', { name: '开始游戏' })
    .click();
  await page.getByLabel('座位数量').selectOption(seats);
  await page.getByRole('dialog').getByRole('button', { name: '创建房间', exact: true }).click();
  await expect(page.locator('.room-code')).toBeVisible();
}
test('Holdem: three humans, observer privacy, four streets, all-in, results, refresh and rematch', async ({
  browser,
}) => {
  test.setTimeout(120000);
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage())),
    [a, b, c, watch] = pages;
  const sockets: Socket<ServerEvents, ClientEvents>[] = [];
  const errors: string[] = [];
  for (const p of pages) {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
  }
  try {
    await a.setViewportSize({ width: 1440, height: 900 });
    await create(a, '3');
    const roomId = a.url().split('/').at(-1)!,
      code = (await a.locator('.room-code').innerText()).replace('#', '');
    for (const p of [b, c]) {
      await p.goto(`/lobby?invite=${code}`);
      await expect(p).toHaveURL(/\/room\//);
    }
    for (const p of [a, b, c]) await p.getByRole('button', { name: '我准备好了' }).click();
    await a.getByRole('button', { name: '开始游戏', exact: true }).click();
    for (const p of [a, b, c]) {
      await expect(p.getByTestId('holdem-table')).toBeVisible();
      sockets.push(await connect(p));
      await expect(p.locator('.holdem-own-cards .ddz-poker-face')).toHaveCount(2);
    }
    await watch.goto('/lobby');
    await expect(watch.getByText('已连接 · 实时同步')).toBeVisible();
    sockets.push(await connect(watch));
    await request((ack) => sockets[3].emit('room:join', { code, spectate: true }, ack));
    await watch.goto(`/game/${roomId}`);
    await expect(watch.getByTestId('holdem-table')).toBeVisible();
    await expect(watch.locator('.holdem-seat-other')).toHaveCount(3);
    await expect(watch.locator('.holdem-own-cards .ddz-poker-face')).toHaveCount(0);
    const sync = (i = 0) => request<RoomView>((ack) => sockets[i].emit('room:sync', { roomId }, ack));
    const ids = (await sync()).players.map((p) => p.id);
    const act = async (i: number, action: HoldemAction) => {
      const r = await sync(i);
      await request((ack) => sockets[i].emit('game:action', { roomId, revision: r.revision, action }, ack));
    };
    const original = holdemView(await sync()).hand;
    expect(JSON.stringify(holdemView(await sync(1)))).not.toContain(original[0].id);
    expect(holdemView(await sync(3)).hand).toEqual([]);
    await a.reload();
    await expect(a.getByTestId('holdem-table')).toBeVisible();
    expect(holdemView(await sync()).hand).toEqual(original);
    await a.getByRole('button', { name: '牌桌聊天', exact: true }).click();
    await a.getByLabel('聊天消息').fill('翻牌见！🃏');
    await a.getByRole('button', { name: '发送消息' }).click();
    await expect(a.locator('.chat-message')).toContainText('翻牌见');
    await a.getByRole('button', { name: '关闭', exact: true }).click();
    await a.getByLabel('加注本轮总额').fill('80');
    await a.getByRole('button', { name: '加注', exact: true }).click();
    for (let n = 0; n < 2; n++) {
      const g = holdemView(await sync()),
        index = ids.indexOf(g.currentPlayerId);
      await pages[index].getByRole('button', { name: /^跟注/ }).click();
    }
    await expect(a.locator('.holdem-community .ddz-poker-face')).toHaveCount(3);
    await expect(a.locator('.holdem-street')).toContainText('翻牌');
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 740 },
      { width: 844, height: 390 },
    ]) {
      await a.setViewportSize(viewport);
      expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const footer = await a.locator('.holdem-hand-area').boundingBox();
      expect(footer!.y + footer!.height).toBeLessThanOrEqual(viewport.height + 1);
      await expect(a.getByTestId('performance-bar')).toBeVisible();
      await a.screenshot({ path: `.artifacts/holdem-${viewport.width}.png` });
    }
    await a.setViewportSize({ width: 1440, height: 900 });
    for (let step = 0; step < 12; step++) {
      const r = await sync(),
        g = holdemView(r);
      if (g.phase !== 'betting') break;
      const i = ids.indexOf(g.currentPlayerId);
      await pages[i]
        .getByRole('button', { name: g.callAmount ? '跟注' : '过牌', exact: !g.callAmount })
        .click();
    }
    await expect(a.getByTestId('holdem-hand-result')).toBeVisible();
    expect(holdemView(await sync()).community).toHaveLength(5);
    expect(Object.keys(holdemView(await sync(3)).revealed)).toHaveLength(3);
    const beforeHand = holdemView(await sync()).handNumber;
    await expect
      .poll(async () => holdemView(await sync()).handNumber, { timeout: 10000 })
      .toBe(beforeHand + 1);
    for (let n = 0; n < 20; n++) {
      const r = await sync(),
        g = holdemView(r);
      if (g.winnerId) break;
      if (g.phase === 'showdown') {
        await expect
          .poll(async () => holdemView(await sync()).handNumber, { timeout: 10000 })
          .toBeGreaterThan(g.handNumber);
        continue;
      }
      const i = ids.indexOf(g.currentPlayerId);
      const own = holdemView(await sync(i));
      await act(i, {
        type:
          own.canRaise || own.maxRaiseTo <= own.currentBet
            ? 'poker:all-in'
            : own.callAmount
              ? 'poker:call'
              : 'poker:check',
      });
    }
    const ended = await sync();
    expect(holdemView(ended).winnerId).toBeTruthy();
    expect(ended.resultSaved).toBe(true);
    expect(Object.values(holdemView(ended).stacks).reduce((a, b) => a + b, 0)).toBe(3000);
    await expect(a.locator('.match-result-dialog')).toBeVisible();
    await a.getByRole('button', { name: '再来一局', exact: true }).click();
    await expect(a).toHaveURL(/\/room\//);
    expect((await sync()).game).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    sockets.forEach((s) => s.disconnect());
    await Promise.all(contexts.map((c) => c.close()));
  }
});
test('Holdem: six seats with fair hard AI, responsive layouts and chip sound effects', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await create(page, '6');
  await page.getByLabel('AI 难度').selectOption('hard');
  for (let i = 0; i < 5; i++)
    await page.getByRole('button', { name: '添加 AI', exact: true }).first().click();
  await page.getByRole('button', { name: '我准备好了' }).click();
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(page.getByTestId('holdem-table')).toBeVisible();
  await expect(page.locator('.holdem-seat')).toHaveCount(6);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    for (const seat of await page.locator('.holdem-seat-other').all()) {
      const box = await seat.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThan(viewport.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.artifacts/holdem-six-${viewport.width}.png` });
  }
  const s = await connect(page),
    roomId = page.url().split('/').at(-1)!;
  try {
    const first = await request<RoomView>((ack) => s.emit('room:sync', { roomId }, ack));
    await expect
      .poll(async () => (await request<RoomView>((ack) => s.emit('room:sync', { roomId }, ack))).revision, {
        timeout: 15000,
      })
      .toBeGreaterThan(first.revision);
    expect(errors).toEqual([]);
  } finally {
    s.disconnect();
  }
});
