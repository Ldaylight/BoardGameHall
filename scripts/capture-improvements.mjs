import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('.artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
try {
  await page.goto('http://localhost:5173/lobby');
  await page.getByText('已连接 · 实时同步').waitFor();
  await page.locator('.heading-buttons').getByRole('button', { name: '创建房间' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '创建房间', exact: true }).click();
  await page.waitForURL(/\/room\//);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '添加 AI' }).first().click();
    await page.locator('.seat-card .avatar-ai').nth(i).waitFor();
  }
  await page.getByRole('button', { name: '我准备好了' }).click();
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.waitForURL(/\/game\//);
  await page.locator('.hand-slot button').last().waitFor();
  await page.waitForTimeout(1000);
  const cards = () => page.locator('.hand-slot button:not([disabled])');
  if (!(await cards().count())) {
    await page.getByRole('button', { name: '摸一张' }).click();
    await page.waitForTimeout(250);
  }
  if (await cards().count()) {
    await cards().first().click();
    await page.getByRole('button', { name: '打出选中牌' }).click();
    if (await page.locator('.color-picker').count())
      await page.locator('.color-picker button').first().click();
  }
  await page.locator('.played-card').first().waitFor();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: '.artifacts/game-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(1000);
  console.log(
    'MOBILE:',
    await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      seats: [...document.querySelectorAll('.table-player')].map((seat) => ({
        width: getComputedStyle(seat).width,
        left: seat.getBoundingClientRect().left,
        top: seat.getBoundingClientRect().top,
      })),
    })),
  );
  await page.screenshot({ path: '.artifacts/game-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('http://localhost:5173/settings');
  await page.getByRole('button', { name: /星云紫/ }).click();
  await page.waitForTimeout(500);
  console.log(
    'THEME:',
    await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      panel: getComputedStyle(document.querySelector('.panel')).background,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--mint'),
    })),
  );
  await page.screenshot({ path: '.artifacts/settings-violet.png', fullPage: true });
  await page.getByRole('link', { name: /回到房间/ }).click();
  await page.waitForURL(/\/game\//);
  await page.waitForTimeout(600);
  await page.screenshot({ path: '.artifacts/game-violet.png', fullPage: true });
  await page.getByRole('button', { name: '牌局动态', exact: true }).click();
  await page.screenshot({ path: '.artifacts/game-drawer.png', fullPage: true });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('link', { name: '主题设置', exact: true }).click();
  await page.getByRole('button', { name: /霓虹星河/ }).click();
  await page.screenshot({ path: '.artifacts/settings-gradients.png', fullPage: true });
  await page.getByRole('link', { name: /回到房间/ }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '.artifacts/game-nebula.png', fullPage: true });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: '.artifacts/game-landscape.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.locator('.table-lobby-link').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '.artifacts/lobby-violet.png', fullPage: true });
  console.log('Browser errors:', errors);
} finally {
  await browser.close();
}
