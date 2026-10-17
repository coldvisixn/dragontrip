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
    const pid = (await request('/projects', 'POST', { name: 'Research acceptance' })).id;
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox'],
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
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
      rules: [{ value: 'app.htb' }, { value: 'admin.htb' }, { value: '10.10.10.0/24' }],
    });
    await request(`/projects/${pid}/web-objects`, 'POST', {
      url: 'http://app.htb/login',
      method: 'GET',
      ip: '10.10.10.10',
    });
    await request(`/projects/${pid}/web-objects`, 'POST', {
      url: 'http://app.htb/api/profile',
      method: 'POST',
      ip: '10.10.10.10',
    });
    await request(`/projects/${pid}/web-objects`, 'POST', {
      url: 'http://admin.htb/',
      ip: '10.10.10.10',
    });
    await page.reload();
    await navigate(page, 'Web applications');
    await page.getByLabel('Web application', { exact: true }).selectOption('http://app.htb');
    await page.getByRole('button', { name: 'GET http://app.htb/login', exact: true }).click();
    assert.equal(await page.locator('.sidebar nav button').count(), 6);
    assert.equal(
      await page.getByRole('tab', { name: 'Web applications' }).getAttribute('aria-selected'),
      'true',
    );
    await page.getByRole('button', { name: 'Recon', exact: true }).click();
    await page.getByRole('button', { name: 'Research', exact: true }).click();
    assert.equal(
      await page.getByRole('tab', { name: 'Web applications' }).getAttribute('aria-selected'),
      'true',
    );
    await page.getByLabel('Web application', { exact: true }).selectOption('http://app.htb');
    await page.getByRole('button', { name: 'GET http://app.htb/login', exact: true }).click();
    await page.locator('.endpoint-detail .source-actions').getByRole('button', { name: 'Create linked record', exact: true }).click();
    await page.getByRole('button', { name: 'Edit note', exact: true }).click();
    await page.locator('.knowledge-editor').waitFor();
    assert.equal(
      await page.getByRole('tab', { name: 'Notes', exact: true }).getAttribute('aria-selected'),
      'true',
    );
    assert.equal(
      await page
        .getByRole('button', { name: 'Notebook', exact: true })
        .getAttribute('aria-current'),
      'page',
    );
    await page.getByLabel('Title', { exact: true }).fill('Session review context');
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await page.getByRole('heading', { name: 'Session review context' }).waitFor();
    await page.screenshot({ path: join(screenshots, 'navigation-investigation.png') });
    await navigate(page, 'Web applications');
    await page.getByLabel('Web application', { exact: true }).selectOption('http://app.htb');
    await page.getByRole('button', { name: 'GET http://app.htb/login', exact: true }).click();
    await page.screenshot({ path: join(screenshots, 'navigation-expanded.png') });
    const sidebarScroll = await page
      .locator('.sidebar')
      .evaluate((s) => ({ height: s.clientHeight, scroll: s.scrollHeight }));
    assert.ok(sidebarScroll.scroll <= sidebarScroll.height + 2, JSON.stringify(sidebarScroll));
    await page.getByRole('tab', { name: 'Web applications' }).focus();
    await page.keyboard.press('Home');
    await page.getByRole('tab', { name: 'Network Graph' }).waitFor();
    assert.equal(
      await page.getByRole('tab', { name: 'Network Graph' }).getAttribute('aria-selected'),
      'true',
    );
    assert.ok(
      await page
        .getByRole('tab', { name: 'Network Graph' })
        .evaluate((tab) => tab === document.activeElement),
    );
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(
      () => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent === 'Hosts',
    );
    assert.ok(
      await page
        .getByRole('tab', { name: 'Hosts' })
        .evaluate((tab) => tab === document.activeElement),
    );
    await page.getByRole('button', { name: 'Go back' }).click();
    await page.getByRole('button', { name: 'Go back' }).click();
    assert.equal(
      await page.getByRole('tab', { name: 'Web applications' }).getAttribute('aria-selected'),
      'true',
    );
    await page.getByLabel('Web application', { exact: true }).selectOption('http://app.htb');
    await page.getByRole('button', { name: 'GET http://app.htb/login', exact: true }).click();
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    assert.ok(await page.locator('.sidebar').evaluate((s) => s.clientWidth < 100));
    await page.screenshot({ path: join(screenshots, 'navigation-collapsed.png') });
    await page.reload();
    await page.getByRole('button', { name: 'Expand sidebar' }).waitFor();
    await page.keyboard.press('Control+k');
    await page.getByLabel('Search commands').fill('Tools');
    await page.getByRole('dialog').getByRole('button', { name: 'Tools', exact: true }).click();
    await page.getByRole('heading', { name: 'Tool integrations' }).waitFor();
    assert.equal(
      await page.getByRole('tab', { name: 'Tools', exact: true }).getAttribute('aria-selected'),
      'true',
    );
    await page.setViewportSize({ width: 1000, height: 650 });
    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    const smallSidebar = await page
      .locator('.sidebar')
      .evaluate((s) => ({ height: s.clientHeight, scroll: s.scrollHeight }));
    assert.ok(smallSidebar.scroll <= smallSidebar.height + 2, JSON.stringify(smallSidebar));
    assert.deepEqual(errors, []);
    console.log(
      'PASS: 6 sidebar links, grouped tabs, remembered section, deep links, keyboard navigation, Back, collapsed persistence and command palette',
    );
  } finally {
    await browser?.close();
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
    rmSync(storage, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
