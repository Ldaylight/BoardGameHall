import { test, expect, type Page } from '@playwright/test';

async function createRoom(page: Page) {
  await page.locator('.nav-room-actions').getByRole('button', { name: '创建房间' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '创建房间', exact: true }).click();
  await expect(page).toHaveURL(/\/room\//);
}

test('eight themes including gradients apply throughout the app and persist after refresh', async ({
  page,
}) => {
  await page.goto('/settings');
  await expect(page.locator('.theme-option')).toHaveCount(8);
  const palette = ['极光蓝', '星云紫', '落日珊瑚', '鎏金琥珀', '夜色青柠'];
  const colors = [
    'rgb(16, 25, 35)',
    'rgb(25, 19, 34)',
    'rgb(33, 22, 24)',
    'rgb(30, 26, 18)',
    'rgb(18, 25, 21)',
  ];
  const panelColors = [
    'rgb(26, 37, 51)',
    'rgb(39, 30, 51)',
    'rgb(51, 35, 41)',
    'rgb(45, 39, 28)',
    'rgb(27, 35, 30)',
  ];
  for (let i = 0; i < palette.length; i++) {
    const choice = page.getByRole('button', { name: new RegExp(palette[i]) });
    await choice.click();
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('body')).toHaveCSS('background-color', colors[i]);
    await expect(page.locator('.settings-section').first()).toHaveCSS('background-color', panelColors[i]);
    await expect(page.locator('.settings-section').first()).toHaveCSS('background-image', 'none');
  }
  for (const gradient of ['霓虹星河', '暮光落日', '流光海湾']) {
    await page.getByRole('button', { name: new RegExp(gradient) }).click();
    expect(
      await page.locator('body').evaluate((element) => getComputedStyle(element).backgroundImage),
    ).toContain('linear-gradient');
    expect(
      await page
        .locator('.settings-section')
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundImage),
    ).toContain('linear-gradient');
  }
  await page.getByRole('button', { name: /星云紫/ }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: /星云紫/ })).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.brand').click();
  await expect(page.locator('body')).toHaveCSS('background-color', colors[1]);
});

test('lobby shows return shortcut, refresh restores it and closing releases the seat', async ({ page }) => {
  await page.goto('/lobby');
  await expect(page.getByText('已连接 · 实时同步')).toBeVisible();
  await createRoom(page);
  const original = page.url();
  await page.locator('.brand').click();
  await expect(page.getByRole('link', { name: /回到房间/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: /回到房间/ })).toBeVisible();
  await page.getByRole('link', { name: /回到房间/ }).click();
  await expect(page).toHaveURL(original);
  await page.locator('.brand').click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '离开房间并关闭返回入口' }).click();
  await expect(page.locator('.room-return-control')).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem('playroom-room', '00000000-0000-4000-8000-000000000000'));
  await page.reload();
  await expect(page.getByText('已连接 · 实时同步')).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('playroom-room'))).toBeNull();
  await expect(page.locator('.room-return-control')).toHaveCount(0);
  await createRoom(page);
  expect(page.url()).not.toBe(original);
});

