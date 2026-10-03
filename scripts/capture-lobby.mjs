import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('.artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text());
  });
  await page.goto('http://localhost:5173/lobby');
  await page.getByText('已连接 · 实时同步').waitFor();
  await page.screenshot({ path: '.artifacts/lobby-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.artifacts/lobby-mobile.png', fullPage: true });
  console.log('Final lobby screenshots saved, no rooms created.');
} finally {
  await browser.close();
}
