"""Check planning/reporting through the installed Tauri/WebKit application."""

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
                        "return document.body.textContent.includes('Workspace overview')"
                    )
                )
                driver.click("New project")
                driver.fill(".dialog input", "Native planning delivery")
                driver.click("Create project")
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.graph-toolbar')"
                    )
                )
                driver.click("Custom node")
                driver.fill(".dialog input", "Delivery object")
                driver.click("Add object")
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.object-card.custom')"
                    )
                )
                driver.navigate("Task board", ".tasks-page")
                driver.click("New task")
                driver.fill(
                    ".task-editor > fieldset > label > input", "Native follow-up task"
                )
                driver.fill(
                    ".task-editor .form-pair input:not([type=date])", "Reviewer"
                )
                driver.js(
                    "document.querySelector('.task-editor .reference-options input[type=checkbox]').click()"
                )
                driver.js(
                    """
                    const element=document.querySelector('.task-editor select[aria-label=Priority]');
                    element.value='urgent';element.dispatchEvent(new Event('change',{bubbles:true}));
                """
                )
                driver.click("Save task")
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.task-card') && !document.querySelector('.task-editor')"
                    )
                )
                assert driver.js(
                    "return document.querySelector('.task-card').textContent.includes('Reviewer') && document.querySelector('.task-card').textContent.includes('urgent') && document.querySelector('.task-card').textContent.includes('Delivery object')"
                )
                checks.capture_ui(
                    checks.VALIDATION / "screenshots/native-task-board.png"
                )
                driver.navigate("Project overview", ".engagement-metrics")
                assert driver.js(
                    "return document.querySelector('.engagement-metrics').textContent.includes('0 / 1')"
                )
                driver.navigate("Reports", ".report-options")
                driver.click("Generate preview")
                checks.wait_until(
                    lambda: driver.js(
                        "return !!document.querySelector('.report-preview .markdown-body')"
                    )
                )
                assert driver.js(
                    "return document.querySelector('.report-preview').textContent.includes('Native follow-up task')"
                )
                driver.click("Export Markdown")
                exported = checks.wait_until(
                    lambda: next(downloads.glob("dragontrip-report-*.md"), None)
                )
                assert "Native follow-up task" in exported.read_text()
                assert exported.stat().st_mode & 0o777 == 0o600
                checks.capture_ui(checks.VALIDATION / "screenshots/native-report.png")
                stop_application()
                driver.start(args.application.resolve())
                checks.wait_until(
                    lambda: driver.js(
                        "return document.body.textContent.includes('Workspace overview')"
                    )
                )
                driver.navigate("Task board", ".tasks-page")
                checks.wait_until(
                    lambda: driver.js("return !!document.querySelector('.task-card')")
                )
                assert driver.js(
                    "return document.querySelector('.task-card').textContent.includes('Native follow-up task')"
                )
                print(
                    "PASS: installed task board, owner/priority/object links, overview, Markdown report/export and restart persistence",
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
