const { navigate } = require('./navigation.cjs');
/* Repeatable production-browser profile. All generated nodes are manual fixtures. */
const { chromium } = require('playwright-core');
const { spawn, execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
(async () => {
  const storage = mkdtempSync(join(tmpdir(), 'dragontrip-graph-profile-'));
  const token = randomBytes(32).toString('hex');
  const child = spawn(resolve('.venv/bin/python'), ['-m', 'dragontrip'], {
    cwd: resolve('backend'),
    env: { ...process.env, DRAGONTRIP_TOKEN: token, DRAGONTRIP_DEV: '1', XDG_DATA_HOME: storage },
  });
  child.stderr.on('data', (data) => process.stderr.write(data));
  let browser;
  try {
    const port = await new Promise((ok, fail) => {
      child.stdout.on('data', (data) => {
        const match = String(data).match(/DRAGONTRIP_READY (\d+)/);
        if (match) ok(Number(match[1]));
      });
      child.once('exit', () => fail(Error('Backend startup failed')));
    });
    const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    const project = await fetch(`http://127.0.0.1:${port}/projects`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Manual graph profile' }),
    }).then((response) => response.json());
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox'],
    });
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(
      ({ port, token, pid }) => {
        window.__TAURI_INTERNALS__ = { invoke: async () => ({ port, token }) };
        localStorage.setItem('dragontrip.project', pid);
      },
      { port, token, pid: project.id },
    );
    const metrics = {
      runtime: 'Chromium production frontend + Python backend; manual fixtures only',
      version: require('../package.json').version,
      viewport: '1366x768',
      samples: [],
    };
    for (const performanceProfile of ['low', 'medium', 'high']) {
    const preferences = await fetch(`http://127.0.0.1:${port}/settings/appearance`, {
      method: 'PUT', headers, body: JSON.stringify({performance_profile: performanceProfile, reduced_motion: true}),
    });
    if (!preferences.ok) throw Error('Could not select performance profile');
    for (const count of [100, 300, 1000]) {
      const seed = `import sqlite3,json,sys
db=sqlite3.connect(sys.argv[1]);pid=sys.argv[2];count=int(sys.argv[3])
db.execute('DELETE FROM nodes WHERE project_id=?',(pid,))
db.execute('DELETE FROM graph_views WHERE project_id=?',(pid,))
db.executemany('INSERT INTO nodes (id,project_id,kind,label,attrs,x,y) VALUES (?,?,?,?,?,?,?)',[(f'profile-{i}',pid,'custom',f'Manual fixture {i}',json.dumps({'source':'manual','category':'note','description':'Manual performance fixture, not a discovery','status':'idea','tags':[]}), (i%20)*280,(i//20)*185) for i in range(count)])
db.commit()
`;
      execFileSync(resolve('.venv/bin/python'), [
        '-c',
        seed,
        join(storage, 'dragontrip', 'dragontrip.sqlite3'),
        project.id,
        String(count),
      ]);
      const started = performance.now();
      await page.goto('http://localhost:1420');
      await navigate(page, 'Network Graph');
      await page.locator('.object-card').first().waitFor();
      const openMs = performance.now() - started;
      await page.waitForTimeout(600);
      const payload = await fetch(`http://127.0.0.1:${port}/projects/${project.id}?compact=true`, {
        headers,
      }).then((response) => response.text());
      const before = await page.locator('.object-card').count();
      const initialPosition = await fetch(
        `http://127.0.0.1:${port}/projects/${project.id}/nodes/profile-0`,
        { headers },
      ).then((response) => response.json());
      // Move a visible node at a usable zoom and measure RAF intervals during pointer motion.
      await page.getByLabel('Find graph object').fill('Manual fixture 0');
      await page
        .locator('.search-results')
        .getByRole('button', { name: 'Manual fixture 0', exact: true })
        .click();
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        window.__profileFrames = [];
        let last = performance.now();
        window.__profileRunning = true;
        const frame = (now) => {
          if (!window.__profileRunning) return;
          window.__profileFrames.push(now - last);
          last = now;
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      const card = page.locator('.react-flow__node[data-id="profile-0"]');
      const box = await card.boundingBox();
      await page.mouse.move(box.x + Math.min(30, box.width / 2), box.y + 16);
      await page.mouse.down();
      await page.mouse.move(box.x + 130, box.y + 65, { steps: 30 });
      await page.mouse.up();
      const frames = await page.evaluate(() => {
        window.__profileRunning = false;
        return window.__profileFrames;
      });
      frames.sort((a, b) => a - b);
      const session = await page.context().newCDPSession(page);
      await session.send('Performance.enable');
      const performanceMetrics = await session.send('Performance.getMetrics');
      await session.detach();
      const heap =
        performanceMetrics.metrics.find((item) => item.name === 'JSHeapUsedSize')?.value || 0;
      const snapshot = await page.evaluate(() => ({
        nodes: document.querySelectorAll('.object-card').length,
        minimap: Boolean(document.querySelector('.react-flow__minimap')),
      }));
      await page.waitForTimeout(300);
      const finalPosition = await fetch(
        `http://127.0.0.1:${port}/projects/${project.id}/nodes/profile-0`,
        { headers },
      ).then((response) => response.json());
      if (initialPosition.x === finalPosition.x && initialPosition.y === finalPosition.y)
        throw Error('Profiling drag did not move/persist the selected node');
      const backend = readFileSync(`/proc/${child.pid}/status`, 'utf8');
      const backendRss = Number(backend.match(/VmRSS:\s+(\d+)/)[1]) / 1024;
      const sample = {
        performance_profile: performanceProfile,
        count,
        backend_rss_mib: Math.round(backendRss),
        graph_open_ms: Math.round(openMs),
        overview_dom_nodes: before,
        focused_dom_nodes: snapshot.nodes,
        compact_payload_kib: Math.round(Buffer.byteLength(payload) / 1024),
        js_heap_mib: Math.round((heap / 1048576) * 10) / 10,
        drag_frame_median_ms: Math.round(frames[Math.floor(frames.length / 2)] || 0),
        drag_frame_p95_ms: Math.round(frames[Math.floor(frames.length * 0.95)] || 0),
        frame_samples: frames.length,
        minimap_enabled: snapshot.minimap,
      };
      metrics.samples.push(sample);
      console.log(JSON.stringify(sample));
      if (
        !frames.length ||
        !Number.isFinite(sample.graph_open_ms) ||
        ((count > 500 || performanceProfile === 'low') && snapshot.minimap)
      )
        throw Error('Graph performance scenario did not execute correctly');
    }
    }
    if (errors.length) throw Error(errors.join('\n'));
    const destination = process.env.PROFILE_OUTPUT || '/tmp/dragontrip-graph-profile.json';
    writeFileSync(destination, JSON.stringify(metrics, null, 2) + '\n');
    console.log('Profile saved: ' + destination);
  } finally {
    if (browser) await browser.close();
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
    rmSync(storage, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
