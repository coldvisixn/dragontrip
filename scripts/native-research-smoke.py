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
                driver.navigate("Targets & scope", ".scope-page")
                checks.wait_until(
                    lambda: driver.js(
                        "return !document.querySelector('[aria-label=\"Included targets\"]').disabled"
                    )
                )
                driver.fill(
                    '[aria-label="Included targets"]',
                    "app.htb\nadmin.htb\n10.10.10.0/24",
                )
                driver.click("Save scope")
                checks.wait_until(
                    lambda: driver.js(
                        "return document.body.textContent.includes('Scope saved.')"
                    )
                )

                def import_fixture(name, duplicate=False):
                    driver.navigate("Import results", ".imports-page")
                    driver.fill(
                        "input[type=file]",
                        str(
                            (
                                Path(__file__).resolve().parents[1]
                                / "tests/fixtures/imports"
                                / name
                            )
                        ),
                    )
                    driver.click("Preview import")
                    checks.wait_until(
                        lambda: driver.js(
                            "return !!document.querySelector('.import-preview')"
                        )
                    )
                    if name == "burp-items.xml" and not duplicate:
                        assert driver.js(
                            "return document.querySelector('.import-counts').textContent.includes('2 applications')"
                        )
                        assert len(driver.graph()["nodes"]) == 0
                    driver.click(
                        "Confirm existing source"
                        if duplicate
                        else "Import selected records"
                    )
                    checks.wait_until(
                        lambda: driver.js(
                            "return !document.querySelector('.import-preview') && document.body.textContent.includes(arguments[0])",
                            "already imported" if duplicate else "Import saved.",
                        )
                    )

                import_fixture("burp-items.xml")
                count = len(driver.graph()["nodes"])
                import_fixture("burp-items.xml", True)
                assert len(driver.graph()["nodes"]) == count
                import_fixture("burp-issues.xml")
                driver.navigate("Web applications", ".web-map")
                driver.js(
                    """
                    const s=document.querySelector('[aria-label="Web application"]');
                    s.value='http://app.htb';s.dispatchEvent(new Event('change',{bubbles:true}));
                """
                )
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.endpoint-row')"
                    )
                )
                driver.js(
                    """
                    const s=document.querySelector('[aria-label="Endpoint method"]');
                    s.value='POST';s.dispatchEvent(new Event('change',{bubbles:true}));
                """
                )
                checks.wait_until(
                    lambda: driver.js(
                        "return document.querySelectorAll('.endpoint-row').length===1"
                    )
                )
                driver.js("document.querySelector('.endpoint-row').click()")
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.import-observations details')"
                    )
                )
                driver.js(
                    "document.querySelector('.import-observations details').open=true"
                )
                driver.click("View original source")
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.source-evidence pre')"
                    )
                )
                assert driver.js(
                    "return document.querySelector('.source-evidence pre').textContent.includes('DOCTYPE items')"
                )
                checks.capture_ui(
                    checks.VALIDATION / "screenshots/native-research-map.png"
                )
                driver.click("Export original")
                exported = checks.wait_until(
                    lambda: next(downloads.glob("burp-items*.xml"), None)
                )
                expected = (
                    Path(__file__).resolve().parents[1]
                    / "tests/fixtures/imports/burp-items.xml"
                )
                assert exported.read_bytes() == expected.read_bytes()
                assert exported.stat().st_mode & 0o777 == 0o600
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
                driver.fill(
                    ".knowledge-editor input", "Native imported endpoint context"
                )
                driver.click("Save note")
                checks.wait_until(
                    lambda: driver.js(
                        "return !document.querySelector('.knowledge-editor') && document.body.textContent.includes('Native imported endpoint context')"
                    )
                )
                driver.navigate("Network Graph", ".graph-toolbar")
                checks.wait_until(
                    lambda: driver.js(
                        "return document.querySelectorAll('.object-card.application').length===2"
                    )
                )
                assert driver.js(
                    "return document.querySelectorAll('.object-card.endpoint').length===0"
                )
                checks.capture_ui(
                    checks.VALIDATION / "screenshots/native-research-graph.png"
                )
                stop_application()
                driver.start(args.application.resolve())
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.main') && !!document.querySelector('.sidebar')"
                    )
                )
                driver.navigate("Web applications", ".web-map")
                assert driver.js("return document.querySelector('[aria-label=\"Endpoint method\"]').value==='POST'")
                driver.js("const m=document.querySelector('[aria-label=\"Endpoint method\"]');m.value='all';m.dispatchEvent(new Event('change',{bubbles:true}));")
                driver.js(
                    """
                    const s=document.querySelector('[aria-label="Web application"]');
                    s.value='http://admin.htb';s.dispatchEvent(new Event('change',{bubbles:true}));
                """
                )
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.endpoint-row')"
                    )
                )
                assert driver.js(
                    "return document.querySelector('.endpoint-row').textContent.includes('http://admin.htb/login')"
                )
                assert len(driver.graph()["nodes"]) > count
                print(
                    "PASS: installed Tauri scope, Burp items/issues preview/import, vhosts/methods, source view/private export, linked note, idempotence, collapsed overview and process-restart persistence",
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
