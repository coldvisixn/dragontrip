"""Verify the installed .desktop launcher and normal window close in an X11 desktop."""
import configparser
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import time

spec = importlib.util.spec_from_file_location("dragontrip_native_checks", Path(__file__).with_name("native-smoke.py"))
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)
process_tree, wait_until = checks.process_tree, checks.wait_until
from visual_check import capture_ui


def running_applications(executable):
    result = []
    for proc in Path("/proc").iterdir():
        if proc.name.isdigit():
            try:
                if (proc / "exe").resolve() == executable:
                    result.append(int(proc.name))
            except OSError:
                pass
    return result


def alive(pid):
    try:
        return next(line for line in Path(f"/proc/{pid}/status").read_text().splitlines()
                    if line.startswith("State:")).split()[1] != "Z"
    except (OSError, StopIteration):
        return False


def main():
    executable = Path("/usr/bin/dragontrip").resolve()
    desktop = Path("/usr/share/applications/Dragontrip.desktop")
    if running_applications(executable):
        raise RuntimeError("Close the existing Dragontrip session before running the isolated launcher check")
    subprocess.run(["desktop-file-validate", str(desktop)], check=True)
    config = configparser.ConfigParser(interpolation=None)
    config.read(desktop)
    entry = config["Desktop Entry"]
    assert entry["Name"] == "Dragontrip"
    assert entry["Exec"] == "dragontrip"
    assert entry["Terminal"].lower() == "false"
    assert Path("/usr/share/icons/hicolor/128x128/apps/dragontrip.png").is_file()

    with tempfile.TemporaryDirectory(prefix="dragontrip-launcher-") as storage:
        env = {**os.environ, "XDG_DATA_HOME": storage+"/data", "XDG_CONFIG_HOME": storage+"/config",
               "XDG_CACHE_HOME": storage+"/cache", "XDG_RUNTIME_DIR": storage+"/runtime",
               "GSETTINGS_BACKEND": "memory"}
        Path(env["XDG_RUNTIME_DIR"]).mkdir(mode=0o700)
        started = time.monotonic()
        subprocess.run(["gtk-launch", desktop.stem], env=env, check=True)
        pid = wait_until(lambda: next(iter(running_applications(executable)), None))
        try:
            windows = wait_until(lambda: subprocess.run(
                ["xdotool", "search", "--onlyvisible", "--class", "Dragontrip"],
                env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL).stdout.strip())
            window = windows.splitlines()[0]
            wm_class = subprocess.check_output(["xprop", "-id", window, "WM_CLASS"], env=env, text=True)
            assert "dragontrip" in wm_class
            # Gio may reparent launched applications; follow the actual application PID.
            tracked = {pid, *process_tree(pid)}
            capture_ui(Path(__file__).resolve().parent.parent/"docs/screenshots/installed-launcher.png")
            subprocess.run(["wmctrl", "-ic", hex(int(window))], env=env, check=True)
            wait_until(lambda: not any(alive(p) for p in tracked), 15)
            print(f"PASS: installed desktop launcher, icon/window class and normal close ({time.monotonic()-started:.2f}s)")
        finally:
            if alive(pid):
                os.kill(pid, 15)


if __name__ == "__main__":
    main()
