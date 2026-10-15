"""Normalize Tauri's product-name artifact to the documented Linux package name."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
version = json.loads((root / "package.json").read_text())["version"]
directory = root / "src-tauri/target/release/bundle/deb"
source = directory / f"Dragontrip_{version}_amd64.deb"
target = directory / f"dragontrip_{version}_amd64.deb"
if source.exists():
    source.replace(target)
if not target.is_file():
    raise SystemExit(f"Expected bundle missing: {target}")
digest = hashlib.sha256(target.read_bytes()).hexdigest()
target.with_suffix(".deb.sha256").write_text(f"{digest}  {target.name}\n")
print(target)
print(f"SHA256 {digest}")
