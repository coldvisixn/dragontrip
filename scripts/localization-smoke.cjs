/* Real UI/API acceptance for language persistence and motion preferences. */
const { chromium } = require('playwright-core');
const { spawn } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
(async () => {
  const storage = mkdtempSync(join(tmpdir(), 'dragontrip-locale-'));
  const token = randomBytes(32).toString('hex');
  const output =
    process.env.DRAGONTRIP_VALIDATION_DIR ||
    mkdtempSync(join(tmpdir(), 'dragontrip-locale-output-'));
  mkdirSync(output, { recursive: true });
  const frozen = process.env.DRAGONTRIP_TEST_BACKEND;
  const child = spawn(resolve(frozen || '.venv/bin/python'), frozen ? [] : ['-m', 'dragontrip'], {
    cwd: resolve('backend'),
    env: { ...process.env, DRAGONTRIP_TOKEN: token, DRAGONTRIP_DEV: '1', XDG_DATA_HOME: storage },
  });
  let browser, debugPage;
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Backend readiness timeout')), 20000);
      child.stdout.on('data', (data) => {
        const match = String(data).match(/DRAGONTRIP_READY (\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(Number(match[1]));
        }
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(Error('Backend exit ' + code));
      });
      child.stderr.on('data', (data) => process.stderr.write(data));
    });
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox'],
    });
    const page = await browser.newPage({ viewport: { width: 1366, height: 850 } });
    debugPage = page;
    page.setDefaultTimeout(15000);
    page.on('requestfailed', (request) =>
      console.error('REQUEST FAILED', request.url(), request.failure()),
    );
    page.on('response', (response) => {
      if (response.status() >= 400) console.error('HTTP', response.status(), response.url());
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(
      ({ port, token }) => {
        window.__TAURI_INTERNALS__ = {
          invoke: async (command) => {
            if (command === 'backend_connection') return { port, token };
            throw Error('Browser test: ' + command);
          },
        };
        window.pageAnimations = 0;
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (...args) {
          if (this.matches('.main')) window.pageAnimations++;
          return animate.apply(this, args);
        };
      },
      { port, token },
    );
    await page.goto('http://localhost:1420');
    await page.getByRole('heading', { name: 'Workspace overview' }).waitFor();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Interface language', { exact: true }).selectOption('ru');
    await page.getByRole('heading', { name: 'Настройки окружения' }).waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'ru');
    await page.getByLabel('Тема', { exact: true }).selectOption('light');
    await page.getByRole('checkbox', { name: 'Уменьшить движение', exact: true }).check();
    assert.equal(await page.locator('html').getAttribute('data-reduced-motion'), 'true');
    await page.getByRole('button', { name: 'Сохранить внешний вид', exact: true }).click();
    await page.getByText('Внешний вид сохранён', { exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    const noMotionCount = await page.evaluate(() => window.pageAnimations);
    await page.getByRole('button', { name: 'Главная', exact: true }).click();
    await page.getByRole('heading', { name: 'Обзор рабочего пространства' }).waitFor();
    assert.equal(await page.evaluate(() => window.pageAnimations), noMotionCount);
    await page.getByRole('button', { name: 'Новый проект', exact: true }).click();
    await page
      .getByLabel('Название проекта', { exact: true })
      .fill('Русский проект / English name');
    await page.getByLabel('Цель исследования', { exact: true }).fill('Сохранить исходный текст');
    await page.getByRole('button', { name: 'Создать проект', exact: true }).click();
    await page.getByRole('heading', { name: 'Обзор проекта', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await page.getByLabel('Язык интерфейса', { exact: true }).waitFor();
    await page.screenshot({
      path: join(output, 'settings-ru.png'),
      fullPage: true,
      animations: 'disabled',
    });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.reload();
    await page.getByLabel('Язык интерфейса', { exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('data-reduced-motion'), 'true');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.getByRole('checkbox', { name: 'Уменьшить движение', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Сохранить внешний вид', exact: true }).click();
    await page.getByText('Внешний вид сохранён', { exact: true }).waitFor();
    const motionCount = await page.evaluate(() => window.pageAnimations);
    await page.getByRole('button', { name: 'Исследование', exact: true }).click();
    await page.getByRole('tab', { name: 'Граф сети', exact: true }).waitFor();
    await page.waitForFunction((count) => window.pageAnimations > count, motionCount);
    await page.getByRole('tab', { name: 'Хосты', exact: true }).click();
    await page.getByRole('heading', { name: 'Хосты', exact: true }).waitFor();
    await page.keyboard.press('Control+k');
    await page.getByLabel('Поиск команд', { exact: true }).fill('Заметки');
    await page.getByRole('dialog').getByRole('button', { name: 'Заметки', exact: true }).click();
    await page.getByRole('heading', { name: 'Заметки', exact: true }).waitFor();
    await page.getByRole('button', { name: 'План', exact: true }).click();
    await page.getByRole('heading', { name: 'Обзор проекта', exact: true }).waitFor();
    assert.equal(
      await page.getByRole('textbox', { name: /Цель исследования/ }).inputValue(),
      'Сохранить исходный текст',
    );
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const systemCount = await page.evaluate(() => window.pageAnimations);
    await page.getByRole('button', { name: 'Главная', exact: true }).click();
    await page.getByRole('heading', { name: 'Обзор рабочего пространства' }).waitFor();
    assert.equal(await page.evaluate(() => window.pageAnimations), systemCount);
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await page.getByLabel('Язык интерфейса', { exact: true }).selectOption('en');
    await page.getByRole('heading', { name: 'Environment settings', exact: true }).waitFor();
    assert.ok(
      await page
        .getByRole('button', { name: 'Choose project', exact: true })
        .innerText()
        .then((text) => text.includes('Русский проект / English name')),
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: RU/EN, reload persistence, project text, Russian command search, reduced/system motion, normal tab animation, desktop overflow.',
    );
  } catch (error) {
    console.error(await debugPage?.locator('body').innerText());
    await debugPage?.screenshot({ path: join(output, 'failure.png'), fullPage: true });
    throw error;
  } finally {
    await browser?.close();
    child.kill();
    rmSync(storage, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
