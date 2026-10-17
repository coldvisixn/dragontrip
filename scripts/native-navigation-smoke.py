"""Check scope/imports/web map through the installed Tauri/WebKit application."""

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
                driver.fill(".dialog input", "Native planning delivery")
                driver.click("Create project")
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.start-project')"
                    )
                )
                driver.navigate("Network Graph", ".graph-toolbar")
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.graph-toolbar')"
                    )
                )
                driver.navigate("Web applications", ".web-map")
                driver.js("document.querySelector('.web-map details').open=true")
                driver.fill('[aria-label="Manual web URL"]', "http://app.htb/login")
                driver.click("Add web object")
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.endpoint-row')"
                    )
                )
                assert driver.js(
                    "return document.querySelectorAll('.sidebar nav button').length===6"
                )
                assert driver.js(
                    "return document.querySelector('[role=tab][aria-selected=true]').textContent==='Web applications'"
                )
                driver.js(
                    "[...document.querySelectorAll('.sidebar nav button')].find(b=>b.textContent.trim()==='Recon').click()"
                )
                checks.wait_until(
                    lambda: driver.js(
                        "return document.querySelector('[role=tab][aria-selected=true]').textContent==='Scans'"
                    )
                )
                driver.js(
                    "[...document.querySelectorAll('.sidebar nav button')].find(b=>b.textContent.trim()==='Research').click()"
                )
                checks.wait_until(
                    lambda: driver.js(
                        "return document.querySelector('[role=tab][aria-selected=true]').textContent==='Web applications'"
                    )
                )
                driver.js(
                    "const s=document.querySelector('[aria-label=\"Web application\"]');s.value='http://app.htb';s.dispatchEvent(new Event('change',{bubbles:true}));"
                )
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.endpoint-row')"
                    )
                )
                driver.js("document.querySelector('.endpoint-row').click()")
                driver.js(
                    "const s=document.querySelector('.endpoint-detail .source-actions select');s.value='note';s.dispatchEvent(new Event('change',{bubbles:true}));"
                )
                driver.click("Create linked record")
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.knowledge-article')"
                    )
                )
                driver.click("Edit note")
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.knowledge-editor')"
                    )
                )
                assert driver.js(
                    "return document.querySelector('[role=tab][aria-selected=true]').textContent==='Notes'"
                )
                driver.fill(
                    ".knowledge-editor input", "Native grouped navigation context"
                )
                driver.click("Save note")
                checks.wait_until(
                    lambda: driver.js(
                        "return !document.querySelector('.knowledge-editor')"
                    )
                )
                driver.navigate("Web applications", ".web-map")
                driver.js(
                    "const s=document.querySelector('[aria-label=\"Web application\"]');s.value='http://app.htb';s.dispatchEvent(new Event('change',{bubbles:true}));"
                )
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.endpoint-row')"
                    )
                )
                checks.capture_ui(
                    checks.VALIDATION / "screenshots/native-navigation-expanded.png"
                )
                driver.click("Collapse sidebar")
                assert driver.js(
                    "return document.querySelector('.sidebar').clientWidth<100"
                )
                checks.capture_ui(
                    checks.VALIDATION / "screenshots/native-navigation-collapsed.png"
                )
                stop_application()
                driver.start(args.application.resolve())
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.main') && !!document.querySelector('.sidebar')"
                    )
                )
                assert driver.js(
                    "return document.querySelector('.sidebar').classList.contains('collapsed')"
                )
                driver.click("Tools")
                checks.wait_until(
                    lambda: driver.js(
                        "return document.body.textContent.includes('Tool integrations')"
                    )
                )
                assert driver.js(
                    "return document.querySelector('[role=tab][aria-selected=true]').textContent==='Tools'"
                )
                print(
                    "PASS: installed grouped navigation, six links, tabs, last section, linked note route, compact sidebar and restart persistence",
                    flush=True,
                )
            finally:
                try:
                    stop_application()
                finally:
                    proc.terminate()
                    try:
                        proc.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait()


if __name__ == "__main__":
    main()
