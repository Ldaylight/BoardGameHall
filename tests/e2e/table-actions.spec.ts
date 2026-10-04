import { test, expect } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents, Result, RoomView } from '../../shared/types';
import { uno, type UnoAction } from '../../shared/games/uno';
import { unoView } from '../../shared/games/views';
declare global {
  interface Window {
    drawProgress?: { counts: number[]; observer: MutationObserver };
  }
}

function request<T>(send: (ack: (result: Result<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket timeout')), 10000);
    send((result) => {
      clearTimeout(timer);
      result.ok ? resolve(result.data) : reject(new Error(result.error));
    });
  });
}

test('real table keeps a dragged card visible outside hand, flies draws, reverses arrows and restores skip markers', async ({
  browser,
}) => {
  test.setTimeout(120000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const sockets: Socket<ServerEvents, ClientEvents>[] = [];
  const errors: string[] = [];
  for (const page of pages) {
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
  }
  try {
    const a = pages[0],
      b = pages[1];
    await a.setViewportSize({ width: 1440, height: 1050 });
    await a.goto('/lobby');
    await expect(a.getByText('已连接 · 实时同步')).toBeVisible();
    await a.locator('.heading-buttons').getByRole('button', { name: '创建房间' }).click();
    await a.getByRole('dialog').getByLabel('座位数量').selectOption('2');
    await a.getByRole('dialog').getByRole('button', { name: '创建房间', exact: true }).click();
    await expect(a.locator('.room-code')).toBeVisible();
    const code = (await a.locator('.room-code').innerText()).replace('#', '');
    const roomId = a.url().split('/').at(-1)!;
    await b.goto('/lobby');
    await expect(b.getByText('已连接 · 实时同步')).toBeVisible();
    await b.locator('.heading-buttons').getByRole('button', { name: '房间码加入' }).click();
    await b.locator('.room-code-input').fill(code);
    await b.getByRole('button', { name: '加入房间', exact: true }).click();
    await a.getByRole('button', { name: '我准备好了' }).click();
    await b.getByRole('button', { name: '我准备好了' }).click();
    await a.getByRole('button', { name: '开始游戏' }).click();
    for (const page of pages) {
      await expect(page).toHaveURL(/\/game\//);
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
    const sync = () =>
      Promise.all(
        sockets.map((socket) => request<RoomView>((ack) => socket.emit('room:sync', { roomId }, ack))),
      );
    const send = (index: number, view: RoomView, action: UnoAction) =>
      request<null>((ack) =>
        sockets[index].emit('game:action', { roomId, revision: view.revision, action }, ack),
      );
    const colorRanks = { wild: 0, red: 1, yellow: 2, green: 3, blue: 4 };
    const handColors = await a
      .locator('.hand-slot')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-card-color')!));
    const ranks = handColors.map((color) => colorRanks[color as keyof typeof colorRanks]);
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
    const profile = await a.locator('.own-hand-position .table-player').boundingBox();
    const hand = await a.locator('.hand-cards').boundingBox();
    expect(profile!.x + profile!.width).toBeLessThan(hand!.x);
    const deck = await a.locator('[data-draw-deck]').boundingBox();
    expect(deck!.x).toBeLessThan(100);
    expect(deck!.y).toBeLessThan(180);
    await expect(a.locator('.opponent-seat .mini-card-back')).toHaveCount(7);
    let dragged = false,
      drew = false,
      reversed = false,
      skipped = false,
      multiDraw = false;
    for (let step = 0; step < 250 && !(dragged && drew && reversed && skipped && multiDraw); step++) {
      const views = await sync();
      const game = unoView(views[0]);
      if (game.winnerId) throw new Error('Match ended before required interactions');
      const index = game.players.indexOf(game.currentPlayerId),
        view = views[index],
        page = pages[index];
      const legal = uno.getLegalActions(unoView(view), game.currentPlayerId);
      const findCard = (action: UnoAction) =>
        action.type === 'play' ? unoView(view).hand.find((c) => c.id === action.cardId) : undefined;
      // Keep at least two cards to avoid a premature win while observing public UI states.
      let action = (!reversed ? legal.find((move) => findCard(move)?.value === 'reverse') : undefined) ??
        (!skipped ? legal.find((move) => findCard(move)?.value === 'skip') : undefined) ??
        (!multiDraw ? legal.find((move) => findCard(move)?.value === 'draw2') : undefined) ??
        (!dragged
          ? legal.find((move) => move.type === 'play' && findCard(move)?.color !== 'wild')
          : undefined) ?? { type: 'draw' as const };
      if (unoView(view).drawnCardId) action = legal.find((move) => move.type === 'pass')!;
      if (unoView(view).hand.length <= 2)
        action = legal.find((move) => move.type === 'draw' || move.type === 'pass')!;
      if (action.type === 'play' && findCard(action)?.value === 'draw2' && !multiDraw) {
        for (const target of pages)
          await expect(target.locator('.draw-flight')).toHaveCount(0, { timeout: 10000 });
        const victim = game.players.find((id) => id !== game.currentPlayerId)!;
        await pages[game.players.indexOf(victim)].evaluate((id) => {
          window.drawProgress?.observer.disconnect();
          const counts: number[] = [];
          const observer = new MutationObserver(() => {
            const count = document.querySelectorAll(`.draw-flight[data-draw-player="${id}"]`).length;
            if (counts.at(-1) !== count) counts.push(count);
          });
          observer.observe(document.body, { subtree: true, childList: true });
          window.drawProgress = { counts, observer };
        }, victim);
      }
      if (!dragged && action.type === 'play' && findCard(action)?.color !== 'wild') {
        const card = page.locator(`.hand-slot[data-card-id="${action.cardId}"] button`);
        await expect(card).toBeEnabled();
        await card.scrollIntoViewIfNeeded();
        const box = await card.boundingBox(),
          destination = await page.locator('[data-discard-target]').boundingBox();
        await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
        await page.mouse.down();
        await page.mouse.move(
          destination!.x + destination!.width / 2,
          destination!.y + destination!.height / 2,
          { steps: 20 },
        );
        await expect(page.locator('.card-drag-ghost')).toBeVisible();
        const ghost = await page.locator('.card-drag-ghost').boundingBox(),
          handBox = await page.locator('.hand-panel').boundingBox();
        expect(ghost!.y + ghost!.height).toBeLessThan(handBox!.y);
        await page.screenshot({ path: '.artifacts/table-drag-visible.png' });
        await page.mouse.up();
        await expect(card).toHaveCount(0);
        dragged = true;
      } else {
        if (action.type === 'draw' && !drew) {
          await send(index, view, action);
          await expect(page.locator('.draw-flight')).not.toHaveCount(0);
          await page.screenshot({ path: '.artifacts/table-draw-trail.png' });
          await expect(page.locator('.draw-flight')).toHaveCount(0);
          drew = true;
        } else await send(index, view, action);
      }
      const after = await sync(),
        updated = unoView(after[index]);
      if (action.type === 'play') {
        const value = findCard(action)?.value;
        if (value === 'draw2' && !multiDraw) {
          const victim = game.players.find((id) => id !== game.currentPlayerId)!;
          const victimPage = pages[game.players.indexOf(victim)];
          const flights = victimPage.locator(`.draw-flight[data-draw-player="${victim}"]`);
          // Observe before sending: Socket round trips can outlast the first 480ms flight.
          await expect.poll(() => victimPage.evaluate(() => window.drawProgress!.counts)).toContain(2);
          await expect.poll(() => victimPage.evaluate(() => window.drawProgress!.counts)).toContain(1);
          await expect(flights).toHaveCount(0);
          expect(await victimPage.evaluate(() => window.drawProgress!.counts.slice(-3))).toEqual([2, 1, 0]);
          await victimPage.evaluate(() => window.drawProgress!.observer.disconnect());
          await expect(victimPage.locator('.own-hand-position .mini-card-back')).toHaveCount(
            updated.handCounts[victim],
          );
          multiDraw = true;
        }
        if (value === 'reverse') {
          await expect(page.locator('.direction-ring')).toHaveAttribute(
            'data-direction',
            updated.direction === 1 ? 'clockwise' : 'counterclockwise',
          );
          reversed = true;
        }
        if (value === 'skip') {
          const victim = game.players.find((id) => id !== game.currentPlayerId)!;
          expect(updated.blockedPlayers).toContain(victim);
          const victimPage = pages[game.players.indexOf(victim)];
          await expect(victimPage.locator('.own-hand-position .avatar-ban')).toBeVisible();
          await expect(victimPage.locator('.skip-hand-overlay .ban-mark')).toBeVisible();
          await victimPage.reload();
          await expect(victimPage.locator('.skip-hand-overlay .ban-mark')).toBeVisible();
          await victimPage.screenshot({ path: '.artifacts/table-skipped.png' });
          // The current player ends a turn; the server clears the marker when victim becomes active.
          let activeView = (await sync())[index];
          if (unoView(activeView).drawnCardId) await send(index, activeView, { type: 'pass' });
          else await send(index, activeView, { type: 'draw' });
          activeView = (await sync())[index];
          if (unoView(activeView).currentPlayerId === game.currentPlayerId && unoView(activeView).drawnCardId)
            await send(index, activeView, { type: 'pass' });
          await expect(victimPage.locator('.skip-hand-overlay')).toHaveCount(0);
          skipped = true;
        }
      }
    }
    expect({ dragged, drew, reversed, skipped, multiDraw }).toEqual({
      dragged: true,
      drew: true,
      reversed: true,
      skipped: true,
      multiDraw: true,
    });
    await a.setViewportSize({ width: 390, height: 844 });
    await expect(a.locator('.own-hand-position .table-player')).toBeInViewport();
    await a.screenshot({ path: '.artifacts/table-v2-mobile.png' });
    await a.setViewportSize({ width: 844, height: 390 });
    expect(
      await a.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    await a.screenshot({ path: '.artifacts/table-v2-landscape.png' });
    expect(errors).toEqual([]);
  } finally {
    for (const socket of sockets) socket.disconnect();
    await Promise.all(contexts.map((context) => context.close()));
  }
});
