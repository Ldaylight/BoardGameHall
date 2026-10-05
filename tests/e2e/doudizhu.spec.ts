import { test, expect, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents, Result, RoomView } from '../../shared/types';
import { doudizhuView } from '../../shared/games/views';
import { doudizhu } from '../../shared/games/doudizhu';
function request<T>(send: (ack: (r: Result<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket timeout')), 10000);
    send((r) => {
      clearTimeout(timer);
      r.ok ? resolve(r.data) : reject(new Error(r.error));
    });
  });
}
async function connect(page: Page) {
  const token = await page.evaluate(() => localStorage.getItem('playroom-token'));
  const socket: Socket<ServerEvents, ClientEvents> = io('http://localhost:3001', {
    auth: { token },
    transports: ['websocket'],
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}
test('three-person Doudizhu: bidding, selection, pass reset, private reconnect, mobile, team result and rematch', async ({
  browser,
}) => {
  test.setTimeout(120000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const [a, b, c] = pages;
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
    await a.goto('/lobby');
    await expect(a.getByText('已连接 · 实时同步')).toBeVisible();
    await expect(a.getByTestId('performance-bar')).toBeVisible();
    await expect.poll(() => a.getByTestId('performance-fps').innerText()).toMatch(/^\d+$/);
    await expect.poll(() => a.getByTestId('performance-rtt').innerText()).toMatch(/^\d+$/);
    await a
      .locator('.game-tile')
      .filter({ has: a.getByRole('heading', { name: '斗地主', exact: true }) })
      .getByRole('button', { name: '开始游戏' })
      .click();
    await expect(a.getByLabel('座位数量')).toHaveValue('3');
    await a.getByRole('dialog').getByRole('button', { name: '创建房间', exact: true }).click();
    await expect(a.locator('.room-code')).toBeVisible();
    const roomId = a.url().split('/').at(-1)!,
      code = (await a.locator('.room-code').innerText()).replace('#', '');
    await b.goto(`/lobby?invite=${code}`);
    await expect(b).toHaveURL(/\/room\//);
    await expect(a.getByRole('button', { name: '开始游戏', exact: true })).toBeDisabled();
    await c.goto(`/lobby?invite=${code}`);
    await expect(c).toHaveURL(/\/room\//);
    for (const p of pages) await p.getByRole('button', { name: '我准备好了' }).click();
    await a.getByRole('button', { name: '开始游戏', exact: true }).click();
    for (const p of pages) {
      await expect(p.getByTestId('doudizhu-table')).toBeVisible();
      await expect(p.locator('.ddz-hand-slot')).toHaveCount(17);
      await expect(p.locator('.ddz-kitty .ddz-poker-back')).toHaveCount(3);
      sockets.push(await connect(p));
    }
    const sync = (i = 0) => request<RoomView>((ack) => sockets[i].emit('room:sync', { roomId }, ack));
    const handArea = await a.locator('.ddz-hand-scroll').boundingBox();
    expect(Math.abs(handArea!.x + handArea!.width / 2 - 720)).toBeLessThan(2);
    // Hover must highlight the exposed strip without lifting it over the next card.
    await a.waitForTimeout(1100);
    const firstCard = a.locator('.ddz-hand-slot button').first();
    const beforeHover = await firstCard.boundingBox();
    const stacking = await firstCard.evaluate((card) => getComputedStyle(card.parentElement!).zIndex);
    await firstCard.hover({ position: { x: 8, y: 60 } });
    await a.waitForTimeout(200);
    const afterHover = await firstCard.boundingBox();
    expect(afterHover!.y).toBeCloseTo(beforeHover!.y, 0);
    expect(afterHover!.x).toBeCloseTo(beforeHover!.x, 0);
    expect(await firstCard.evaluate((card) => getComputedStyle(card.parentElement!).zIndex)).toBe(stacking);
    expect(await firstCard.getAttribute('aria-pressed')).toBe('false');
    await a.screenshot({ path: '.artifacts/doudizhu-hover-highlight.png' });
    await a.mouse.move(10, 150);
    // Holding the left button paints a range; reversing restores cards outside that range.
    const firstStrip = await a.locator('.ddz-hand-slot').nth(0).boundingBox();
    const fourthStrip = await a.locator('.ddz-hand-slot').nth(3).boundingBox();
    await a.mouse.move(firstStrip!.x + 8, firstStrip!.y + 65);
    await a.mouse.down();
    await a.mouse.move(fourthStrip!.x + 8, firstStrip!.y + 65, { steps: 12 });
    await expect(a.locator('.ddz-hand-slot .selected')).toHaveCount(4);
    await a.mouse.move(firstStrip!.x + 8, firstStrip!.y + 65, { steps: 8 });
    await expect(a.locator('.ddz-hand-slot .selected')).toHaveCount(1);
    await a.mouse.move(fourthStrip!.x + 8, firstStrip!.y + 65, { steps: 8 });
    await a.mouse.up();
    await expect(a.locator('.ddz-hand-slot .selected')).toHaveCount(4);
    // Starting on a selected card removes the range and releasing outside is safe.
    await a.mouse.move(firstStrip!.x + 8, firstStrip!.y + 45);
    await a.mouse.down();
    await a.mouse.move(fourthStrip!.x + 8, firstStrip!.y + 45, { steps: 12 });
    await expect(a.locator('.ddz-hand-slot .selected')).toHaveCount(0);
    await a.mouse.move(fourthStrip!.x + 8, 120);
    await a.mouse.up();
    await firstCard.focus();
    await a.keyboard.press('Space');
    await expect(firstCard).toHaveAttribute('aria-pressed', 'true');
    await a.keyboard.press('Space');
    await expect(firstCard).toHaveAttribute('aria-pressed', 'false');
    let view = await sync();
    const ids = view.players.map((p) => p.id);
    const first = ids.indexOf(doudizhuView(view).currentPlayerId);
    await pages[first].getByRole('button', { name: '3 分', exact: true }).click();
    view = await sync();
    expect(doudizhuView(view).phase).toBe('playing');
    const landlord = ids.indexOf(doudizhuView(view).landlordId!);
    await expect(pages[landlord].locator('.ddz-hand-slot')).toHaveCount(20);
    await expect(a.locator('.ddz-kitty .ddz-poker-face')).toHaveCount(3);
    await expect(a.locator('.ddz-seat.active')).toHaveAttribute('data-player-id', ids[landlord]);
    await expect(
      request((ack) =>
        sockets[(landlord + 1) % 3].emit(
          'game:action',
          { roomId, revision: view.revision, action: { type: 'pass' } },
          ack,
        ),
      ),
    ).rejects.toThrow('轮到');
    await expect(
      request((ack) =>
        sockets[landlord].emit(
          'game:action',
          { roomId, revision: view.revision, action: { type: 'play', cardIds: ['stolen-card'] } },
          ack,
        ),
      ),
    ).rejects.toThrow('自己的');
    await pages[landlord]
      .getByRole('button', { name: '不出', exact: true })
      .isDisabled()
      .then((v) => expect(v).toBe(true));
    await pages[landlord].getByRole('button', { name: '提示', exact: true }).click();
    const selected = await pages[landlord].locator('.ddz-hand-slot .selected').count();
    expect(selected).toBeGreaterThan(0);
    await pages[landlord].getByRole('button', { name: '出牌', exact: true }).click();
    await expect(pages[landlord].locator('.ddz-hand-slot')).toHaveCount(20 - selected);
    for (const offset of [1, 2])
      await pages[(landlord + offset) % 3].getByRole('button', { name: '不出', exact: true }).click();
    await expect(a.locator('.ddz-seat.active')).toHaveAttribute('data-player-id', ids[landlord]);
    view = await sync();
    expect(doudizhuView(view).trick).toBeNull();
    const before = doudizhuView(await sync(landlord)).hand;
    await pages[landlord].reload();
    await expect(pages[landlord].locator('.ddz-hand-slot')).toHaveCount(before.length);
    expect(doudizhuView(await sync(landlord)).hand).toEqual(before);
    await a.getByRole('button', { name: '牌桌聊天', exact: true }).click();
    await a.getByLabel('聊天消息').fill('一起斗个地主 🃏');
    await a.getByRole('button', { name: '发送消息' }).click();
    await expect(a.locator('.chat-message')).toContainText('一起斗个地主');
    await a.getByRole('button', { name: '关闭', exact: true }).click();
    await a.screenshot({ path: '.artifacts/doudizhu-desktop.png' });
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await a.setViewportSize(viewport);
      await a.waitForTimeout(100);
      expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const hand = await a.locator('.ddz-hand-area').boundingBox();
      expect(hand!.y + hand!.height).toBeLessThanOrEqual(viewport.height + 1);
      const handCenter = await a.locator('.ddz-hand-scroll').boundingBox();
      expect(Math.abs(handCenter!.x + handCenter!.width / 2 - viewport.width / 2)).toBeLessThan(2);
      await expect(a.getByTestId('performance-bar')).toBeVisible();
      await a.screenshot({
        path: `.artifacts/doudizhu-${viewport.width === 390 ? 'mobile' : 'landscape'}.png`,
      });
      for (const position of ['left', 'right', 'self']) {
        const seat = await a.locator(`.ddz-seat-${position}`).boundingBox();
        expect(seat!.x).toBeGreaterThanOrEqual(0);
        expect(seat!.x + seat!.width).toBeLessThanOrEqual(viewport.width);
      }
      await expect(a.locator('.ddz-back')).toBeVisible();
    }
    await a.setViewportSize({ width: 1440, height: 900 });
    let actions = 0;
    while (actions++ < 250) {
      view = await sync();
      const game = doudizhuView(view);
      if (game.phase === 'finished') break;
      const actor = ids.indexOf(game.currentPlayerId);
      const own = doudizhuView(await sync(actor));
      const action = doudizhu.aiMove(own, game.currentPlayerId, 'medium');
      await request((ack) =>
        sockets[actor].emit('game:action', { roomId, revision: view.revision, action }, ack),
      );
    }
    view = await sync();
    const ended = doudizhuView(view);
    expect(ended.phase).toBe('finished');
    expect(ended.winnerIds).toHaveLength(ended.winningTeam === 'farmers' ? 2 : 1);
    expect(view.resultSaved).toBe(true);
    expect(Object.values(ended.scores).reduce((a, b) => a + b, 0)).toBe(0);
    for (const p of pages) await expect(p.locator('.match-result-dialog')).toBeVisible();
    await a.screenshot({ path: '.artifacts/doudizhu-result.png' });
    await a.getByRole('button', { name: '再来一局', exact: true }).click();
    await expect(a).toHaveURL(/\/room\//);
    expect((await sync()).game).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    sockets.forEach((s) => s.disconnect());
    await Promise.all(contexts.map((c) => c.close()));
  }
});
test('Doudizhu AI fills two seats and advances through standard server actions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/lobby');
  await expect(page.getByText('已连接 · 实时同步')).toBeVisible();
  await page
    .locator('.game-tile')
    .filter({ has: page.getByRole('heading', { name: '斗地主', exact: true }) })
    .getByRole('button', { name: '开始游戏' })
    .click();
  await page.getByLabel('AI 难度').selectOption('hard');
  await page.getByRole('dialog').getByRole('button', { name: '创建房间', exact: true }).click();
  await page.getByRole('button', { name: '添加 AI' }).first().click();
  await page.getByRole('button', { name: '添加 AI' }).first().click();
  await expect(page.locator('.avatar-ai')).toHaveCount(2);
  await page.getByRole('button', { name: '我准备好了' }).click();
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(page.getByTestId('doudizhu-table')).toBeVisible();
  const socket = await connect(page),
    roomId = page.url().split('/').at(-1)!;
  const sync = () => request<RoomView>((ack) => socket.emit('room:sync', { roomId }, ack));
  try {
    const me = (await sync()).hostId;
    for (let i = 0; i < 7; i++) {
      const r = await sync(),
        game = doudizhuView(r);
      if (game.phase === 'finished') break;
      if (game.currentPlayerId === me) {
        await request((ack) =>
          socket.emit(
            'game:action',
            { roomId, revision: r.revision, action: doudizhu.aiMove(game, me, 'medium') },
            ack,
          ),
        );
      } else {
        await expect
          .poll(async () => doudizhuView(await sync()).turnNumber, { timeout: 10000 })
          .toBeGreaterThan(game.turnNumber);
      }
    }
    expect(doudizhuView(await sync()).phase).toBe('playing');
    expect(errors).toEqual([]);
  } finally {
    socket.disconnect();
  }
});
