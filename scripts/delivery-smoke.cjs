/* Production UI + real/frozen API acceptance for the 0.8.0 delivery workflow.
   Chromium bridges only native connection delivery; native acceptance uses real IPC. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { spawn } = require('node:child_process');
const {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { navigate } = require('./navigation.cjs');
(async () => {
  const storage = mkdtempSync(join(tmpdir(), 'dragontrip-delivery-'));
  const output = resolve(
    process.env.DRAGONTRIP_VALIDATION_DIR || join(tmpdir(), 'dragontrip-delivery-validation'),
  );
  mkdirSync(join(output, 'screenshots'), { recursive: true });
  const token = randomBytes(32).toString('hex');
  const errors = [];
  let child, browser, page, port;
  async function backend() {
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
      const timer = setTimeout(() => fail(new Error('Backend readiness timeout')), 20000);
      child.stdout.on('data', (data) => {
        const match = String(data).match(/DRAGONTRIP_READY (\d+)/);
        if (match) {
          clearTimeout(timer);
          ok(Number(match[1]));
        }
      });
      child.once('exit', () => {
        clearTimeout(timer);
        fail(new Error('Backend exited'));
      });
    });
  }
  async function request(path, method = 'GET', body) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.ok(
      response.ok,
      `${method} ${path}: ${response.status} ${await response.clone().text()}`,
    );
    return response.json();
  }
  try {
    await backend();
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox'],
    });
    page = await browser.newPage({ viewport: { width: 1366, height: 850 } });
    page.setDefaultTimeout(15000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.exposeFunction('validationConnection', () => ({ port, token }));
    await page.addInitScript(() => {
      window.__TAURI_INTERNALS__ = {
        invoke: async (command) => {
          if (command === 'backend_connection') return window.validationConnection();
          throw new Error(command);
        },
      };
    });
    await page.goto('http://localhost:1420');
    await page.getByRole('button', { name: 'Create fictional demo', exact: true }).click();
    await page.locator('.graph-toolbar').waitFor();
    const demoPid = await page.evaluate(() => localStorage.getItem('dragontrip.project'));
    assert.equal((await request(`/projects/${demoPid}`)).scans.length, 0);
    await navigate(page, 'Projects');
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByLabel('Project name', { exact: true }).fill('Delivery acceptance');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await page.getByRole('heading', { name: 'Start with the evidence you already have' }).waitFor();
    const pid = await page.evaluate(() => localStorage.getItem('dragontrip.project'));
    assert.notEqual(pid, demoPid);
    await page.screenshot({ path: join(output, 'screenshots/start-project.png') });
    await page.getByRole('button', { name: 'Define target scope', exact: true }).click();
    await page.getByLabel('Included targets').fill('app.htb\nadmin.htb\n10.10.10.0/24');
    await page.getByRole('button', { name: 'Save scope', exact: true }).click();
    await page.getByText('Scope saved. Exclusions take precedence.').waitFor();
    await navigate(page, 'Import results');
    await page
      .getByLabel('Tool export file')
      .setInputFiles(resolve('tests/fixtures/imports/burp-items.xml'));
    await page.getByRole('button', { name: 'Preview import', exact: true }).click();
    await page.getByRole('button', { name: 'Import selected records', exact: true }).click();
    await page
      .getByText('Import saved. Open Web applications, Findings or Network Graph to investigate.')
      .waitFor();
    await navigate(page, 'Findings');
    await page.getByRole('button', { name: 'New finding', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill('Manual fixture review');
    await page.getByRole('button', { name: 'Use finding template', exact: true }).click();
    await page
      .getByLabel('Description and evidence')
      .fill(
        'Explicit test finding: manual review of an owned fixture.\n\nNo real vulnerability claim.',
      );
    await navigate(page, 'Notes');
    await navigate(page, 'Findings');
    await page.getByRole('button', { name: 'New finding', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).isEnabled();
    await page.waitForFunction(
      () => document.querySelector('.knowledge-editor input')?.value === 'Manual fixture review',
    );
    const screenshot = await page.screenshot();
    await page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'fixture-proof.png', { type: 'image/png' }));
      document
        .querySelector('[aria-label="Evidence upload: paste a screenshot or drop files"]')
        .dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: transfer }));
    }, screenshot.toString('base64'));
    await page.getByRole('checkbox', { name: /fixture-proof.png/ }).waitFor();
    await page.getByLabel('Status', { exact: true }).selectOption('confirmed');
    await page.getByRole('button', { name: 'Save finding', exact: true }).click();
    await page.getByRole('heading', { name: 'Manual fixture review', exact: true }).waitFor();
    await page.getByText('Record a retest', { exact: true }).click();
    await page.getByLabel('Retest result').selectOption('still_present');
    await page
      .getByLabel('Retest notes')
      .fill('Fixture retest: recorded explicit manual verification and retained the screenshot.');
    await page.getByRole('button', { name: 'Save retest', exact: true }).click();
    await page
      .getByText(
        'Fixture retest: recorded explicit manual verification and retained the screenshot.',
        { exact: true },
      )
      .waitFor();
    await page.screenshot({ path: join(output, 'screenshots/finding-retest.png') });
    await navigate(page, 'Reports');
    await page
      .getByLabel('Executive summary')
      .fill('Owned synthetic fixture exercise. Evidence reviewed; no real target was scanned.');
    await page.getByLabel('Export format').selectOption('bundle');
    await page.getByRole('checkbox', { name: /fixture-proof.png/ }).check();
    await page.getByRole('button', { name: 'Generate preview', exact: true }).click();
    await page.getByRole('heading', { name: 'Manual fixture review', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Export bundle', exact: true }).click();
    const message = await page.getByRole('status').filter({ hasText: 'Saved:' }).innerText();
    const file = message.match(/^Saved: (.*?) · SHA-256/)[1];
    assert.equal(readFileSync(file).subarray(0, 2).toString(), 'PK');
    copyFileSync(file, join(output, 'sample-deliverable.zip'));
    await page.getByLabel('Export format').selectOption('html');
    await page.getByRole('button', { name: 'Generate preview', exact: true }).click();
    await page.getByRole('button', { name: 'Export HTML', exact: true }).click();
    const htmlMessage = await page.getByRole('status').filter({ hasText: 'Saved:' }).innerText();
    const htmlPath = htmlMessage.match(/^Saved: (.*?) · SHA-256/)[1];
    copyFileSync(htmlPath, join(output, 'sample-report.html'));
    await page.locator('#main-content').evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({ path: join(output, 'screenshots/report-delivery.png') });
    for (const width of [1366, 1000]) {
      await page.setViewportSize({ width, height: width === 1000 ? 650 : 768 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
    }
    // Force the local mirror out: the next recovery must come from the restarted SQLite backend.
    await page.waitForFunction(() =>
      document.querySelector('.report-options')?.textContent.includes('Draft saved on this device'),
    );
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage))
        if (key.startsWith('dragontrip.draft:')) localStorage.removeItem(key);
    });
    child.kill('SIGTERM');
    await once(child, 'exit');
    await backend();
    await page.reload();
    await navigate(page, 'Reports');
    await page.waitForFunction(() =>
      document.querySelector('textarea')?.value.includes('Owned synthetic fixture exercise'),
    );
    assert.equal(await page.getByLabel('Export format').inputValue(), 'html');
    const external = [];
    const standalone = await browser.newPage();
    standalone.on('request', (r) => {
      if (/^https?:/.test(r.url())) external.push(r.url());
    });
    await standalone.setContent(readFileSync(htmlPath, 'utf8'));
    await standalone.getByRole('heading', { name: 'Manual fixture review', exact: true }).waitFor();
    assert.deepEqual(external, []);
    await standalone.screenshot({
      path: join(output, 'screenshots/standalone-report.png'),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    writeFileSync(
      join(output, 'browser-results.json'),
      JSON.stringify(
        {
          passed: true,
          backend: process.env.DRAGONTRIP_TEST_BACKEND ? 'frozen' : 'source',
          checks: [
            'isolated fictional demo',
            'new project onboarding',
            'scope and Burp import',
            'finding draft recovery',
            'pasted screenshot',
            'append-only retest',
            'HTML and ZIP export',
            '1366/1000px viewport fit',
            'report recovery after backend restart without local mirror',
            'standalone HTML without external requests',
          ],
          page_errors: errors,
        },
        null,
        2,
      ) + '\n',
    );
    console.log('PASS: 0.8.0 delivery workflow; evidence:', output);
  } catch (error) {
    if (page) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    if (browser) await browser.close();
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
