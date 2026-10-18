const { navigate } = require('./navigation.cjs');
/* Offline import UI acceptance with an actual backend and isolated user storage.
   Only Tauri's credential delivery is bridged for Chromium. No tool is launched. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { spawn } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
(async () => {
  const storage = mkdtempSync(join(tmpdir(), 'dragontrip-research-'));
  const screenshots =
    process.env.SCREENSHOT_DIR || join(tmpdir(), 'dragontrip-research-screenshots');
  mkdirSync(screenshots, { recursive: true });
  const token = randomBytes(32).toString('hex');
  let child, browser, port;
  const errors = [];
  async function request(path, method = 'GET', body) {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.ok(r.ok, `${method} ${path}: ${r.status} ${await r.clone().text()}`);
    return r.json();
  }
  try {
    const frozen = process.env.DRAGONTRIP_TEST_BACKEND;
    child = spawn(resolve(frozen || '.venv/bin/python'), frozen ? [] : ['-m', 'dragontrip'], {
      cwd: resolve('backend'),
      env: {
        ...process.env,
        DRAGONTRIP_TOKEN: token,
        DRAGONTRIP_DEV: '1',
        XDG_DATA_HOME: storage,
        XDG_DOWNLOAD_DIR: join(storage, 'downloads'),
      },
    });
    child.stderr.on('data', (data) => process.stderr.write(data));
    port = await new Promise((ok, fail) => {
      const timeout = setTimeout(() => fail(new Error('Backend readiness timed out')), 20000);
      child.stdout.on('data', (data) => {
        const m = String(data).match(/DRAGONTRIP_READY (\d+)/);
        if (m) {
          clearTimeout(timeout);
          ok(Number(m[1]));
        }
      });
      child.once('exit', () => {
        clearTimeout(timeout);
        fail(new Error('Backend exited before ready'));
      });
    });
    const pid = (
      await request('/projects', 'POST', {
        name: 'Experience fixture — portal review and follow-up investigation',
      })
    ).id;
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox'],
    });
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    page.setDefaultTimeout(15000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(
      ({ port, token, pid }) => {
        localStorage.setItem('dragontrip.project', pid);
        window.__TAURI_INTERNALS__ = {
          invoke: async (command) => {
            if (command === 'backend_connection') return { port, token };
            throw new Error(command);
          },
        };
      },
      { port, token, pid },
    );
    await page.goto('http://localhost:1420');
    await page.locator('.main').waitFor();

    await request(`/projects/${pid}/scope`, 'PUT', {
      rules: ['app.htb', 'admin.htb', '10.10.10.0/24'].map((value) => ({ value, mode: 'include' })),
    });
    for (const name of ['nmap.xml', 'burp-items.xml']) {
      const { readFileSync } = require('node:fs');
      async function upload(action, preview_token) {
        const form = new FormData();
        form.set('file', new Blob([readFileSync(resolve('tests/fixtures/imports/' + name))]), name);
        form.set('include_unknown', 'true');
        if (preview_token) form.set('preview_token', preview_token);
        const response = await fetch(
          `http://127.0.0.1:${port}/projects/${pid}/tool-import/${action}`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          },
        );
        assert.ok(response.ok, await response.clone().text());
        return response.json();
      }
      const preview = await upload('preview');
      await upload('apply', preview.preview_token);
    }
    await page.reload();
    const measurements = [];
    for (const theme of ['dark', 'light']) {
      await request('/settings/appearance', 'PUT', { theme, reduced_motion: true });
      await page.reload();
      await page.locator('.main').waitFor();
      for (const [width, height] of [
        [1000, 650],
        [1366, 768],
        [1920, 1080],
      ]) {
        await page.setViewportSize({ width, height });
        for (const destination of ['Network Graph', 'Web applications']) {
          await navigate(page, destination);
          if (destination === 'Network Graph') {
            await page.getByLabel('Find graph object').fill('http');
            const candidate = page.locator('.graph-search .search-results button').first();
            await candidate.click();
            await page.locator('.inspector').waitFor();
          } else {
            await page
              .getByLabel('Web application', { exact: true })
              .selectOption('http://app.htb');
            await page
              .getByRole('button', { name: 'POST http://app.htb/login?q=1', exact: true })
              .click();
          }
          await page.waitForTimeout(350);
          const metrics = await page.evaluate(() => ({
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
            mainWidth: Math.round(document.querySelector('.main').getBoundingClientRect().width),
            mainHeight: Math.round(document.querySelector('.main').getBoundingClientRect().height),
          }));
          measurements.push({ theme, width, height, destination, ...metrics });
          await page.screenshot({
            animations: 'disabled',
            path: join(
              screenshots,
              `${destination === 'Network Graph' ? 'graph' : 'web'}-${theme}-${width}.png`,
            ),
          });
        }
      }
    }
    require('node:fs').writeFileSync(
      join(screenshots, 'measurements.json'),
      JSON.stringify({ measurements, errors }, null, 2),
    );
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log(JSON.stringify({ screenshots, measurements }, null, 2));
  } finally {
    if (browser) await browser.close();
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
    rmSync(storage, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
