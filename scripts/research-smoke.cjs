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
    await navigate(page, 'Targets & scope');
    await page.getByLabel('Included targets').fill('app.htb\nadmin.htb\n10.10.10.0/24');
    await page.getByLabel('Excluded targets').fill('blocked.htb');
    await page.getByRole('button', { name: 'Save scope', exact: true }).click();
    await page.getByText('Scope saved. Exclusions take precedence.').waitFor();
    async function importFixture(name, duplicate = false) {
      await navigate(page, 'Import results');
      await page
        .getByLabel('Tool export file')
        .setInputFiles(resolve('tests/fixtures/imports/' + name));
      await page.getByRole('button', { name: 'Preview import', exact: true }).click();
      await page.locator('.import-preview').waitFor();
      if (name === 'burp-items.xml' && !duplicate) {
        assert.match(await page.locator('.import-counts').innerText(), /2 applications/);
        assert.match(await page.locator('.import-counts').innerText(), /3 endpoints/);
        assert.equal((await request(`/projects/${pid}`)).nodes.length, 0);
        await page.screenshot({ path: join(screenshots, 'research-preview.png') });
      }
      await page
        .getByRole('button', {
          name: duplicate ? 'Confirm existing source' : 'Import selected records',
          exact: true,
        })
        .click();
      await page
        .getByText(
          duplicate
            ? 'This source was already imported. No records changed.'
            : 'Import saved. Open Web applications, Findings or Network Graph to investigate.',
        )
        .waitFor();
    }
    await importFixture('burp-items.xml');
    let graph = await request(`/projects/${pid}`);
    const initialCount = graph.nodes.length;
    await importFixture('burp-items.xml', true);
    assert.equal((await request(`/projects/${pid}`)).nodes.length, initialCount);
    await importFixture('burp-issues.xml');
    await navigate(page, 'Web applications');
    await page.getByLabel('Web application', { exact: true }).selectOption('http://app.htb');
    await page.getByLabel('Endpoint method').selectOption('POST');
    await page.getByRole('button', { name: 'POST http://app.htb/login?q=1', exact: true }).click();
    await page.locator('.import-observations details summary').first().click();
    assert.match(await page.locator('.import-observations').innerText(), /POST/);
    await page.getByRole('button', { name: 'View original source', exact: true }).click();
    await page.locator('.source-evidence pre').waitFor();
    assert.match(await page.locator('.source-evidence pre').innerText(), /DOCTYPE items/);
    await page.screenshot({ path: join(screenshots, 'research-web-map.png') });
    await page.locator('.endpoint-detail .source-actions').first().getByRole('button', { name: 'Create linked record', exact: true }).click();
    await page.getByRole('button', { name: 'Edit note', exact: true }).click();
    await page.locator('.knowledge-editor').waitFor();
    await page.getByLabel('Title', { exact: true }).fill('Manual endpoint context');
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await page.getByRole('heading', { name: 'Manual endpoint context', exact: true }).waitFor();
    await navigate(page, 'Network Graph');
    await page.locator('.react-flow').waitFor();
    assert.equal(await page.locator('.object-card.endpoint').count(), 0);
    assert.equal(await page.locator('.object-card.application').count(), 2);
    await page.screenshot({ path: join(screenshots, 'research-graph-overview.png') });
    graph = await request(`/projects/${pid}`);
    const runs = await request(`/projects/${pid}/tool-imports`);
    assert.equal(runs.length, 2);
    assert.equal((await request(`/projects/${pid}/knowledge?kind=finding`)).length, 1);
    assert.equal(
      (await request(`/projects/${pid}/knowledge?kind=note`))[0].content.node_ids.length,
      1,
    );
    assert.equal((await request(`/projects/${pid}/scan-history`)).total, 0);
    await page.reload();
    await navigate(page, 'Web applications');
    assert.equal(await page.getByLabel('Endpoint method').inputValue(), 'POST');
    await page.getByLabel('Endpoint method').selectOption('all');
    await page.getByLabel('Web application', { exact: true }).selectOption('http://admin.htb');
    await page.getByRole('button', { name: 'GET http://admin.htb/login', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          result: 'PASS',
          scenarios: [
            'scope',
            'read-only preview',
            'Burp items/issues',
            'vhosts',
            'method filters',
            'raw evidence',
            'linked manual note',
            'idempotence',
            'collapsed overview',
            'reload persistence',
          ],
          objects: graph.nodes.length,
          screenshots,
        },
        null,
        2,
      ),
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
