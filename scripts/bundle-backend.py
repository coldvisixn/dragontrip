"""Run inside the build virtualenv. One-folder distribution; no runtime pip."""
import shutil
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
subprocess.run([
    sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean",
    "--name", "dragontrip-backend", "--onedir", "--paths", str(root / "backend"),
    "--collect-submodules", "uvicorn", "--collect-submodules", "alembic",
    "--add-data", f"{root / 'backend/alembic.ini'}:.",
    "--add-data", f"{root / 'backend/migrations'}:migrations",
    "--distpath", str(root / "backend/dist"),
    "--workpath", str(root / "backend/build"),
    "--specpath", str(root / "backend/build"),
    str(root / "backend/entry.py")
], check=True, cwd=root)
dest = root / "src-tauri/resources/backend"
if dest.exists():
    shutil.rmtree(dest)
shutil.copytree(root / "backend/dist/dragontrip-backend", dest)
print(f"Backend staged at {dest}")
