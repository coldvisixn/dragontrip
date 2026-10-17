/* End-to-end local HTB research, real backend/imports/restart, isolated data. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { spawn } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { navigate } = require('./navigation.cjs');
(async () => {
  const storage = mkdtempSync(join(tmpdir(), 'dragontrip-investigation-'));
  const screenshots = '/tmp/dragontrip-investigation-screenshots';
  mkdirSync(screenshots, { recursive: true });
  const token = randomBytes(32).toString('hex');
  let child, port, browser, page;
  async function launch() {
    const frozen = process.env.DRAGONTRIP_TEST_BACKEND;
    child = spawn(resolve(frozen || '.venv/bin/python'), frozen ? [] : ['-m', 'dragontrip'], { cwd: resolve('backend'), env: { ...process.env, DRAGONTRIP_TOKEN: token, DRAGONTRIP_DEV: '1', XDG_DATA_HOME: storage } });
    child.stderr.on('data', (d) => process.stderr.write(d));
    port = await new Promise((ok, fail) => {
      const timer = setTimeout(() => fail(new Error('Backend timeout')), 20000);
      child.stdout.on('data', (d) => { const match = String(d).match(/DRAGONTRIP_READY (\d+)/); if (match) { clearTimeout(timer); ok(Number(match[1])); } });
      child.once('exit', () => { clearTimeout(timer); fail(new Error('Backend exited')); });
    });
  }
  async function stop() { if (child?.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); } }
  async function request(path, method = 'GET', body) {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.ok(r.ok, `${path}: ${r.status} ${await r.clone().text()}`); return r.json();
  }
  async function bridge(page) {
    await page.exposeFunction('__dragontripTestConnection', () => ({ port, token }));
    await page.addInitScript(() => { window.__TAURI_INTERNALS__ = { invoke: async (command) => { if (command === 'backend_connection') return window.__dragontripTestConnection(); throw new Error(command); } }; });
  }
  try {
    await launch();
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await bridge(page);
    await page.goto('http://localhost:1420');
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByLabel('Project name').fill('HTB investigation');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await page.getByRole('tab', { name: 'Network Graph', exact: true }).waitFor();
    const pid = await page.evaluate(() => localStorage.getItem('dragontrip.project'));
    console.log('Import → endpoint → observation');
    await navigate(page, 'Import results');
    await page.getByLabel('Tool export file').setInputFiles(resolve('tests/fixtures/imports/burp-items.xml'));
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Preview import', exact: true }).click();
    await page.getByRole('button', { name: 'Import selected records', exact: true }).click();
    await page.getByText('Import saved.', { exact: false }).waitFor();
    const observations = await request(`/projects/${pid}/observations`);
    const observation = observations.items[0];
    const data = await request(`/projects/${pid}`);
    const endpoint = data.nodes.find((n) => n.id === observation.node_id);
    await navigate(page, 'Web applications');
    await page.getByLabel('Web application', { exact: true }).selectOption(endpoint.attrs.origin);
    await page.getByRole('button', { name: endpoint.label, exact: true }).click();
    const observed = page.locator('.import-observations > details').first();
    await observed.locator(':scope > summary').click();
    await observed.getByRole('button', { name: 'Create linked record', exact: true }).click();
    await page.getByRole('button', { name: 'Edit note', exact: true }).click();
    await page.getByLabel('Content', { exact: true }).fill('Hypothesis: endpoint may expose useful behavior.\nNext check: review response.');
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await page.getByRole('button', { name: 'Edit note', exact: true }).waitFor();
    const notes = await request(`/projects/${pid}/knowledge?kind=note`);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].content.source.observation_id, observation.id);
    console.log('Hypothesis → task → unsaved draft → page changes');
    await page.locator('.knowledge-article .source-actions').getByRole('button', { name: 'Create linked record', exact: true }).click();
    await page.getByLabel('Content', { exact: true }).fill('Check: review endpoint response.\nResult: unsuccessful; response required authentication.');
    await page.getByLabel('Status', { exact: true }).selectOption('done');
    await page.getByRole('button', { name: 'Save task', exact: true }).click();
    await page.getByRole('button', { name: 'New task', exact: true }).waitFor();
    const tasks = await request(`/projects/${pid}/knowledge?kind=task`);
    assert.equal(tasks[0].content.record_ids[0], notes[0].id);
    await navigate(page, 'Notes');
    await page.getByRole('button', { name: 'Edit note', exact: true }).click();
    await page.getByLabel('Content', { exact: true }).fill('My unsaved reasoning survives navigation and restart.');
    await navigate(page, 'Web applications');
    assert.equal(await page.getByLabel('Web application', { exact: true }).inputValue(), endpoint.attrs.origin);
    await page.getByRole('heading', { name: endpoint.label, exact: true }).waitFor();
    await navigate(page, 'Notes');
    assert.equal(await page.getByLabel('Content', { exact: true }).inputValue(), 'My unsaved reasoning survives navigation and restart.');
    await page.waitForFunction(() => document.querySelector('.draft-status')?.textContent.includes('saved on this device'));
    console.log('Restart backend and browser context restoration');
    await stop(); await launch();
    // Force recovery from SQLite, independent of browser workspace cache.
    await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.startsWith('dragontrip.workspace:')) localStorage.removeItem(key); });
    await page.reload();
    await page.getByLabel('Content', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Content', { exact: true }).inputValue(), 'My unsaved reasoning survives navigation and restart.');
    console.log('Conflict → manual merge with retained recovery');
    const current = await request(`/projects/${pid}/knowledge/${notes[0].id}`);
    await request(`/projects/${pid}/knowledge/${current.id}`, 'PUT', { kind: 'note', title: current.title, content: { ...current.content, body: 'Saved in another editor.' }, expected_updated: current.updated });
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await page.getByText('This record changed', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Merge manually in editor', exact: true }).click();
    await page.getByLabel('Content', { exact: true }).fill('Merged reasoning, including the saved observation.');
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await page.getByRole('button', { name: 'Edit note', exact: true }).waitFor();
    assert.equal((await request(`/projects/${pid}/knowledge/${current.id}`)).content.body, 'Merged reasoning, including the saved observation.');
    console.log('Save succeeds while screen refresh fails');
    await page.getByRole('button', { name: 'Edit note', exact: true }).click();
    await page.getByLabel('Content', { exact: true }).fill('Saved despite failed refresh.');
    await page.route(`**/projects/${pid}?compact=true`, (route) => route.abort());
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await page.getByText('Record saved. Screen refresh failed;', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Edit note', exact: true }).waitFor();
    await page.unroute(`**/projects/${pid}?compact=true`);
    assert.equal((await request(`/projects/${pid}/knowledge?kind=note`)).length, 1);
    console.log('Minimum window, themes, compact density and keyboard navigation');
    await page.setViewportSize({ width: 1000, height: 650 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.density = 'compact'; document.documentElement.dataset.reducedMotion = 'true'; document.querySelector('.main').scrollTop = 0; }, theme);
      await page.screenshot({ path: join(screenshots, `notebook-${theme}-1000.png`), fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'horizontal document overflow');
    }
    await page.getByRole('tab', { name: 'Notes', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await page.getByRole('heading', { name: 'Findings', exact: true }).waitFor();
    await page.keyboard.press('Alt+ArrowLeft');
    await page.getByRole('heading', { name: 'Notes', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: real import, linked note/task, retained unsuccessful result, navigation, SQLite restart recovery, conflict, refresh failure, compact themes and keyboard.');
  } catch (e) { console.error(e); if (page) { await page.screenshot({ path: join(screenshots, 'failure.png'), fullPage: true }).catch(() => {}); console.error(await page.locator('body').innerText().catch(() => 'Page closed')); } process.exitCode = 1; }
  finally { await browser?.close(); await stop(); rmSync(storage, { recursive: true, force: true }); }
})();
