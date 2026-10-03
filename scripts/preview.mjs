import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('.artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text());
});
try {
  await page.goto('http://localhost:5173/lobby');
  await page.getByText('已连接 · 实时同步').waitFor();
  await page.screenshot({ path: '.artifacts/lobby-desktop.png', fullPage: true });
  await page.locator('.heading-buttons').getByRole('button', { name: '创建房间' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '创建房间', exact: true }).click();
  await page.waitForURL(/\/room\//);
  await page.waitForTimeout(800);
  console.log('ROOM URL:', page.url());
  console.log('ROOM TEXT:', (await page.locator('body').innerText()).slice(-4500));
  await page.screenshot({ path: '.artifacts/room-desktop.png', fullPage: true });
  if (await page.getByRole('button', { name: '添加 AI' }).count()) {
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: '添加 AI' }).first().click();
      await page.locator('.seat-card .avatar-ai').nth(i).waitFor();
    }
    await page.getByRole('button', { name: '我准备好了' }).click();
    await page.getByRole('button', { name: '开始游戏' }).click();
    await page.waitForURL(/\/game\//);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: '.artifacts/game-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '.artifacts/game-mobile.png', fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5173/lobby');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '.artifacts/lobby-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('http://localhost:5173/settings');
  await page.getByRole('button', { name: /星云紫/ }).click();
  await page.screenshot({ path: '.artifacts/settings-violet.png', fullPage: true });
  await page.locator('.brand').click();
  await page.screenshot({ path: '.artifacts/lobby-violet.png', fullPage: true });
} finally {
  await browser.close();
}
