/* Full real-backend journey. All live traffic goes to this process's loopback server. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { navigate } = require('./navigation.cjs');
(async () => {
  const storage = mkdtempSync(join(tmpdir(), 'dragontrip-journey-'));
  const output = process.env.EXPERIENCE_OUTPUT || 'docs/experience/demo';
  mkdirSync(output, { recursive: true });
  const token = randomBytes(32).toString('hex');
  let child, port, browser, context, page, server, pid;
  const errors = [],
    frames = [];
  async function backend() {
    child = spawn(resolve('.venv/bin/python'), ['-m', 'dragontrip'], {
      cwd: resolve('backend'),
      env: {
        ...process.env,
        DRAGONTRIP_TOKEN: token,
        DRAGONTRIP_DEV: '1',
        XDG_DATA_HOME: storage,
        XDG_DOWNLOAD_DIR: storage,
      },
    });
    child.stderr.on('data', (data) => process.stderr.write(data));
    port = await new Promise((ok, fail) => {
      child.stdout.on('data', (d) => {
        const m = String(d).match(/DRAGONTRIP_READY (\d+)/);
        if (m) ok(+m[1]);
      });
      child.once('exit', () => fail(Error('Backend exited')));
    });
  }
  async function request(path, method = 'GET', body) {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.ok(r.ok, `${path}: ${r.status} ${await r.clone().text()}`);
    return r.json();
  }
  async function open(storageState) {
    context = await browser.newContext({ viewport: { width: 1366, height: 768 }, storageState });
    await context.addInitScript(
      ({ port, token }) => {
        window.__TAURI_INTERNALS__ = {
          invoke: async (cmd) => {
            if (cmd === 'backend_connection') return { port, token };
            throw Error(cmd);
          },
        };
      },
      { port, token },
    );
    page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:1420');
  }
  async function shot(name, caption) {
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(output, name + '.png'), animations: 'disabled' });
    frames.push({ file: name + '.png', caption });
  }
  async function waitScan() {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const d = await request(`/projects/${pid}`);
      const s = d.scans[0];
      if (s && !['queued', 'running'].includes(s.status)) {
        assert.equal(s.status, 'completed', s.error);
        return s;
      }
      await page.waitForTimeout(200);
    }
    throw Error('Loopback scan timeout');
  }
  try {
    server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html', Server: 'DragontripFixture' });
      res.end(
        '<!doctype html><title>Owned loopback fixture</title><p>Local research demonstration</p>',
      );
    });
    server.listen(8080, '127.0.0.1');
    await once(server, 'listening');
    await backend();
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox'],
    });
    await open();
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await page
      .getByLabel('Project name', { exact: true })
      .fill('Loopback research — explicit test fixture');
    await page
      .getByLabel('Investigation goal', { exact: true })
      .fill('Understand the local HTTP surface and retain a verifiable follow-up check.');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await page.getByRole('heading', { name: 'Project overview', exact: true }).waitFor();
    pid = await page.evaluate(() => localStorage.getItem('dragontrip.project'));
    await shot('01-plan', 'Цель проекта и следующий шаг находятся вместе.');
    await navigate(page, 'Targets & scope');
    await page.getByLabel('Included targets').fill('127.0.0.1\napp.htb\nadmin.htb\n10.10.10.0/24');
    await page.getByRole('button', { name: 'Save scope', exact: true }).click();
    await page.getByText('Scope saved. Exclusions take precedence.').waitFor();
    const profile = await request('/profiles', 'POST', {
      name: 'Owned loopback 8080',
      tool: 'nmap',
      ports: '8080',
      rate: 20,
      timeout: 40,
    });
    await page.getByRole('button', { name: 'Review discovery plan', exact: true }).click();
    await page.getByLabel('Scan profile').selectOption(profile.id);
    assert.equal(await page.getByLabel('Target IPv4 address').inputValue(), '127.0.0.1');
    await page.getByRole('checkbox').check();
    await shot(
      '02-approval',
      'Адрес перенесён из scope. Перед сетевым действием проверяется план и требуется разрешение.',
    );
    await page.getByRole('button', { name: 'Start scan', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const scan = await waitScan();
    await page.getByRole('button', { name: /Background work/ }).click();
    await page.locator('.terminal-heading .badge').filter({ hasText: 'completed' }).waitFor();
    assert.equal(await page.locator('.work-technical').getAttribute('open'), null);
    await shot(
      '03-results',
      'Завершение означает сохранённый результат. Технический вывод раскрывается отдельно.',
    );
    await page.getByRole('button', { name: 'Open saved results', exact: true }).click();
    await page.locator('.inspector').waitFor();
    assert.match(await page.locator('.inspector-hero').innerText(), /8080/);
    await page.getByRole('button', { name: 'Close inspector' }).click();
    await page.getByRole('button', { name: 'Show inspector' }).click();
    await page.getByRole('button', { name: 'Open web research', exact: true }).click();
    await page.locator('.web-map').waitFor();
    assert.equal(
      await page.getByLabel('Web application', { exact: true }).inputValue(),
      'http://127.0.0.1:8080',
    );
    assert.equal((await request(`/projects/${pid}`)).scans.length, 1);
    await shot(
      '04-handoff',
      'Выбранный сервис передан в веб-исследование. Этот переход не отправляет запросов.',
    );
    await page.getByRole('button', { name: 'Review web request', exact: true }).click();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Start scan', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const webScan = await waitScan();
    assert.notEqual(webScan.id, scan.id);
    await page.getByRole('button', { name: /Background work/ }).click();
    await page.locator('.terminal-heading .badge').filter({ hasText: 'completed' }).waitFor();
    await page.getByRole('button', { name: 'Open saved results', exact: true }).click();
    await page.locator('.endpoint-detail').waitFor();
    assert.match(await page.locator('.endpoint-detail').innerText(), /HTTP status: 200/);
    await shot(
      '05-web',
      'Ответ локального сервера, выбранный endpoint и ссылка на источник доступны в одном рабочем пространстве.',
    );
    // Continue with a real offline source carrying request and response bytes.
    await navigate(page, 'Import results');
    await page
      .getByLabel('Tool export file')
      .setInputFiles(resolve('tests/fixtures/imports/burp-items.xml'));
    await page.getByRole('button', { name: 'Preview import', exact: true }).click();
    await page.getByRole('button', { name: 'Import selected records', exact: true }).click();
    await page.getByRole('button', { name: 'Explore web results', exact: true }).click();
    await page.getByLabel('Web application', { exact: true }).selectOption('http://app.htb');
    await page.getByRole('button', { name: 'POST http://app.htb/login?q=1', exact: true }).click();
    const observation = page.locator('.import-observations > details').first();
    await observation.locator(':scope > summary').click();
    await observation.getByRole('button', { name: 'View original source', exact: true }).click();
    await shot(
      '06-source',
      'Импорт продолжает то же исследование: доступны ответ, исходное наблюдение и оригинальный файл.',
    );
    await observation.getByRole('button', { name: 'Create linked record', exact: true }).click();
    await page.getByRole('button', { name: 'Edit note', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill('Hypothesis: review session boundaries');
    await page
      .getByLabel('Content', { exact: true })
      .fill('Observed response retained. Hypothesis needs a manual check.');
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await page
      .getByRole('heading', { name: 'Hypothesis: review session boundaries', exact: true })
      .waitFor();
    await page
      .locator('.knowledge-article .source-actions')
      .getByRole('button', { name: 'Create linked record', exact: true })
      .click();
    await page
      .getByLabel('Content', { exact: true })
      .fill('Manual fixture check completed. Evidence remains linked.');
    await page.getByLabel('Status', { exact: true }).selectOption('done');
    await page.getByRole('button', { name: 'Save task', exact: true }).click();
    await shot(
      '07-task',
      'Гипотеза превращается в связанную задачу. Результат проверки сохраняется вместе с происхождением.',
    );
    await navigate(page, 'Web applications');
    await page.getByLabel('Web application', { exact: true }).selectOption('http://app.htb');
    await page.getByRole('button', { name: 'POST http://app.htb/login?q=1', exact: true }).click();
    const actions = page.locator('.endpoint-detail > .source-actions');
    await actions
      .getByRole('button', { name: 'Hypothesis: review session boundaries · draft', exact: true })
      .waitFor();
    await actions.getByText('Add another record type', { exact: true }).click();
    await actions.getByLabel('Create linked record type').selectOption('finding');
    await actions.getByRole('button', { name: 'Create linked record', exact: true }).click();
    await page.getByRole('button', { name: 'Edit finding', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill('Synthetic fixture finding');
    await page.getByLabel('Status', { exact: true }).selectOption('confirmed');
    await page.getByRole('button', { name: 'Save finding', exact: true }).click();
    await page.getByText('Record a retest', { exact: true }).click();
    await page.getByLabel('Retest result').selectOption('still_present');
    await page
      .getByLabel('Retest notes')
      .fill('Manual fixture retest: same behavior. This is test data.');
    await page.getByRole('button', { name: 'Save retest', exact: true }).click();
    await page
      .getByText('Manual fixture retest: same behavior. This is test data.', { exact: true })
      .waitFor();
    await shot(
      '08-retest',
      'Находка и повторная проверка сохраняют историю. Отсутствие результата не считается исправлением.',
    );
    const before = await request(`/projects/${pid}`);
    const knowledge = (
      await Promise.all(
        ['task', 'finding'].map((kind) => request(`/projects/${pid}/knowledge?kind=${kind}`)),
      )
    ).flat();
    assert.equal(knowledge.find((r) => r.kind === 'task').content.status, 'done');
    assert.equal(knowledge.find((r) => r.kind === 'finding').content.retests.length, 1);
    await page.waitForTimeout(700);
    const state = await context.storageState();
    await context.close();
    child.kill('SIGTERM');
    await once(child, 'exit');
    await backend();
    await open(state);
    await page.getByRole('heading', { name: 'Synthetic fixture finding', exact: true }).waitFor();
    assert.equal((await request('/queue')).tasks.length, 0);
    await shot(
      '09-resume',
      'После перезапуска восстановлена находка и история ретеста. Новых сетевых действий нет.',
    );
    await navigate(page, 'Projects');
    const exported = page.waitForResponse(
      (r) => r.url().endsWith(`/projects/${pid}/export`) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Export project', exact: true }).click();
    const path = (await (await exported).json()).path;
    await page.getByLabel('Project archive', { exact: true }).setInputFiles(path);
    await page.getByRole('button', { name: 'Import project', exact: true }).click();
    const deadline = Date.now() + 15000;
    let restored;
    while (Date.now() < deadline) {
      const ps = await request('/projects');
      restored = ps.find((p) => p.id !== pid);
      if (restored) break;
      await page.waitForTimeout(100);
    }
    assert.ok(restored, 'Archive was not imported');
    const restoredDetail = await request('/projects/' + restored.id);
    assert.equal(restoredDetail.project.goal, before.project.goal);
    assert.equal(restoredDetail.nodes.length, before.nodes.length);
    assert.equal(restoredDetail.scans.length, 2);
    const records = await request(`/projects/${restored.id}/knowledge?kind=finding`);
    assert.equal(records.find((r) => r.kind === 'finding').content.retests.length, 1);
    assert.equal((await request('/queue')).tasks.length, 0);
    await page.waitForFunction(
      (id) => localStorage.getItem('dragontrip.project') === id,
      restored.id,
    );
    await page.locator('.main').waitFor();
    await shot(
      '10-transfer',
      'Архив v6 открыт как отдельный проект: цель, объекты, доказательства, задачи и ретест сохранены.',
    );
    assert.deepEqual(errors, []);
    writeFileSync(
      join(output, 'result.json'),
      JSON.stringify(
        {
          result: 'PASS',
          liveTarget: 'owned 127.0.0.1:8080',
          scans: 2,
          objects: restoredDetail.nodes.length,
          frames,
        },
        null,
        2,
      ),
    );
    const captions = JSON.stringify(frames).replaceAll('<', '\\u003c');
    writeFileSync(
      join(output, 'index.html'),
      `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Dragontrip — полный путь</title><style>body{margin:0;padding:24px;background:#10141d;color:#eee;font:16px system-ui}main{max-width:1366px;margin:auto}img{width:100%;border:1px solid #444}button{padding:10px;margin:10px 8px 10px 0}p{min-height:3em}</style><main><h1>Dragontrip: от цели до ретеста и переноса проекта</h1><p>Пошаговая демонстрация реального интерфейса. Chromium + реальный backend. Сетевые проверки направлены только на собственный loopback-сервер.</p><img id="frame" alt=""><p id="caption" aria-live="polite"></p><button id="prev">Назад</button><button id="play">Воспроизвести</button><button id="next">Далее</button><span id="count"></span></main><script>const frames=${captions};let i=0,t;function show(){document.querySelector('#frame').src=frames[i].file;document.querySelector('#frame').alt=frames[i].caption;document.querySelector('#caption').textContent=frames[i].caption;document.querySelector('#count').textContent=(i+1)+' / '+frames.length}document.querySelector('#prev').onclick=()=>{i=(i+frames.length-1)%frames.length;show()};document.querySelector('#next').onclick=()=>{i=(i+1)%frames.length;show()};document.querySelector('#play').onclick=()=>{if(t){clearInterval(t);t=null}else t=setInterval(()=>{i=(i+1)%frames.length;show()},4500);document.querySelector('#play').textContent=t?'Пауза':'Воспроизвести'};show();</script></html>`,
    );
    console.log(
      'PASS: goal → scope → approved Nmap → service → local handoff → approved httpx → import → evidence → hypothesis → task → finding → retest → restart → archive import',
    );
  } finally {
    await browser?.close();
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
    if (server) await new Promise((ok) => server.close(ok));
    rmSync(storage, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
