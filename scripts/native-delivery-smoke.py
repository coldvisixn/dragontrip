"""Check 0.9.0 delivery through the installed Tauri/WebKit application."""

import argparse
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

spec = importlib.util.spec_from_file_location(
    "dragontrip_native_checks", Path(__file__).with_name("native-smoke.py")
)
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("application", type=Path)
    parser.add_argument("--driver", default="tauri-driver")
    args = parser.parse_args()
    native_driver = shutil.which("WebKitWebDriver")
    if not native_driver:
        raise SystemExit("WebKitWebDriver is required")
    with tempfile.TemporaryDirectory(prefix="dragontrip-planning-native-") as storage:
        root = Path(storage)
        env = dict(os.environ)
        for key, name in [
            ("XDG_DATA_HOME", "data"),
            ("XDG_CONFIG_HOME", "config"),
            ("XDG_CACHE_HOME", "cache"),
            ("XDG_RUNTIME_DIR", "runtime"),
        ]:
            directory = root / name
            directory.mkdir(mode=0o700)
            env[key] = str(directory)
        downloads = root / "downloads"
        downloads.mkdir(mode=0o700)
        (root / "config/user-dirs.dirs").write_text(f'XDG_DOWNLOAD_DIR="{downloads}"\n')
        with (root / "driver.log").open("w") as log:
            proc = subprocess.Popen(
                [
                    args.driver,
                    "--port",
                    "4454",
                    "--native-port",
                    "4455",
                    "--native-driver",
                    native_driver,
                ],
                env=env,
                stdout=log,
                stderr=log,
            )
            driver = checks.Driver(4454, native_port=4455)
            wm = subprocess.Popen(['xfwm4', '--compositor=off'], env=env, stdout=log, stderr=log)
            checks.wait_until(lambda: subprocess.run(['wmctrl', '-m'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0)

            def stop_application():
                if not driver.session:
                    return
                tracked = checks.application_tree(proc.pid, args.application.resolve())
                driver.stop()
                checks.wait_until(
                    lambda: all(
                        not Path(f"/proc/{pid}").exists()
                        or "Z"
                        in Path(f"/proc/{pid}/status")
                        .read_text()
                        .split("State:")[1]
                        .splitlines()[0]
                        for pid in tracked
                    ),
                    15,
                )

            try:
                checks.wait_until(lambda: driver.request("GET", "/status"))
                driver.start(args.application.resolve())
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.main') && !!document.querySelector('.sidebar')"
                    )
                )
                driver.click("New project")
                driver.fill(".dialog input", "Native MVP delivery")
                driver.click("Create project")
                checks.wait_until(
                    lambda: driver.js(
                        "return document.body.textContent.includes('Start with the evidence you already have')"
                    )
                )
                checks.capture_ui(checks.VALIDATION / "screenshots/native-start.png")
                driver.navigate("Notes", ".knowledge-page")
                driver.click("New note")
                driver.fill(".knowledge-editor input", "Recover this native note")
                driver.fill(
                    ".knowledge-editor textarea",
                    "Retain reasoning across a full application restart.",
                )
                driver.navigate("Reports", ".report-options")
                driver.fill(
                    ".report-options textarea",
                    "Native fixture summary; no real vulnerability claim.",
                )
                checks.wait_until(
                    lambda: driver.js(
                        "return document.querySelector('.report-options')?.textContent.includes('Draft saved on this device')"
                    )
                )
                driver.js(
                    "for(const key of Object.keys(localStorage)){if(key.startsWith('dragontrip.draft:')||key.startsWith('dragontrip.workspace:'))localStorage.removeItem(key)}"
                )
                stop_application()
                driver.start(args.application.resolve())
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.main') && !!document.querySelector('.sidebar')"
                    )
                )
                driver.navigate("Notes", ".knowledge-page")
                checks.wait_until(
                    lambda: driver.js(
                        "return document.querySelector('.knowledge-editor input')?.value==='Recover this native note'"
                    )
                )
                assert driver.js(
                    "return document.querySelector('.knowledge-editor textarea').value==='Retain reasoning across a full application restart.'"
                )
                checks.capture_ui(checks.VALIDATION / "screenshots/native-draft.png")
                proof = root / "native-delivery-proof.png"
                checks.capture_ui(proof)
                driver.fill('input[aria-label="Upload evidence"]', str(proof))
                checks.wait_until(
                    lambda: driver.js(
                        "return document.querySelector('.reference-options')?.textContent.includes('native-delivery-proof.png')"
                    )
                )
                driver.click("Save note")
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.knowledge-article')"
                    )
                )
                driver.navigate("Findings", ".knowledge-page")
                driver.click("New finding")
                driver.fill(".knowledge-editor input", "Native fixture finding")
                driver.click("Use finding template")
                driver.js(
                    "const s=document.querySelector('.knowledge-editor select[aria-label=Status]');s.value='confirmed';s.dispatchEvent(new Event('change',{bubbles:true}));"
                )
                driver.click("Save finding")
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.knowledge-article')"
                    )
                )
                driver.js(
                    "[...document.querySelectorAll('summary')].find(e=>e.textContent==='Record a retest').click()"
                )
                driver.fill(
                    ".knowledge-article textarea",
                    "Manual verification recorded in the installed application.",
                )
                driver.js(
                    "const s=document.querySelector('[aria-label=\"Retest result\"]');s.value='still_present';s.dispatchEvent(new Event('change',{bubbles:true}));"
                )
                driver.click("Save retest")
                checks.wait_until(
                    lambda: driver.js(
                        "return [...document.querySelectorAll('.knowledge-article .markdown-body')].some(e=>e.textContent.includes('Manual verification recorded in the installed application.'))"
                    )
                )
                driver.navigate("Reports", ".report-options")
                checks.wait_until(
                    lambda: driver.js(
                        "return document.querySelector('.report-options textarea')?.value==='Native fixture summary; no real vulnerability claim.'"
                    )
                )
                driver.js(
                    "const s=document.querySelector('[aria-label=\"Export format\"]');s.value='bundle';s.dispatchEvent(new Event('change',{bubbles:true}));"
                )
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.report-options .reference-options input')"
                    )
                )
                driver.js(
                    "document.querySelector('.report-options .reference-options input').click()"
                )
                driver.click("Generate preview")
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.report-preview .markdown-body')"
                    )
                )
                driver.click("Export bundle")
                exported = checks.wait_until(
                    lambda: next(downloads.glob("dragontrip-report-*.zip"), None)
                )
                import zipfile

                with zipfile.ZipFile(exported) as archive:
                    assert "report.html" in archive.namelist()
                    assert (
                        len(
                            [n for n in archive.namelist() if n.startswith("evidence/")]
                        )
                        == 1
                    )
                    assert (
                        "data:image/png;base64," in archive.read("report.html").decode()
                    )
                    assert (
                        "Manual verification recorded in the installed application."
                        in archive.read("report.md").decode()
                    )
                checks.capture_ui(
                    checks.VALIDATION / "screenshots/native-report-bundle.png"
                )
                recovery_spec = importlib.util.spec_from_file_location('native_recovery', Path(__file__).with_name('native-recovery-check.py'))
                recovery = importlib.util.module_from_spec(recovery_spec)
                recovery_spec.loader.exec_module(recovery)
                recovery.check(driver, checks, root)
                checks.VALIDATION.mkdir(parents=True, exist_ok=True)
                (checks.VALIDATION / "delivery-results.json").write_text(
                    '{"passed":true,"ipc":"native","checks":["new-project onboarding","SQLite draft recovery after full restart without local mirror","screenshot upload","finding template","retained retest","persistent report summary","ZIP export with selected screenshot"]}\n'
                )
                print(
                    "PASS: installed 0.9.0 onboarding, draft/restart recovery, evidence, retest and report bundle",
                    flush=True,
                )
            finally:
                try:
                    stop_application()
                finally:
                    wm.terminate()
                    wm.wait(timeout=10)
                    proc.terminate()
                    try:
                        proc.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait()


if __name__ == "__main__":
    main()
