"""Reverse the documented compatibility patch and verify published source hashes."""

import hashlib
import json
import shutil
import subprocess
import tempfile
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "src-tauri/vendor"


def main():
    provenance = json.loads((VENDOR / "upstream-checksums.json").read_text())
    lock = tomllib.loads((ROOT / "src-tauri/Cargo.lock").read_text())
    for name, source in provenance.items():
        resolved = [p for p in lock["package"] if p["name"] == name and p["version"] == source["version"]]
        if len(resolved) != 1 or "source" in resolved[0]:
            raise RuntimeError(f"The verified compatibility patch is not selected for {name}")

    with tempfile.TemporaryDirectory(prefix="dragontrip-gtk-verify-") as directory:
        restored = Path(directory)
        for name in provenance:
            source = VENDOR / name
            if any(p.is_symlink() for p in source.rglob("*")):
                raise RuntimeError(f"Unexpected symlink in {name}")
            shutil.copytree(source, restored / name)
        result = subprocess.run(
            ["patch", "--reverse", "--batch", "--fuzz=0", "-p1", "-i", str(VENDOR / "gtk-compat.patch")],
            cwd=restored,
            capture_output=True,
            text=True,
        )
        if result.returncode:
            raise RuntimeError("Compatibility patch no longer matches the vendored source: " + result.stdout + result.stderr)
        for name, source in provenance.items():
            package = restored / name
            actual = {
                str(p.relative_to(package)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in package.rglob("*") if p.is_file()
            }
            if actual != source["files"]:
                changed = sorted(k for k in actual.keys() | source["files"].keys() if actual.get(k) != source["files"].get(k))
                raise RuntimeError(f"Unexpected changes to upstream {name}: {changed}")
    print("GTK compatibility patch and upstream source hashes: PASS")


if __name__ == "__main__":
    main()
