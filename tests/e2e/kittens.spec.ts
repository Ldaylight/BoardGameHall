import { test, expect, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents, Result, RoomView } from '../../shared/types';
import { kittensView } from '../../shared/games/views';
import { kittens } from '../../shared/games/exploding-kittens';
import type { KittensAction } from '../../shared/games/exploding-kittens/types';

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
async function create(page: Page, seats: string) {
  await page.goto('/lobby');
  await expect(page.getByText('已连接 · 实时同步')).toBeVisible();
  await page
    .locator('.game-tile')
    .filter({ has: page.getByRole('heading', { name: '炸弹猫', exact: true }) })
    .getByRole('button', { name: '开始游戏' })
    .click();
  await page.getByLabel('座位数量').selectOption(seats);
  await page.getByRole('dialog').getByRole('button', { name: '创建房间', exact: true }).click();
  await expect(page.locator('.room-code')).toBeVisible();
}

test('Kittens: three humans, private future, gifts/defusing, refresh, full game, result and rematch', async ({
  browser,
}) => {
  test.setTimeout(120000);
  const contexts = await Promise.all(Array.from({ length: 3 }, () => browser.newContext()));
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
    await create(a, '3');
    const roomId = a.url().split('/').at(-1)!,
      code = (await a.locator('.room-code').innerText()).replace('#', '');
    for (const p of [b, c]) {
      await p.goto(`/lobby?invite=${code}`);
      await expect(p).toHaveURL(/\/room\//);
    }
    for (const p of pages) await p.getByRole('button', { name: '我准备好了' }).click();
    await a.getByRole('button', { name: '开始游戏', exact: true }).click();
    for (const p of pages) {
      await expect(p.getByTestId('kittens-table')).toBeVisible();
      await expect(p.locator('.kittens-hand-slot')).toHaveCount(8);
      sockets.push(await connect(p));
    }
    const sync = (i = 0) => request<RoomView>((ack) => sockets[i].emit('room:sync', { roomId }, ack));
    const ids = (await sync()).players.map((p) => p.id);
    const act = async (i: number, action: KittensAction) => {
      const r = await sync(i);
      await request((ack) => sockets[i].emit('game:action', { roomId, revision: r.revision, action }, ack));
    };
    for (let i = 0; i < 3; i++) {
      const g = kittensView(await sync(i));
      expect(g.hand.filter((card) => card.kind === 'defuse')).toHaveLength(1);
      expect('hands' in g || 'deck' in g || 'eliminatedHands' in g).toBe(false);
    }
    await a.getByRole('button', { name: '牌桌聊天', exact: true }).click();
    await a.getByLabel('聊天消息').fill('喵！拆弹开始 🐈');
    await a.getByRole('button', { name: '发送消息' }).click();
    await expect(a.locator('.chat-message')).toContainText('拆弹开始');
    await a.getByRole('button', { name: '关闭', exact: true }).click();
    const shownKinds = await a
      .locator('.kittens-hand-slot [data-card-kind]')
      .evaluateAll((cards) => cards.map((c) => c.getAttribute('data-card-kind')!));
    const ordinary = ['taco', 'melon', 'potato', 'beard', 'rainbow'];
    const firstSpecial = shownKinds.findIndex((k) => !ordinary.includes(k));
    expect(shownKinds.slice(firstSpecial).every((k) => !ordinary.includes(k))).toBe(true);
    const flat = await a.locator('.kittens-hand-slot .kitten-card').evaluateAll((cards) =>
      cards.map((c) => {
        const r = c.getBoundingClientRect();
        return { x: r.x, width: r.width };
      }),
    );
    for (let i = 1; i < flat.length; i++)
      expect(flat[i].x - flat[i - 1].x).toBeGreaterThanOrEqual(flat[i - 1].width - 1);
    await expect(a.locator('.kittens-seat .kittens-seat-clock')).toHaveCount(0);
    await expect(a.getByTestId('kittens-countdown')).toBeVisible();
    await a.screenshot({ path: '.artifacts/kittens-desktop.png' });
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await a.setViewportSize(viewport);
      expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const footer = await a.locator('.kittens-hand-area').boundingBox();
      expect(footer!.y + footer!.height).toBeLessThanOrEqual(viewport.height + 1);
      await expect(a.getByTestId('performance-bar')).toBeVisible();
      await a.screenshot({
        path: `.artifacts/kittens-${viewport.width === 390 ? 'mobile' : 'landscape'}.png`,
      });
    }
    await a.setViewportSize({ width: 1440, height: 900 });
    let sawFuture = false,
      sawDefuse = false,
      sawTransfer = false;
    for (let steps = 0; steps < 600; steps++) {
      const r = await sync(),
        g = kittensView(r);
      if (g.phase === 'finished') break;
      if (g.phase === 'reaction') {
        const responder = ids.findIndex((id) => g.alive.includes(id) && !g.pending!.allowed.includes(id));
        await act(responder, { type: 'ek:allow', pendingId: g.pending!.id });
        continue;
      }
      const actor = ids.indexOf(g.actorId),
        own = kittensView(await sync(actor));
      if (g.phase === 'future') {
        await expect(pages[actor].getByRole('dialog')).toContainText('只有你能看到');
        expect(own.future.length).toBeGreaterThan(0);
        for (let i = 0; i < 3; i++) if (i !== actor) expect(kittensView(await sync(i)).future).toEqual([]);
        if (!sawFuture) {
          const before = own.future;
          await pages[actor].reload();
          await expect(pages[actor].getByRole('dialog')).toContainText('只有你能看到');
          expect(kittensView(await sync(actor)).future).toEqual(before);
          sawFuture = true;
        }
        await pages[actor].getByRole('button', { name: '记住了，继续' }).click();
      } else if (g.phase === 'defuse' && !sawDefuse) {
        await pages[actor].getByRole('button', { name: '使用拆弹牌', exact: true }).click();
        await expect(pages[actor].getByRole('dialog')).toContainText('秘密放回炸弹');
        await pages[actor].getByLabel('炸弹放回位置').fill('0');
        await pages[actor].getByRole('button', { name: '确认秘密放回', exact: true }).click();
        sawDefuse = true;
      } else if (g.phase === 'favor' && !sawTransfer) {
        const before = own.hand.length;
        await act(actor, { type: 'ek:give', cardId: own.hand[0].id });
        await expect(a.getByTestId('kitten-transfer')).toBeVisible();
        await expect(a.getByTestId('kitten-transfer').locator('.kitten-card-face')).toHaveCount(0);
        expect(kittensView(await sync(actor)).hand).toHaveLength(before - 1);
        sawTransfer = true;
      } else {
        const future =
          !sawFuture && own.phase === 'playing' && own.hand.find((card) => card.kind === 'future');
        const favor =
          !sawTransfer && own.phase === 'playing' && own.hand.find((card) => card.kind === 'favor');
        await act(
          actor,
          future
            ? { type: 'ek:play', cardIds: [future.id] }
            : favor
              ? {
                  type: 'ek:play',
                  cardIds: [favor.id],
                  targetId: own.alive.find((id) => id !== ids[actor] && own.handCounts[id] > 0)!,
                }
              : kittens.aiMove(own, ids[actor], 'medium'),
        );
      }
    }
    const ended = await sync();
    expect(kittensView(ended).phase).toBe('finished');
    expect(kittensView(ended).alive).toHaveLength(1);
    expect(ended.resultSaved).toBe(true);
    expect(sawFuture).toBe(true);
    expect(sawDefuse).toBe(true);
    expect(sawTransfer).toBe(true);
    for (const p of pages) await expect(p.locator('.match-result-dialog')).toBeVisible();
    await a.screenshot({ path: '.artifacts/kittens-result.png' });
    await a.getByRole('button', { name: '再来一局', exact: true }).click();
    await expect(a).toHaveURL(/\/room\//);
    expect((await sync()).game).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    sockets.forEach((s) => s.disconnect());
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test('Kittens: five seats, AI responds on the standard channel, phone navigation and audio assets', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 760, height: 900 },
    { width: 1100, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/lobby');
    await expect(page.locator('.topbar .nav-room-actions')).toBeVisible();
    await expect(page.locator('.hero')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const nav = await page.locator('.nav-room-actions').boundingBox();
    expect(nav!.x + nav!.width).toBeLessThanOrEqual(viewport.width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.nav-room-actions').getByRole('button', { name: '创建房间', exact: true }).click();
  await page.getByLabel('选择游戏').selectOption('uno');
  await page.getByLabel('座位数量').selectOption('6');
  await page.getByLabel('选择游戏').selectOption('exploding-kittens');
  await expect(page.getByLabel('座位数量')).toHaveValue('5');
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await create(page, '5');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '添加 AI' }).first().click();
  await page.getByRole('button', { name: '我准备好了' }).click();
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(page.getByTestId('kittens-table')).toBeVisible();
  await expect(page.locator('.kittens-seat')).toHaveCount(5);
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 740 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const seat of await page.locator('.kittens-seat').all()) {
      const box = await seat.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    }
    for (const count of await page.locator('.kittens-opponent-hand strong').all()) {
      const box = await count.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    }
    await page.screenshot({ path: `.artifacts/kittens-five-${viewport.width}.png` });
  }
  for (const filename of ['card-shuffle', 'forceField_000', 'lowFrequency_explosion_000']) {
    const response = await page.request.get(`/audio/kenney/${filename}.ogg`);
    expect(response.status()).toBe(200);
    expect((await response.body()).subarray(0, 4).toString()).toBe('OggS');
  }
  const socket = await connect(page),
    roomId = page.url().split('/').at(-1)!;
  const sync = () => request<RoomView>((ack) => socket.emit('room:sync', { roomId }, ack));
  try {
    const me = (await sync()).hostId;
    for (let i = 0; i < 8; i++) {
      const r = await sync(),
        g = kittensView(r);
      if (g.phase === 'finished') break;
      const legal = kittens.getLegalActions(g, me);
      const allow = legal.find((a) => a.type === 'ek:allow');
      if (g.phase === 'reaction' ? !!allow : legal.length > 0) {
        const action = g.phase === 'reaction' ? allow! : kittens.aiMove(g, me, 'medium');
        try {
          await request((ack) => socket.emit('game:action', { roomId, revision: r.revision, action }, ack));
        } catch (error) {
          // Bots can acknowledge the response window between our sync and action.
          if (!(error instanceof Error) || !error.message.includes('状态已更新')) throw error;
          i--;
        }
      } else {
        await expect
          .poll(async () => (await sync()).revision, { timeout: 16000 })
          .toBeGreaterThan(r.revision);
      }
    }
    expect(kittensView(await sync()).events.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  } finally {
    socket.disconnect();
  }
});

test('Kitten artwork: all thirteen kinds have different illustrated faces', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/settings');
  await page.evaluate(
    async (url) => {
      const fixture = await import(/* @vite-ignore */ url);
      fixture.mountKittenArt();
    },
    `/@fs/${process.cwd().replace(/\\/g, '/')}/tests/fixtures/kittens-art.tsx`,
  );
  const gallery = page.getByTestId('kitten-art-gallery');
  await expect(gallery.locator('.kitten-illustration')).toHaveCount(13);
  const art = await gallery
    .locator('.kitten-illustration svg')
    .evaluateAll((nodes) => nodes.map((n) => n.innerHTML));
  expect(new Set(art).size).toBe(13);
  await page.screenshot({ path: '.artifacts/kitten-art-thirteen.png' });
  expect(errors).toEqual([]);
});
