"""Audit the complete dependency tree, including the registry baseline of backports."""

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path)
    parser.add_argument("--no-fetch", action="store_true")
    args = parser.parse_args()
    # A path dependency must not silently disappear from advisory monitoring.
    subprocess.run([sys.executable, str(ROOT / "scripts/check-vendored-gtk.py")], check=True)
    provenance = json.loads((ROOT / "src-tauri/vendor/upstream-checksums.json").read_text())
    lock = (ROOT / "src-tauri/Cargo.lock").read_text()
    for name, source in provenance.items():
        block = f'[[package]]\nname = "{name}"\nversion = "{source["version"]}"\n'
        if lock.count(block) != 1:
            raise RuntimeError(f"Cannot identify the backported {name} in Cargo.lock")
        registry = 'source = "registry+https://github.com/rust-lang/crates.io-index"\n'
        checksum = f'checksum = "{source["archive_sha256"]}"\n'
        lock = lock.replace(block, block + registry + checksum, 1)
    with tempfile.TemporaryDirectory(prefix="dragontrip-rust-audit-") as directory:
        audit_lock = Path(directory) / "Cargo.lock"
        audit_lock.write_text(lock)
        command = ["cargo", "audit", "--file", str(audit_lock), "--json"]
        if args.db:
            command += ["--db", str(args.db)]
        if args.no_fetch:
            command.append("--no-fetch")
        result = subprocess.run(command, capture_output=True, text=True)
    if result.stderr:
        print(result.stderr, file=sys.stderr, end="")
    try:
        report = json.loads(result.stdout)
    except ValueError:
        raise RuntimeError("RustSec did not return a complete audit report") from None
    if result.returncode not in {0, 1} or "vulnerabilities" not in report:
        raise RuntimeError("RustSec could not complete the dependency audit")
    failed = False
    for finding in report["vulnerabilities"]["list"]:
        print_finding("VULNERABILITY", finding)
        failed = True
    for kind, findings in report.get("warnings", {}).items():
        for finding in findings:
            package, advisory = finding["package"], finding["advisory"]
            if (
                kind == "unsound"
                and package["name"] == "glib"
                and package["version"] == provenance["glib"]["version"]
                and advisory["id"] == "RUSTSEC-2024-0429"
            ):
                # Source hashes + exact reverse-patch verification above are
                # mandatory. Optimized behavioral tests also gate packaging.
                print_finding("VERIFIED BACKPORT (original version advisory)", finding)
            else:
                print_finding("WARNING: " + kind, finding)
                failed |= kind == "unsound"
    if failed:
        raise SystemExit(1)
    print("Rust dependency audit, including backport registry baselines: PASS")


def print_finding(label, finding):
    package, advisory = finding["package"], finding["advisory"]
    print(f'{label}: {package["name"]} {package["version"]}: {advisory["id"]}: {advisory["title"]}')


if __name__ == "__main__":
    main()
