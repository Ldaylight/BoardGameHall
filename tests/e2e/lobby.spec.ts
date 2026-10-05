import { test, expect } from '@playwright/test';
test('desktop catalog, search, filters, drawer and room + AI + refresh', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/lobby');
  await expect(page.getByText('已连接 · 实时同步')).toBeVisible();
  await expect(page.locator('.game-tile')).toHaveCount(8);
  for (const name of ['炸弹猫', '麻将', '台球']) {
    const tile = page.locator('.game-tile').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await expect(tile.getByRole('button', { name: '敬请期待' })).toBeDisabled();
  }
  await page.screenshot({ path: '.artifacts/catalog-eight-games.png', fullPage: true });
  await page.getByRole('textbox', { name: '搜索游戏' }).fill('炸弹猫');
  await expect(page.locator('.game-tile')).toHaveCount(1);
  await page.getByRole('button', { name: '清除搜索' }).click();
  await page.locator('.toolbar-tabs').getByRole('button', { name: '运动', exact: true }).click();
  await expect(page.locator('.tile-title h3')).toHaveText('台球');
  await page
    .locator('.toolbar-tabs')
    .getByRole('button', { name: /全部游戏/ })
    .click();
  await page.getByRole('textbox', { name: '搜索游戏' }).fill('五子棋');
  await expect(page.locator('.game-tile')).toHaveCount(1);
  await expect(page.locator('.tile-title h3')).toHaveText('五子棋');
  await page.getByRole('button', { name: '清除搜索' }).click();
  await expect(page.locator('.game-tile')).toHaveCount(8);
  await page.locator('.toolbar-tabs').getByRole('button', { name: '棋类', exact: true }).click();
  await expect(page.locator('.game-tile')).toHaveCount(2);
  await page
    .locator('.toolbar-tabs')
    .getByRole('button', { name: /全部游戏/ })
    .click();
  await page.getByRole('button', { name: '打开好友与邀请' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('.heading-buttons').getByRole('button', { name: '创建房间' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '创建房间', exact: true }).click();
  await expect(page).toHaveURL(/\/room\//);
  await page.getByRole('button', { name: '添加 AI' }).first().click();
  await expect(page.locator('.seat-card .avatar-ai')).toHaveCount(1);
  await page.getByRole('textbox', { name: '聊天消息' }).fill('大家好');
  await page.getByRole('button', { name: '发送消息' }).click();
  await expect(page.locator('.chat-message')).toContainText('大家好');
  await page.getByRole('button', { name: '我准备好了' }).click();
  await page.getByRole('button', { name: '开始游戏' }).click();
  await expect(page).toHaveURL(/\/game\//);
  await expect(page.locator('.hand-slot')).toHaveCount(7);
  await expect(page.locator('.hand-slot button').first()).toHaveCSS('opacity', '1');
  const handBounds = await page.locator('.hand-content').boundingBox();
  expect(
    Math.abs(handBounds!.x + handBounds!.width / 2 - (await page.evaluate(() => innerWidth)) / 2),
  ).toBeLessThan(2);
  await page.screenshot({ path: '.artifacts/uno-hand-centered-desktop.png' });
  const hand = await page
    .locator('.hand-slot button')
    .evaluateAll((cards) => cards.map((c) => c.getAttribute('aria-label')));
  await page.reload();
  await expect(page.locator('.hand-slot')).toHaveCount(7);
  expect(
    await page
      .locator('.hand-slot button')
      .evaluateAll((cards) => cards.map((c) => c.getAttribute('aria-label'))),
  ).toEqual(hand);
  expect(errors).toEqual([]);
});
test('mobile navigation and creation without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lobby');
  await expect(page.locator('.game-tile')).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: '展开导航' }).click();
  await expect(page.locator('.sidebar.mobile-open')).toBeVisible();
  await page.getByRole('button', { name: '关闭导航' }).click();
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await expect(page.locator('.mobile-filter-panel')).toBeVisible();
  await page.locator('.heading-buttons').getByRole('button', { name: '房间码加入' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('two independent players join, ready, chat, play a card and use mobile table', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const a = await contextA.newPage();
  const b = await contextB.newPage();
  const errors: string[] = [];
  for (const page of [a, b]) {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
  }
  try {
    await a.goto('/lobby');
    await expect(a.getByText('已连接 · 实时同步')).toBeVisible();
    await a.locator('.heading-buttons').getByRole('button', { name: '创建房间' }).click();
    await a.getByRole('dialog').getByLabel('座位数量').selectOption('2');
    await a.getByRole('dialog').getByRole('button', { name: '创建房间', exact: true }).click();
    await expect(a.locator('.room-code')).toBeVisible();
    const code = (await a.locator('.room-code').innerText()).replace('#', '');
    await b.goto('/lobby');
    await expect(b.getByText('已连接 · 实时同步')).toBeVisible();
    await b.locator('.heading-buttons').getByRole('button', { name: '房间码加入' }).click();
    await b.locator('.room-code-input').fill(code);
    await b.getByRole('button', { name: '加入房间', exact: true }).click();
    await expect(b).toHaveURL(/\/room\//);
    await b.getByRole('textbox', { name: '聊天消息' }).fill('一起玩！');
    await b.getByRole('button', { name: '发送消息' }).click();
    await expect(a.locator('.chat-message')).toContainText('一起玩！');
    await a.getByRole('button', { name: '我准备好了' }).click();
    await b.getByRole('button', { name: '我准备好了' }).click();
    await a.getByRole('button', { name: '开始游戏' }).click();
    await expect(a).toHaveURL(/\/game\//);
    await expect(b).toHaveURL(/\/game\//);
    await expect(a.locator('.hand-slot button').last()).toHaveCSS('opacity', '1');
    const legal = a.locator('.hand-slot button:not([disabled])');
    if (await legal.count()) {
      await legal.first().click();
      await a.getByRole('button', { name: '打出选中牌' }).click();
      if (await a.locator('.color-picker').count()) await a.locator('.color-picker button').first().click();
      await expect(a.locator('.hand-slot')).toHaveCount(6);
      await b.getByRole('button', { name: '牌局动态', exact: true }).click();
      await expect(b.locator('.log-line')).toContainText(['打出']);
      await b.getByRole('button', { name: '关闭', exact: true }).click();
    } else {
      await a.getByRole('button', { name: '摸一张' }).click();
      await expect(a.locator('.hand-slot')).toHaveCount(8);
    }
    const active = (await a.locator('.turn-banner.my-turn').count()) ? a : b;
    const draggable = active.locator('.hand-slot button:not([disabled])');
    if (await draggable.count()) {
      const card = draggable.first();
      const isWild = (await card.getAttribute('aria-label'))?.startsWith('万能牌');
      const before = await active.locator('.hand-slot').count();
      await card.hover({ position: { x: 12, y: 50 } });
      const bounds = await card.boundingBox();
      if (!bounds) throw new Error('card missing');
      await active.mouse.move(bounds.x + 12, bounds.y + 50);
      await active.mouse.down();
      await active.mouse.move(bounds.x + 12, bounds.y - 120, { steps: 12 });
      await active.mouse.up();
      if (isWild) {
        await expect(active.locator('.color-picker')).toBeVisible();
        await active.locator('.color-picker button').first().click();
      }
      await expect(active.locator('.hand-slot')).toHaveCount(before - 1);
      await expect(active.locator('.flying-card')).toHaveCount(0);
    }
    await b.setViewportSize({ width: 390, height: 844 });
    await expect(b.locator('.game-arena')).toBeVisible();
    const handBounds = await b.locator('.hand-content').boundingBox();
    expect(Math.abs(handBounds!.x + handBounds!.width / 2 - 195)).toBeLessThan(2);
    await b.screenshot({ path: '.artifacts/uno-hand-centered-mobile.png' });
    expect(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
