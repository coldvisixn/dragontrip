const { navigate } = require('./navigation.cjs');
/* Real Phase 3 UI/API test. Only Tauri credential delivery is bridged in Chromium.
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
  const storage = mkdtempSync(join(tmpdir(), 'dragontrip-workspace-'));
  const screenshots = process.env.SCREENSHOT_DIR || join(tmpdir(), 'dragontrip-phase3-screenshots');
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
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox'],
    });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(15000);
    console.log('Checking custom object editor');
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(
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
    await page.goto('http://localhost:1420');
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByLabel('Project name').fill('Investigation workspace');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await page.getByRole('button', { name: 'Custom node', exact: true }).click();
    await page.getByLabel('Object label').fill('Review authentication');
    await page.getByLabel('Category', { exact: true }).selectOption('task');
    await page
      .getByLabel('Description', { exact: true })
      .fill('Explain the purpose of this node.\nCheck access boundaries.');
    await page.getByLabel('Investigation status').selectOption('investigating');
    await page.getByLabel('Tags', { exact: false }).fill('web, follow-up');
    await page.getByRole('button', { name: 'Add object', exact: true }).click();
    await page.locator('.object-card.custom').waitFor();
    assert.match(await page.locator('.object-card.custom').innerText(), /Explain the purpose/);
    await page.getByRole('button', { name: 'Edit object', exact: true }).click();
    await page.getByLabel('Object label').fill('Review session handling');
    await page
      .getByLabel('Description', { exact: true })
      .fill('Investigate session expiry and document the reason.');
    await page.getByRole('button', { name: 'Save object', exact: true }).click();
    await page
      .locator('.object-card.custom')
      .filter({ hasText: 'Review session handling' })
      .waitFor();
    await page.screenshot({ path: join(screenshots, 'editable-node.png') });
    const pid = await page.evaluate(() => localStorage.getItem('dragontrip.project'));
    const initial = await request('/projects/' + pid);
    const custom = initial.nodes.find((node) => node.kind === 'custom');
    assert.equal(custom.attrs.status, 'investigating');

    console.log('Checking select contrast');
    // Native select colors remain readable under either system preference.
    await page.getByRole('button', { name: 'Close inspector' }).click();
    await page.getByRole('button', { name: 'Start scan', exact: true }).click();
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      const colors = await page.locator('select').evaluateAll((selects) =>
        selects
          .flatMap((select) => [select, ...select.options])
          .map((element) => {
            const style = getComputedStyle(element);
            return {
              scheme: style.colorScheme,
              foreground: style.color,
              background: style.backgroundColor,
            };
          }),
      );
      assert.ok(colors.length > 2);
      for (const c of colors) {
        assert.equal(c.scheme, 'dark');
        assert.equal(c.background, 'rgb(17, 21, 29)');
        assert.equal(c.foreground, 'rgb(232, 235, 242)');
      }
      await page.getByLabel('Scan profile').click();
      await page.keyboard.press('Escape');
      await page.screenshot({ path: join(screenshots, 'scan-select-' + scheme + '.png') });
    }
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.locator('.object-card.custom').click();
    console.log('Checking linked note');
    await page.getByRole('button', { name: 'Add linked note' }).click();
    await page.getByLabel('Title', { exact: true }).fill('Session investigation context');
    await page
      .getByLabel('Content', { exact: true })
      .fill('Keep rationale and next steps with the object.');
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await page
      .locator('.knowledge-article h2')
      .filter({ hasText: 'Session investigation context' })
      .waitFor();
    assert.equal(
      (await request(`/projects/${pid}/knowledge?kind=note`))[0].content.node_ids[0],
      custom.id,
    );
    await page.getByRole('button', { name: 'Edit note', exact: true }).click();
    await page.getByLabel('Content', { exact: true }).fill('Updated investigation context');
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await page
      .locator('.knowledge-article')
      .getByText('Updated investigation context', { exact: true })
      .waitFor();

    console.log('Checking findings');
    await navigate(page, 'Findings');
    await page.getByRole('button', { name: 'New finding', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill('Discarded draft');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'New finding', exact: true }).click();
    assert.equal(await page.getByLabel('Title', { exact: true }).inputValue(), '');
    await page.getByLabel('Title', { exact: true }).fill('Session review finding');
    await page.getByLabel('Severity', { exact: true }).selectOption('high');
    await page.getByLabel('Description and evidence').fill('Manual review evidence and impact.');
    await page
      .getByLabel('Remediation', { exact: true })
      .fill('Set explicit expiry and verify invalidation.');
    await page.getByRole('checkbox', { name: /Review session handling/ }).check();
    await page.getByRole('button', { name: 'Save finding', exact: true }).click();
    await page
      .locator('.knowledge-article h2')
      .filter({ hasText: 'Session review finding' })
      .waitFor();
    await page.screenshot({ path: join(screenshots, 'findings.png') });

    console.log('Checking attack paths');
    await navigate(page, 'Attack Paths');
    await page.getByRole('button', { name: 'New path', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill('Authentication investigation');
    await page
      .getByLabel('Content', { exact: true })
      .fill('A manual plan, requiring verification.');
    await page.getByRole('button', { name: 'Add step', exact: true }).click();
    await page
      .getByLabel('Action or rationale', { exact: true })
      .fill('Review boundary assumptions');
    await page.getByRole('button', { name: 'Add step', exact: true }).click();
    await page
      .getByLabel('Action or rationale', { exact: true })
      .nth(1)
      .fill('Document validation result');
    await page.getByRole('button', { name: 'Move step 2 up', exact: true }).click();
    await page.getByRole('button', { name: 'Save path', exact: true }).click();
    await page
      .locator('.knowledge-article h2')
      .filter({ hasText: 'Authentication investigation' })
      .waitFor();
    assert.match(
      await page.locator('.path-steps li').first().innerText(),
      /Document validation result/,
    );
    await page.screenshot({ path: join(screenshots, 'attack-path.png') });

    console.log('Checking vault');
    await navigate(page, 'Credentials Vault');
    const password = 'browser-test-master-password';
    await page.getByLabel('Master password', { exact: true }).fill(password);
    // A polling status check must not clear the user's partially entered password.
    await page.waitForTimeout(5200);
    assert.equal(await page.getByLabel('Master password', { exact: true }).inputValue(), password);
    await page.getByLabel('Confirm master password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create vault', exact: true }).click();
    await page.getByRole('button', { name: 'New credential', exact: true }).click();
    await page.getByLabel('Credential title', { exact: true }).fill('Discarded credential');
    await page.getByLabel('Secret', { exact: true }).fill('discarded-secret');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'New credential', exact: true }).click();
    assert.equal(await page.getByLabel('Secret', { exact: true }).inputValue(), '');
    assert.equal(await page.getByLabel('Credential title', { exact: true }).inputValue(), '');
    await page.getByLabel('Credential title', { exact: true }).fill('Local lab account');
    await page.getByLabel('Username', { exact: true }).fill('lab-user');
    const secret = 'browser-test-private-value';
    await page.getByLabel('Secret', { exact: true }).fill(secret);
    await page.getByLabel('Private notes').fill('Only for the authorized lab.');
    await page.getByRole('checkbox', { name: /Review session handling/ }).check();
    await page.getByRole('button', { name: 'Save credential', exact: true }).click();
    await page.locator('.knowledge-article h2').filter({ hasText: 'Local lab account' }).waitFor();
    assert.ok(!(await page.locator('body').innerText()).includes(secret));
    assert.ok(!JSON.stringify(await request(`/projects/${pid}/credentials`)).includes(secret));
    await page.getByRole('button', { name: 'Reveal secret', exact: true }).click();
    await page.locator('.secret-box').getByText(secret, { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Hide secret', exact: true }).click();
    await page.getByRole('button', { name: 'Edit credential', exact: true }).click();
    await page.getByLabel('Credential title', { exact: true }).fill('Renamed lab account');
    await page.getByRole('button', { name: 'Save credential', exact: true }).click();
    await page
      .locator('.knowledge-article h2')
      .filter({ hasText: 'Renamed lab account' })
      .waitFor();
    await page.screenshot({ path: join(screenshots, 'vault.png') });
    await page.getByRole('button', { name: 'Lock vault', exact: true }).click();
    await page.getByText('Vault locked', { exact: true }).waitFor();
    assert.ok(!(await page.locator('body').innerText()).includes('Renamed lab account'));
    await page.getByLabel('Master password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Unlock vault', exact: true }).click();
    await page.getByRole('button', { name: /Renamed lab account/ }).click();
    await page.getByRole('button', { name: 'Reveal secret', exact: true }).click();
    await page.locator('.secret-box').getByText(secret, { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Hide secret', exact: true }).click();
    console.log('Checking Markdown, screenshots, timeline, search and preferences');
    await navigate(page, 'Notes');
    await page.getByRole('button', { name: /Session investigation context/ }).click();
    await page.getByRole('button', { name: 'Edit note', exact: true }).click();
    await page
      .getByLabel('Content', { exact: true })
      .fill(
        '# Boundary documentation\n\n**Reasoning** with a checklist:\n\n- [x] Review completed\n- [ ] Validate assumptions\n\n<script>window.__unsafe_markdown = true</script>\n\n![remote image](https://example.invalid/track.png)',
      );
    await page.getByRole('button', { name: 'Show Markdown preview', exact: true }).click();
    await page.getByRole('heading', { name: 'Boundary documentation', exact: true }).waitFor();
    const screenshot = await page.screenshot();
    await page
      .getByLabel('Upload evidence', { exact: true })
      .setInputFiles({ name: 'boundary-proof.png', mimeType: 'image/png', buffer: screenshot });
    await page.getByRole('checkbox', { name: /boundary-proof.png/ }).waitFor();
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await page
      .locator('.knowledge-article')
      .getByRole('heading', { name: 'Boundary documentation' })
      .waitFor();
    assert.equal(await page.evaluate(() => Boolean(window.__unsafe_markdown)), false);
    assert.equal(await page.locator('.markdown-body img').count(), 0);
    await page.getByRole('button', { name: 'Preview boundary-proof.png', exact: true }).click();
    await page.locator('.evidence-image').waitFor();
    await page.getByRole('button', { name: 'Save boundary-proof.png', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Saved:' }).waitFor();
    await page.screenshot({ path: join(screenshots, 'markdown-evidence.png') });
    await navigate(page, 'Timeline');
    await page.getByLabel('Filter timeline').fill('Evidence attachment');
    await page
      .getByLabel('Project timeline')
      .getByText('Evidence attachment added', { exact: true })
      .waitFor();
    await page.keyboard.press('Control+Shift+F');
    await page.getByLabel('Search project knowledge').fill('Boundary documentation');
    await page
      .locator('.project-search-results')
      .getByRole('button', { name: /Session investigation context/ })
      .click();
    await page
      .locator('.knowledge-article')
      .getByRole('heading', { name: 'Boundary documentation' })
      .waitFor();
    await navigate(page, 'Settings');
    await page.getByLabel('Theme', { exact: true }).selectOption('light');
    await page.getByLabel('Accent', { exact: true }).selectOption('cyan');
    await page.getByLabel('Density', { exact: true }).selectOption('compact');
    await page.getByRole('checkbox', { name: 'Reduce motion', exact: true }).check();
    await page.getByRole('button', { name: 'Save appearance', exact: true }).click();
    await page.getByText('Appearance saved', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
      'light',
    );
    const light = await request('/settings');
    assert.equal(light.appearance.accent, 'cyan');
    await page.screenshot({ path: join(screenshots, 'appearance-light.png') });
    await page.getByLabel('Theme', { exact: true }).selectOption('dark');
    await page.getByRole('button', { name: 'Save appearance', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await navigate(page, 'Network Graph');
    await page.locator('.object-card.custom').waitFor();
    await page.getByRole('button', { name: 'zoom out', exact: false }).click();
    await page.waitForTimeout(700);
    const savedView = await request(`/projects/${pid}/view`);
    assert.ok(savedView && savedView.zoom > 0);
    await navigate(page, 'Notes');
    await navigate(page, 'Network Graph');
    await page.locator('.object-card.custom').waitFor();
    const transform = await page
      .locator('.react-flow__viewport')
      .evaluate((element) => getComputedStyle(element).transform);
    assert.ok(Math.abs(Number(transform.match(/matrix\(([^,]+)/)[1]) - savedView.zoom) < 0.01);
    await navigate(page, 'Projects');
    await page
      .getByRole('checkbox', { name: 'Include encrypted credentials', exact: true })
      .check();
    await page
      .getByLabel('Archive encryption password', { exact: false })
      .fill('archive-test-password');
    const exportResponse = page.waitForResponse(
      (response) => response.url().endsWith('/export') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Export project', exact: true }).click();
    const exportResult = await exportResponse;
    assert.equal(exportResult.status(), 200, await exportResult.text());
    const archivePath = (await exportResult.json()).path;
    await page.getByLabel('Project archive', { exact: true }).setInputFiles(archivePath);
    await page
      .getByLabel('Archive password (if credentials were included)', { exact: true })
      .fill('archive-test-password');
    await page.getByRole('button', { name: 'Import project', exact: true }).click();
    await page.locator('.object-card.custom').waitFor();
    const importedId = await page.evaluate(() => localStorage.getItem('dragontrip.project'));
    assert.notEqual(importedId, pid);
    const importedNotes = await request(`/projects/${importedId}/knowledge?kind=note`);
    assert.ok(importedNotes[0].content.body.includes('Boundary documentation'));
    assert.equal(importedNotes[0].content.attachment_ids.length, 1);
    assert.equal(
      (await request(`/projects/${importedId}/credentials`))[0].title,
      'Renamed lab account',
    );
    await page.screenshot({ path: join(screenshots, 'imported-project.png') });
    await page.keyboard.press('Control+k');
    await page.getByLabel('Search commands').fill('Session investigation context');
    await page
      .locator('.commands')
      .getByRole('button', { name: /Session investigation context/ })
      .waitFor();
    await page.getByLabel('Search commands').press('ArrowDown');
    await page.keyboard.press('Enter');
    await page
      .locator('.knowledge-article')
      .getByRole('heading', { name: 'Boundary documentation' })
      .waitFor();
    for (const viewport of [
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
    }
    await navigate(page, 'Network Graph');
    await page.locator('.object-card.custom').waitFor();
    await page.reload();
    await navigate(page, 'Network Graph');
    await page
      .locator('.object-card.custom')
      .filter({ hasText: 'Review session handling' })
      .waitFor();
    await stop();
    await launch();
    assert.equal((await request('/vault')).unlocked, false);
    const saved = await request('/projects/' + pid);
    assert.equal(
      saved.nodes[0].attrs.description,
      'Investigate session expiry and document the reason.',
    );
    for (const kind of ['note', 'finding', 'path'])
      assert.equal((await request(`/projects/${pid}/knowledge?kind=${kind}`)).length, 1);
    await request('/vault/unlock', 'POST', { password });
    const entries = await request(`/projects/${pid}/credentials`);
    assert.equal(entries[0].title, 'Renamed lab account');
    assert.equal((await request(`/projects/${pid}/credentials/${entries[0].id}`)).secret, secret);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: editable objects, knowledge/path/vault lifecycle, Markdown and screenshot evidence, Timeline/search, theme preferences, viewport restoration, encrypted project transfer, keyboard palette, reload and backend restart; light/dark selects; 1366/1920 layouts.',
    );
    console.log('Screenshots: ' + screenshots);
  } catch (error) {
    if (page) await page.screenshot({ path: join(screenshots, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    if (browser) await browser.close();
    await stop();
    rmSync(storage, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
