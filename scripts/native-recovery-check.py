"""Injected failure acceptance against real native IPC and filesystem exports.

Only WebView storage and workspace HTTP writes are faulted. Native IPC is real.
"""
import json
import subprocess


def check(driver, checks, root):
    driver.navigate('Notes', '.knowledge-page')
    driver.click('New note')
    driver.js('''
      window.__recoverySetItem=Storage.prototype.setItem;
      window.__recoveryFetch=window.fetch;
      Storage.prototype.setItem=function(){throw new Error('Acceptance: storage unavailable')};
      window.fetch=function(url,...args){if(String(url).includes('/workspace'))return Promise.reject(new Error('Acceptance: backend unavailable'));return window.__recoveryFetch(url,...args)};
    ''')
    try:
        driver.fill('.knowledge-editor input', 'Memory-only recovery fixture')
        driver.fill('.knowledge-editor textarea', 'Retain this text when both stores fail.')
        checks.wait_until(lambda: driver.js("return document.querySelector('.draft-status')?.textContent.includes('only in memory')"))
        driver.navigate('Reports', '.report-options')
        driver.navigate('Notes', '.knowledge-page')
        checks.wait_until(lambda: driver.js("return document.querySelector('.knowledge-editor textarea')?.value==='Retain this text when both stores fail.'"))
        driver.click('Download draft')
        exported = checks.wait_until(lambda: next((root / 'downloads').glob('dragontrip-draft-*.json'), None))
        data = json.loads(exported.read_text())
        assert data['content']['body'] == 'Retain this text when both stores fail.'
        # Real window-manager close reaches Tauri's CloseRequested guard.
        subprocess.run(['wmctrl', '-c', 'Dragontrip'], check=True)
        checks.wait_until(lambda: driver.js("return document.querySelector('.dialog')?.textContent.includes('Unsaved work is only in memory')"))
        driver.click('Keep working')
        assert driver.js("return document.querySelector('.knowledge-editor textarea').value==='Retain this text when both stores fail.'")
        checks.capture_ui(checks.VALIDATION / 'screenshots/native-memory-recovery.png')
    finally:
        driver.js('Storage.prototype.setItem=window.__recoverySetItem;window.fetch=window.__recoveryFetch;')
    driver.click('Retry sync')
    checks.wait_until(lambda: driver.js("return document.querySelector('.draft-status')?.textContent.includes('Draft saved on this device')"))
    driver.click('Save note')
    checks.wait_until(lambda: driver.js("return !!document.querySelector('.knowledge-article')"))
    print('PASS: native memory-only navigation, recovery JSON export, window close guard and resumed saving', flush=True)
