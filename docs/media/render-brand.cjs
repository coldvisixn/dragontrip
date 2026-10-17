// Render the self-contained SVG social card to GitHub's recommended 1280 × 640 PNG.
const { chromium } = require('playwright-core');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 640 },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      '<style>body{margin:0}</style>' +
        readFileSync(resolve('docs/media/social-preview.svg'), 'utf8'),
    );
    await page.locator('body > svg').screenshot({ path: resolve('docs/media/social-preview.png') });
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
