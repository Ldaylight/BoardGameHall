import { test, expect } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents, Result, RoomView } from '../../shared/types';
import { uno } from '../../shared/games/uno';
import { unoView } from '../../shared/games/views';

function request<T>(send: (ack: (result: Result<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket acknowledgement timed out')), 10000);
    send((result) => {
      clearTimeout(timer);
      result.ok ? resolve(result.data) : reject(new Error(result.error));
    });
  });
}
test('real match activates UNO only with two cards, saves declaration on refresh and highlights required draw', async ({
  browser,
}) => {
  test.setTimeout(120000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const sockets: Socket<ServerEvents, ClientEvents>[] = [];
  try {
    const a = pages[0],
      b = pages[1];
    await a.goto('/lobby');
    await expect(a.getByText('已连接 · 实时同步')).toBeVisible();
    await a.locator('.nav-room-actions').getByRole('button', { name: '创建房间' }).click();
    await a.getByRole('dialog').getByLabel('座位数量').selectOption('2');
    await a.getByRole('dialog').getByRole('button', { name: '创建房间', exact: true }).click();
    await expect(a.locator('.room-code')).toBeVisible();
    const code = (await a.locator('.room-code').innerText()).replace('#', '');
    const roomId = a.url().split('/').at(-1)!;
    await b.goto('/lobby');
    await expect(b.getByText('已连接 · 实时同步')).toBeVisible();
    await b.locator('.nav-room-actions').getByRole('button', { name: '房间码加入' }).click();
    await b.locator('.room-code-input').fill(code);
    await b.getByRole('button', { name: '加入房间', exact: true }).click();
    await expect(b).toHaveURL(/\/room\//);
    await a.getByRole('button', { name: '我准备好了' }).click();
    await b.getByRole('button', { name: '我准备好了' }).click();
    await a.getByRole('button', { name: '开始游戏' }).click();
    for (const page of pages) await expect(page).toHaveURL(/\/game\//);
    for (const page of pages) {
      await expect(page.locator('.uno-call')).toBeDisabled();
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
    // Host and guest occupy seats 0 and 1; moves use only their own projected view.
    let declared = false;
    for (let step = 0; step < 600 && !declared; step++) {
      const views = await Promise.all(
        sockets.map((socket) => request<RoomView>((ack) => socket.emit('room:sync', { roomId }, ack))),
      );
      const state = views[0].game!;
      if (state.winnerId) break;
      const activeIndex = state.players.indexOf(state.currentPlayerId);
      const socket = sockets[activeIndex];
      const page = pages[activeIndex];
      let view = views[activeIndex];
      const game = unoView(view);
      const move = uno.aiMove(game, game.currentPlayerId, 'medium');
      if (
        move.type === 'draw' &&
        !uno.getLegalActions(game, game.currentPlayerId).some((action) => action.type === 'play')
      ) {
        await expect(page.getByRole('button', { name: '摸一张' })).toHaveClass(/draw-required/);
      }
      if (game.hand.length === 2 && move.type === 'play') {
        await expect(page.locator('.uno-call')).toBeEnabled();
        await page.getByRole('button', { name: '喊 UNO', exact: true }).click();
        await expect(page.locator('.uno-call')).toHaveAttribute('aria-pressed', 'true');
        await page.reload();
        await expect(page.locator('.uno-call')).toHaveAttribute('aria-pressed', 'true');
        view = await request<RoomView>((ack) => socket.emit('room:sync', { roomId }, ack));
        expect(unoView(view).unoDeclared?.playerId).toBe(game.currentPlayerId);
        await request<null>((ack) =>
          socket.emit(
            'game:action',
            { roomId, revision: view.revision, action: { ...move, uno: false } },
            ack,
          ),
        );
        await expect(page.locator('.hand-slot')).toHaveCount(1);
        await expect(page.locator('.uno-call')).toBeDisabled();
        declared = true;
      } else {
        await request<null>((ack) =>
          socket.emit('game:action', { roomId, revision: view.revision, action: move }, ack),
        );
      }
    }
    expect(declared).toBe(true);
    await expect.poll(() => pages[0].locator('.played-card').count()).toBeLessThanOrEqual(2);
    await a.setViewportSize({ width: 844, height: 390 });
    expect(
      await a.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight &&
          document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(a.getByRole('button', { name: '摸一张' })).toBeInViewport();
    await expect(a.getByRole('button', { name: '打出选中牌' })).toBeInViewport();
  } finally {
    for (const socket of sockets) socket.disconnect();
    await Promise.all(contexts.map((context) => context.close()));
  }
});
