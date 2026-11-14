// Renders the PNG icons of the web app manifest from `src/assets/favicon.svg` (AP 6.3) with the
// Chromium of Playwright, a dev dependency; no image library needed. Run once after changing the
// SVG: `node scripts/render-icons.mjs` (needs `npx playwright install chromium`).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const svg = readFileSync(resolve(root, 'src/assets/favicon.svg'), 'utf8').replace(
  /<!--[\s\S]*?-->\s*/,
  '',
);

// Maskable icons keep their motif inside the central circle of 80 % (W3C manifest, "safe zone"):
// a full-bleed tile and the candles scaled to 80 % around the centre.
const maskable = svg
  .replace(/<rect width="32" height="32" rx="7"/, '<rect width="32" height="32"')
  .replace('<g ', '<g transform="translate(16 16) scale(0.8) translate(-16 -16)" ');

const icons = [
  { file: 'src/assets/icons/icon-192.png', size: 192, source: svg },
  { file: 'src/assets/icons/icon-512.png', size: 512, source: svg },
  { file: 'src/assets/icons/icon-maskable-512.png', size: 512, source: maskable },
];

const browser = await chromium.launch();
try {
  for (const { file, size, source } of icons) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}`;
    await page.setContent(
      `<html><body style="margin:0;background:transparent"><img src="${dataUrl}" width="${size}" height="${size}" style="display:block"></body></html>`,
    );
    await page.locator('img').evaluate((img) => img.decode());
    await page.screenshot({ path: resolve(root, file), omitBackground: true });
    await page.close();
    console.log(`wrote ${file}`);
  }
} finally {
  await browser.close();
}
