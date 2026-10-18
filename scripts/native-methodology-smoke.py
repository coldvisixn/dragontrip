"""Check scope/imports/web map through the installed Tauri/WebKit application."""

import argparse
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import http.server
import threading

spec = importlib.util.spec_from_file_location(
    "dragontrip_native_checks", Path(__file__).with_name("native-smoke.py")
)
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)


class LocalTarget(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(
            b"<title>Dragontrip local workflow target</title>Owned acceptance target"
        )

    def log_message(self, *_):
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("application", type=Path)
    parser.add_argument("--driver", default="tauri-driver")
    args = parser.parse_args()
    native_driver = shutil.which("WebKitWebDriver")
    if not native_driver:
        raise SystemExit("WebKitWebDriver is required")
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 8089), LocalTarget)
    threading.Thread(target=server.serve_forever, daemon=True).start()
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
                checks.wait_until(lambda: driver.js("return !!document.querySelector('.project-plan')"))
                driver.navigate("Network Graph", ".graph-toolbar")
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.graph-toolbar')"
                    )
                )
                driver.navigate("Web applications", ".web-map")
                driver.js("document.querySelector('.web-map details').open=true")
                driver.fill('[aria-label="Manual web URL"]', "http://app.htb/")
                driver.js(
                    "document.querySelector('.web-map input[type=checkbox]').click()"
                )
                driver.click("Add web object")
                app_node = checks.wait_until(
                    lambda: next(
                        (
                            n
                            for n in driver.graph()["nodes"]
                            if n["kind"] == "application"
                        ),
                        None,
                    )
                )
                driver.navigate("Methodologies", ".methodology-page")
                driver.select('[aria-label="Methodology object"]', app_node["id"])
                driver.click("Add methodology")
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.methodology-check')"
                    )
                )
                driver.js(
                    """
                    const controls=document.querySelectorAll('.methodology-check select');
                    ['tested','in_progress','not_applicable'].forEach((value,i)=>{ controls[i].value=value; controls[i].dispatchEvent(new Event('change',{bubbles:true})); });
                """
                )
                driver.fill(
                    ".methodology-check textarea",
                    "Reviewed in the isolated native acceptance project. Explicit operator decision; never inferred from scan output.",
                )
                driver.click("Save methodology")
                checks.wait_until(
                    lambda: driver.js(
                        "return document.body.textContent.includes('Methodology saved.')"
                    )
                )
                driver.js("document.querySelector('.main').scrollTop=0")
                checks.capture_ui(
                    checks.VALIDATION / "screenshots/native-methodology.png"
                )
                driver.navigate("Targets & scope", ".scope-page")
                checks.wait_until(
                    lambda: driver.js(
                        "return !document.querySelector('[aria-label=\"Included targets\"]').disabled"
                    )
                )
                driver.fill('[aria-label="Included targets"]', "127.0.0.1")
                driver.click("Save scope")
                checks.wait_until(
                    lambda: driver.js(
                        "return document.body.textContent.includes('Scope saved.')"
                    )
                )
                driver.navigate("Recon workflows", ".workflows-page")
                driver.fill(
                    '[aria-label="Workflow name"]',
                    "Local HTTP fingerprint and inspection",
                )
                driver.fill('[aria-label="Step 1 target"]', "http://127.0.0.1:8089/")
                driver.fill('[aria-label="Step 2 target"]', "http://127.0.0.1:8089/")
                driver.click("Save workflow")
                checks.wait_until(
                    lambda: driver.js(
                        "return [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Preview workflow')"
                    )
                )
                driver.click("Preview workflow")
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.workflow-preview')"
                    )
                )
                driver.click("Create run")
                checks.wait_until(
                    lambda: driver.js(
                        "return [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Launch step 1')"
                    )
                )
                driver.js(
                    "document.querySelector('.workflow-preview input[type=checkbox]').click()"
                )
                driver.click("Launch step 1")
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.workflow-step.completed')"
                    ),
                    90,
                )
                driver.js(
                    "document.querySelector('.workflow-preview input[type=checkbox]').click()"
                )
                driver.click("Launch step 2")
                checks.wait_until(
                    lambda: driver.js(
                        "return document.body.textContent.includes('Sequence complete.')"
                    ),
                    90,
                )
                driver.js(
                    "document.querySelector('.workflow-editor').open=false;document.querySelector('.main').scrollTop=0"
                )
                checks.capture_ui(checks.VALIDATION / "screenshots/native-workflow.png")
                stop_application()
                driver.start(args.application.resolve())
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.main') && !!document.querySelector('.sidebar')"
                    )
                )
                driver.navigate("Methodologies", ".methodology-page")
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.methodology-list button')"
                    )
                )
                driver.js("document.querySelector('.methodology-list button').click()")
                checks.wait_until(
                    lambda: driver.js(
                        "return document.querySelector('.methodology-check select')?.value==='tested'"
                    )
                )
                print(
                    "PASS: native four-state methodology, explicit notes, two actual sequential WhatWeb/httpx processes, run history and restart persistence",
                    flush=True,
                )
            except Exception:
                # Preserve the actual UI state instead of reporting only a
                # generic missing-button timeout after the temporary app exits.
                try:
                    print(driver.js("return document.body.innerText"), flush=True)
                    print(driver.js("return [...document.querySelectorAll('select')].map(s=>({label:s.getAttribute('aria-label'),value:s.value,options:[...s.options].map(o=>({value:o.value,text:o.text}))}))"), flush=True)
                    checks.capture_ui(checks.VALIDATION / "screenshots/native-methodology-failure.png")
                except Exception:
                    pass
                raise
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