test('four player table has cardinal seats, retains public cards and returns to a running match', async ({
  browser,
}) => {
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const errors: string[] = [];
  for (const page of pages) {
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
  }
  try {
    const host = pages[0];
    await host.setViewportSize({ width: 1440, height: 1050 });
    await host.goto('/lobby');
    await expect(host.getByText('已连接 · 实时同步')).toBeVisible();
    await createRoom(host);
    const code = (await host.locator('.room-code').innerText()).replace('#', '');
    for (const page of pages.slice(1)) {
      await page.goto('/lobby');
      await expect(page.getByText('已连接 · 实时同步')).toBeVisible();
      await page.locator('.nav-room-actions').getByRole('button', { name: '房间码加入' }).click();
      await page.locator('.room-code-input').fill(code);
      await page.getByRole('button', { name: '加入房间', exact: true }).click();
      await expect(page).toHaveURL(/\/room\//);
    }
    for (const page of pages) await page.getByRole('button', { name: '我准备好了' }).click();
    await host.getByRole('button', { name: '开始游戏' }).click();
    for (const page of pages) await expect(page).toHaveURL(/\/game\//);
    await expect(host.locator('.page-heading, .breadcrumb')).toHaveCount(0);
    await expect(host.locator('.uno-call')).toBeDisabled();
    await expect(host.getByTestId('seat-countdown')).toHaveCount(1);
    await expect(host.locator('.own-turn-clock [data-testid="seat-countdown"]')).toBeVisible();
    await expect(host.getByRole('button', { name: '牌局动态', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await host.getByRole('button', { name: '牌局动态', exact: true }).click();
    await expect(host.locator('.table-drawer')).toBeVisible();
    await expect(host.locator('.log-line').first()).toBeVisible();
    await host.getByRole('button', { name: '关闭', exact: true }).click();
    await host.getByRole('button', { name: '牌桌聊天', exact: true }).click();
    await expect(host.getByRole('textbox', { name: '聊天消息' })).toBeVisible();
    await host.getByRole('button', { name: '关闭', exact: true }).click();
    expect(await host.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    expect(
      await host
        .locator('.table-position')
        .evaluateAll((seats) => seats.map((seat) => seat.getAttribute('data-seat-position'))),
    ).toEqual(['left', 'top', 'right', 'bottom']);
    await expect(host.locator('.hand-panel .position-bottom .table-player')).toBeVisible();
    const arena = await host.locator('.game-arena').boundingBox();
    expect(arena!.width).toBeGreaterThan(900);
    expect(arena!.height).toBeGreaterThan(550);
    let played = false;
    for (let i = 0; i < 16; i++) {
      const active = await (async () => {
        for (const page of pages) if (await page.locator('.turn-banner.my-turn').count()) return page;
        throw new Error('No active player');
      })();
      const cards = active.locator('.hand-slot button:not([disabled])');
      if (await cards.count()) {
        await cards.first().click();
        await active.getByRole('button', { name: '打出选中牌' }).click();
        if (await active.locator('.color-picker').count())
          await active.locator('.color-picker button').first().click();
        await expect(host.locator('.played-card')).not.toHaveCount(0);
        played = true;
        break;
      }
      await active.getByRole('button', { name: '摸一张' }).click();
      await expect(active.locator('.hand-slot')).toHaveCount(8);
      if (await active.getByRole('button', { name: '结束回合' }).count()) {
        await active.getByRole('button', { name: '结束回合' }).click();
      }
    }
    expect(played).toBe(true);
    await expect(host.getByTestId('seat-countdown')).toHaveCount(1);
    await expect(host.getByTestId('seat-countdown')).toBeVisible();
    await expect(host.locator('.table-player [data-testid="seat-countdown"]')).toHaveCount(0);
    const timerBox = await host.getByTestId('seat-countdown').boundingBox();
    const viewport = host.viewportSize()!;
    expect(timerBox!.x).toBeGreaterThanOrEqual(0);
    expect(timerBox!.x + timerBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(timerBox!.y + timerBox!.height).toBeLessThanOrEqual(viewport.height);
    const publicCards = await host
      .locator('.played-card button')
      .evaluateAll((cards) => cards.map((c) => c.getAttribute('aria-label')));
    await host.reload();
    await expect(host.locator('.played-card button')).toHaveCount(publicCards.length);
    expect(
      await host
        .locator('.played-card button')
        .evaluateAll((cards) => cards.map((c) => c.getAttribute('aria-label'))),
    ).toEqual(publicCards);
    const gameUrl = host.url();
    await host.locator('.table-lobby-link').click();
    await host.reload();
    await expect(host.getByRole('link', { name: /回到房间/ })).toBeVisible();
    await host.getByRole('link', { name: /回到房间/ }).click();
    await expect(host).toHaveURL(gameUrl);
    await host.setViewportSize({ width: 390, height: 844 });
    await expect(host.locator('.table-player')).toHaveCount(4);
    expect(await host.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await expect(host.getByRole('button', { name: '打出选中牌' })).toBeInViewport();
    await expect
      .poll(() =>
        host.locator('.game-arena').evaluate((arena) => {
          const boundary = arena.getBoundingClientRect();
          return [...arena.querySelectorAll('.table-player')].every((seat) => {
            const box = seat.getBoundingClientRect();
            return (
              box.left >= boundary.left &&
              box.right <= boundary.right &&
              box.top >= boundary.top &&
              box.bottom <= boundary.bottom
            );
          });
        }),
      )
      .toBe(true);
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await host.locator('.table-lobby-link').click();
    await host.getByRole('button', { name: '离开房间并关闭返回入口' }).click();
    await createRoom(host);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
