/* Capture the real React UI + local Python API with authored fixtures only.
 * Start npm run dev first. This script sends no target traffic and cleans its own data.
 * The Tauri connection bridge is test-only; this is not native-package acceptance.
 */
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdtempSync, mkdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');
const { randomBytes } = require('node:crypto');
const { navigate } = require('../../scripts/navigation.cjs');
(async () => {
  const storage = mkdtempSync(join(tmpdir(), 'dragontrip-showcase-'));
  const output = resolve(process.env.DRAGONTRIP_MEDIA_OUTPUT || 'docs/media');
  const token = randomBytes(32).toString('hex');
  mkdirSync(output, { recursive: true });
  let child, browser, context, page, port;
  async function request(path) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.ok(response.ok, `${path}: ${response.status}`);
    return response.json();
  }
  const hold = (ms = 1200) => page.waitForTimeout(ms); // Let viewers read each real screen.
  async function shot(name) {
    await hold(500);
    await page.screenshot({ path: join(output, name + '.png') });
  }
  try {
    child = spawn(resolve('.venv/bin/python'), ['-m', 'dragontrip'], {
      cwd: resolve('backend'),
      env: { ...process.env, DRAGONTRIP_TOKEN: token, DRAGONTRIP_DEV: '1', XDG_DATA_HOME: storage },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stderr.on('data', (d) => process.stderr.write(d));
    port = await new Promise((ok, fail) => {
      const timer = setTimeout(() => fail(new Error('Backend timeout')), 20000);
      child.stdout.on('data', (d) => {
        const match = String(d).match(/DRAGONTRIP_READY (\d+)/);
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
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox'],
    });
    context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(
      ({ port, token }) => {
        localStorage.setItem(
          'dragontrip.appearance',
          JSON.stringify({
            theme: 'dark',
            accent: 'purple',
            density: 'compact',
            reduced_motion: true,
            graph_detail: 'auto',
          }),
        );
        window.__TAURI_INTERNALS__ = {
          invoke: async (command) => {
            if (command === 'backend_connection') return { port, token };
            throw new Error(command);
          },
        };
      },
      { port, token },
    );
    await page.goto('http://localhost:1420');
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByLabel('Project name').fill('[DEMO] Portal review');
    await page
      .getByLabel('Investigation goal', { exact: true })
      .fill('Review access boundaries from imported evidence and plan a manual follow-up.');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await page.getByRole('heading', { name: 'Project overview', exact: true }).waitFor();
    const pid = await page.evaluate(() => localStorage.getItem('dragontrip.project'));
    for (const file of ['portal-nmap.xml', 'portal-burp.xml']) {
      await navigate(page, 'Import results');
      await page.getByLabel('Tool export file').setInputFiles(resolve('docs/media/fixtures', file));
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: 'Preview import', exact: true }).click();
      await page.getByRole('button', { name: 'Import selected records', exact: true }).click();
      await page.getByText('Import saved.', { exact: false }).waitFor();
    }
    await navigate(page, 'Network Graph');
    await page.locator('.react-flow').waitFor();
    await hold();
    await page.locator('.toast').waitFor({ state: 'hidden' });
    const fit = page.getByRole('button', { name: /fit view/i });
    if (await fit.count()) await fit.first().click();
    await shot('research-graph');

    // Start the recording at the imported project, then follow a single observation.
    const recording = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      storageState: await context.storageState(),
      recordVideo: { dir: join(output, 'recording'), size: { width: 1440, height: 960 } },
    });
    await recording.addInitScript(
      ({ port, token }) => {
        window.__TAURI_INTERNALS__ = {
          invoke: async (command) => {
            if (command === 'backend_connection') return { port, token };
            throw new Error(command);
          },
        };
      },
      { port, token },
    );
    const previousPage = page;
    page = await recording.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:1420');
    await page.locator('.react-flow').waitFor();
    await hold(2000);
    await navigate(page, 'Web applications');
    await page
      .getByLabel('Web application', { exact: true })
      .selectOption('https://portal.example.test');
    await page
      .getByRole('button', { name: 'GET https://portal.example.test/account', exact: true })
      .click();
    const observed = page.locator('.import-observations > details').first();
    await observed.locator(':scope > summary').click();
    await observed.scrollIntoViewIfNeeded();
    await hold(2200);
    await shot('web-observation');
    await observed.getByRole('button', { name: 'Create linked record', exact: true }).click();
    await page.getByRole('button', { name: 'Edit note', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill('Check account access across roles');
    await page
      .getByLabel('Content', { exact: true })
      .fill(
        '## Observation\nThe imported /account response requires authentication (401).\n\n## Hypothesis\nAccess may depend on the account role. This response alone does not prove a vulnerability.\n\n## Next check\nCompare authorized test accounts and record both successful and unsuccessful checks.\n\nFictional demonstration; no requests were sent.',
      );
    await hold(2300);
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await page.getByRole('button', { name: 'Edit note', exact: true }).waitFor();
    await page.locator('.main').evaluate((el) => {
      el.scrollTop = 0;
    });
    await shot('linked-note');
    await hold(1800);
    await page
      .locator('.knowledge-article .source-actions')
      .getByRole('button', { name: 'Create linked record', exact: true })
      .click();
    await page
      .getByLabel('Title', { exact: true })
      .fill('Compare account access with authorized test roles');
    await page
      .getByLabel('Content', { exact: true })
      .fill(
        'Check: compare expected access for two authorized test roles.\n\nResult: not performed. Keep the source observation and hypothesis linked.\n\nFictional demonstration only.',
      );
    await page.getByRole('button', { name: 'Save task', exact: true }).click();
    await page.getByRole('button', { name: 'New task', exact: true }).waitFor();
    await page.locator('.main').evaluate((el) => {
      el.scrollTop = 0;
    });
    await hold(2300);
    await shot('follow-up-task');
    await navigate(page, 'Notes');
    await page.getByRole('button', { name: 'Edit note', exact: true }).click();
    await page
      .getByLabel('Content', { exact: true })
      .fill(
        'Next session: review the expected role matrix before making any new requests.\n\nFictional demonstration. This draft is saved on this device.',
      );
    await page.waitForFunction(() =>
      document.querySelector('.draft-status')?.textContent.includes('saved on this device'),
    );
    await hold(1700);
    await navigate(page, 'Network Graph');
    await hold(900);
    await navigate(page, 'Notes');
    assert.match(await page.getByLabel('Content', { exact: true }).inputValue(), /Next session/);
    await hold(1800);
    await shot('draft-recovery');
    assert.equal((await request(`/projects/${pid}/scan-history`)).total, 0);
    assert.equal((await request(`/projects/${pid}/knowledge?kind=note`)).length, 1);
    const tasks = await request(`/projects/${pid}/knowledge?kind=task`);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].content.record_ids.length, 1);
    assert.deepEqual(errors, []);
    const video = page.video();
    await recording.close();
    await video.saveAs(join(output, 'investigation.webm'));
    rmSync(join(output, 'recording'), { recursive: true, force: true });
    page = previousPage;
    // Use the actual appearance form for a light-theme screenshot.
    await navigate(page, 'Settings');
    await page.getByLabel('Theme', { exact: true }).selectOption('light');
    await page.getByRole('button', { name: 'Save appearance', exact: true }).click();
    await navigate(page, 'Notes');
    await page.getByText('Check account access across roles', { exact: true }).click();
    const editNote = page.getByRole('button', { name: 'Edit note', exact: true });
    if (await editNote.count()) await editNote.click();
    await page.getByLabel('Content', { exact: true }).waitFor();
    const lightDraft =
      'Next session: review the expected role matrix before making any new requests.\n\nThe /account observation remains linked above. No manual check has been performed.\n\nFictional demonstration. Keep this draft for the next session.';
    await page.getByLabel('Content', { exact: true }).fill(lightDraft);
    await page.waitForFunction(() =>
      document.querySelector('.draft-status')?.textContent.includes('saved on this device'),
    );
    await navigate(page, 'Network Graph');
    await navigate(page, 'Notes');
    assert.equal(await page.getByLabel('Content', { exact: true }).inputValue(), lightDraft);
    await page.locator('.main').evaluate((el) => {
      el.scrollTop = 0;
    });
    await shot('draft-light');
    console.log(
      'Captured real graph, imported observation, linked note/task and draft recovery; no target traffic.',
    );
  } catch (error) {
    if (page) {
      await page.screenshot({ path: join(output, 'capture-failure.png') }).catch(() => {});
      console.error(
        await page
          .locator('body')
          .innerText()
          .catch(() => 'Page closed'),
      );
    }
    throw error;
  } finally {
    await browser?.close();
    if (child?.exitCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
    rmSync(storage, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
