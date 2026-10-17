const { navigate } = require('./navigation.cjs');
/* Real planning/reporting UI/API test. Only Tauri credential delivery is bridged in Chromium.
   Run after npm run dev. Uses isolated data and never starts a recon tool. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { spawn } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');

(async () => {
  const storage = mkdtempSync(join(tmpdir(), 'dragontrip-planning-'));
  const screenshots =
    process.env.SCREENSHOT_DIR || join(tmpdir(), 'dragontrip-planning-screenshots');
  mkdirSync(screenshots, { recursive: true });
  const token = randomBytes(32).toString('hex');
  let child, port, browser, page;
  async function launch() {
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
        const match = String(data).match(/DRAGONTRIP_READY (\d+)/);
        if (match) {
          clearTimeout(timeout);
          ok(Number(match[1]));
        }
      });
      child.once('exit', () => {
        clearTimeout(timeout);
        fail(new Error('Backend exited before ready'));
      });
    });
  }
  async function stop() {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
    child = undefined;
  }
  async function request(path, method = 'GET', body) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.ok(response.ok, `${method} ${path}: ${response.status}`);
    return response.json();
  }
  try {
    await launch();
    const pid = (
      await request('/projects', 'POST', {
        name: 'Investigation delivery',
        description: 'Authorized local workspace test',
      })
    ).id;
    const node = await request(`/projects/${pid}/nodes`, 'POST', { label: 'Review target' });
    await request(`/projects/${pid}/knowledge`, 'POST', {
      kind: 'finding',
      title: 'Confirmed observation',
      content: {
        severity: 'high',
        status: 'confirmed',
        body: 'Evidence supports this observation.',
        remediation: 'Apply and verify the recommended fix.',
        node_ids: [node.id],
      },
    });
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox'],
    });
    const errors = [];
    async function openPage() {
      page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      page.setDefaultTimeout(15000);
      page.on('pageerror', (error) => {
        errors.push(error.message);
        console.error('Browser error:', error.message);
      });
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
      await page.getByRole('heading', { name: 'Workspace overview' }).waitFor();
    }
    await openPage();
    await navigate(page, 'Task board');
    await page.getByRole('button', { name: 'New task', exact: true }).click();
    await page.getByLabel('Task template', { exact: true }).selectOption('3');
    await page.getByLabel('Title', { exact: true }).fill('Verify lab remediation');
    await page.getByLabel('Owner', { exact: true }).fill('Analyst');
    await page.getByLabel('Priority', { exact: true }).selectOption('urgent');
    await page.getByLabel('Due date', { exact: true }).fill('2026-01-01');
    await page.getByLabel('Review target').check();
    await page.getByRole('button', { name: 'Save task', exact: true }).click();
    await page.locator('.task-card').filter({ hasText: 'Verify lab remediation' }).waitFor();
    assert.match(await page.locator('.task-card').innerText(), /Overdue/);
    await page.getByRole('button', { name: 'Verify lab remediation', exact: true }).click();
    await page.getByLabel('Status', { exact: true }).selectOption('in_progress');
    await page.getByRole('button', { name: 'Save task', exact: true }).click();
    await page
      .locator('.task-column')
      .filter({ has: page.getByRole('heading', { name: 'In progress' }) })
      .getByRole('button', { name: 'Verify lab remediation', exact: true })
      .waitFor();
    await page.getByLabel('Search tasks').fill('Analyst');
    await page.locator('.task-card').waitFor();
    await page.getByLabel('Task status filter').selectOption('done');
    await page.waitForFunction(() => !document.querySelector('.task-card'));
    await page.getByLabel('Task status filter').selectOption('all');
    await page.getByLabel('Search tasks').fill('');
    await page.locator('.task-card').waitFor();
    await page.getByText('Loading tasks…', { exact: true }).waitFor({ state: 'hidden' });
    await page.screenshot({ path: join(screenshots, 'phase5-task-board.png') });
    await navigate(page, 'Project overview');
    await page.getByText('Tasks completed', { exact: true }).waitFor();
    assert.match(await page.locator('.engagement-metrics').innerText(), /0 \/ 1/);
    await page.screenshot({ path: join(screenshots, 'phase5-project-overview.png') });
    await navigate(page, 'Reports');
    await page
      .getByLabel('Executive summary', { exact: true })
      .fill('Local review completed. Follow-up verification remains.');
    await page.getByRole('button', { name: 'Working preset', exact: true }).click();
    await page.getByRole('button', { name: 'Generate preview', exact: true }).click();
    await page.getByRole('heading', { name: 'Confirmed observation', exact: true }).waitFor();
    assert.match(await page.getByLabel('Report preview').innerText(), /Verify lab remediation/);
    await page.getByRole('button', { name: 'Export Markdown', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Saved:' }).waitFor();
    await page.locator('#main-content').evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({ path: join(screenshots, 'phase5-report.png') });
    await page.getByLabel('Minimum severity', { exact: true }).selectOption('critical');
    assert.equal(
      await page.getByRole('button', { name: 'Export Markdown', exact: true }).isEnabled(),
      false,
    );
    await page.getByRole('button', { name: 'Generate preview', exact: true }).click();
    await page.getByText('No findings match these report filters.', { exact: true }).waitFor();
    await page.close();
    await stop();
    await launch();
    await openPage();
    await navigate(page, 'Task board');
    await page.getByRole('button', { name: 'Verify lab remediation', exact: true }).waitFor();
    const tasks = await request(`/projects/${pid}/knowledge?kind=task`);
    assert.equal(tasks[0].content.status, 'in_progress');
    assert.equal(tasks[0].content.assignee, 'Analyst');
    assert.deepEqual(tasks[0].content.node_ids, [node.id]);
    await page.setViewportSize({ width: 1366, height: 768 });
    await navigate(page, 'Settings');
    await page.getByRole('heading', { name: 'Environment settings' }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      'Planning smoke passed: task create/edit/filter/link, overview, report filters/export, restart persistence, 1366x768 navigation.',
    );
  } catch (error) {
    if (page) {
      console.error((await page.locator('body').innerText()).slice(-8000));
      await page.screenshot({ path: join(screenshots, 'phase5-failure.png') });
    }
    throw error;
  } finally {
    await browser?.close();
    await stop();
    rmSync(storage, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
