"""Capture the actual X11 display and reject an unpainted webview."""
from pathlib import Path
import subprocess
import time

from PIL import Image, ImageStat


def capture_ui(destination: Path, timeout=20, theme="dark"):
    deadline = time.monotonic() + timeout
    destination.parent.mkdir(parents=True, exist_ok=True)
    last = "application window unavailable"
    while time.monotonic() < deadline:
        windows = subprocess.run(
            ["xdotool", "search", "--onlyvisible", "--class", "Dragontrip"],
            capture_output=True, text=True,
        ).stdout.splitlines()
        if not windows:
            time.sleep(.2)
            continue
        geometry = subprocess.check_output(
            ["xdotool", "getwindowgeometry", "--shell", windows[0]], text=True
        )
        bounds = dict(line.split("=", 1) for line in geometry.splitlines() if "=" in line)
        subprocess.run(["scrot", "--silent", "--overwrite", str(destination)], check=True)
        with Image.open(destination) as image:
            x, y = int(bounds["X"]), int(bounds["Y"])
            right = min(image.width, x + int(bounds["WIDTH"])) - 15
            bottom = min(image.height, y + int(bounds["HEIGHT"])) - 35
            # Inspect workspace pixels, excluding title bar and navigation sidebar.
            region = image.convert("L").crop((max(0, x + 240), max(0, y + 90), right, bottom))
            low, high = region.getextrema()
            statistics = ImageStat.Stat(region)
            mean, deviation = statistics.mean[0], statistics.stddev[0]
            expected_brightness = 150 < mean < 254.8 if theme == "light" else 5 < mean < 150
            if high - low > 40 and deviation > 8 and expected_brightness:
                return
            last = f"webview pixels are blank/unpainted for {theme} theme: range={low}..{high}, mean={mean:.1f}, deviation={deviation:.1f}"
        time.sleep(.3)
    raise RuntimeError(last + f"; display screenshot: {destination}")
