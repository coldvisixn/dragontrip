const { navigate } = require('./navigation.cjs');
/* Real methodology + sequential workflow UI acceptance against an owned loopback server. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { spawn } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { createServer } = require('node:http');
(async () => {
  const storage = mkdtempSync(join(tmpdir(), 'dragontrip-research-'));
  const screenshots =
    process.env.SCREENSHOT_DIR || join(tmpdir(), 'dragontrip-research-screenshots');
  mkdirSync(screenshots, { recursive: true });
  const token = randomBytes(32).toString('hex');
  let child, browser, port;
  const errors = [];
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<title>Dragontrip owned workflow target</title>Local workflow acceptance');
  });
  await new Promise((ok) => server.listen(8089, '127.0.0.1', ok));
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
    const pid = (await request('/projects', 'POST', { name: 'HTB research workspace' })).id;
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
      rules: [
        { value: '127.0.0.1' },
        { value: 'app.htb' },
        { value: 'admin.htb' },
        { value: '10.10.10.0/24' },
      ],
    });
    const app = await request(`/projects/${pid}/web-objects`, 'POST', {
      url: 'http://app.htb/',
      ip: '10.10.10.10',
      application_only: true,
    });
    const custom = await request('/profiles', 'POST', {
      name: 'Inspect lab HTTP service',
      tool: 'nmap',
      ports: '8089',
      scripts: [],
      rate: 20,
      timeout: 60,
    });
    await page.reload();
    await navigate(page, 'Methodologies');
    await page.getByLabel('Methodology object').selectOption(app.id);
    await page.getByRole('button', { name: 'Add methodology', exact: true }).click();
    await page.locator('.methodology-detail').waitFor();
    const states = page.locator('.methodology-check select');
    await states.nth(0).selectOption('tested');
    await states.nth(1).selectOption('in_progress');
    await states.nth(2).selectOption('not_applicable');
    await page
      .locator('.methodology-check textarea')
      .nth(0)
      .fill(
        'Reviewed the exported application surface. Evidence stays linked to the original observations.',
      );
    await page
      .locator('.methodology-check textarea')
      .nth(1)
      .fill(
        'Session and authentication review is in progress; no coverage inferred from scanner output.',
      );
    await page.getByRole('button', { name: 'Save methodology', exact: true }).click();
    await page.getByText('Methodology saved.', { exact: true }).waitFor();
    await page.locator('.main').evaluate((e) => (e.scrollTop = 0));
    await page.screenshot({ path: join(screenshots, 'methodology-coverage.png') });
    const saved = await request(`/projects/${pid}/knowledge?kind=checklist`);
    assert.deepEqual(
      saved[0].content.checks.slice(0, 3).map((c) => c.state),
      ['tested', 'in_progress', 'not_applicable'],
    );
    await navigate(page, 'Recon workflows');
    await page.getByLabel('Workflow name').fill('Lab service → HTTP inspection');
    await page.getByLabel('Step 1 profile').selectOption(custom.id);
    await page.getByLabel('Step 1 target').fill('127.0.0.1');
    await page.getByLabel('Step 2 profile').selectOption('httpx');
    await page.getByLabel('Step 2 target').fill('http://127.0.0.1:8089/');
    await page.getByRole('button', { name: 'Save workflow', exact: true }).click();
    await page.getByRole('button', { name: 'Preview workflow', exact: true }).click();
    await page.locator('.workflow-preview').waitFor();
    assert.equal((await request(`/projects/${pid}/scan-history`)).total, 0);
    await page.getByRole('button', { name: 'Create run', exact: true }).click();
    await page.getByRole('button', { name: 'Run remaining sequence', exact: true }).waitFor();
    await page.getByLabel('I am authorized to run the displayed target and action.').check();
    await page.getByRole('button', { name: 'Run remaining sequence', exact: true }).click();
    await page
      .getByText('Sequence complete. Methodology coverage still requires an explicit review.', {
        exact: true,
      })
      .waitFor({ timeout: 90000 });
    await page.locator('.workflow-editor').evaluate((e) => (e.open = false));
    await page.locator('.main').evaluate((e) => (e.scrollTop = 0));
    await page.screenshot({ path: join(screenshots, 'workflow-complete.png') });
    const history = await request(`/projects/${pid}/scan-history`);
    assert.equal(history.total, 2);
    assert.ok(history.items.every((s) => s.status === 'completed'));
    assert.deepEqual(
      (await request(`/projects/${pid}/knowledge?kind=checklist`))[0].content.checks.map(
        (c) => c.state,
      ),
      saved[0].content.checks.map((c) => c.state),
    );
    await page.reload();
    await navigate(page, 'Methodologies');
    await page.locator('.methodology-list button').first().click();
    assert.equal(await page.locator('.methodology-check select').first().inputValue(), 'tested');
    assert.deepEqual(errors, []);
    console.log(
      'PASS: explicit four-state methodology, persistence, ordered workflow preview, two actual automatically sequenced tools on owned loopback target, saved run history and no inferred coverage',
    );
  } finally {
    await browser?.close();
    await new Promise((ok) => server.close(ok));
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
