"""Private, non-overwriting exports to the user's Downloads directory."""

import hashlib
import os
import re
import shutil
import subprocess
import tempfile
import shlex
from pathlib import Path
from .nmap import external_environment


def export_file(source: Path, filename: str):
    configured = os.environ.get("XDG_DOWNLOAD_DIR", "")
    directory = (
        Path(configured) if configured and Path(configured).is_absolute() else None
    )
    if directory is None:
        config = (
            Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
            / "user-dirs.dirs"
        )
        try:
            if config.stat().st_size <= 65536:
                for line in config.read_text().splitlines():
                    if line.strip().startswith("XDG_DOWNLOAD_DIR="):
                        values = shlex.split(line.split("=", 1)[1])
                        if len(values) == 1:
                            candidate = Path(
                                values[0].replace("$HOME", str(Path.home()))
                            )
                            if candidate.is_absolute():
                                directory = candidate
        except (OSError, ValueError):
            pass
    if directory is None and shutil.which("xdg-user-dir"):
        result = subprocess.run(
            ["xdg-user-dir", "DOWNLOAD"],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=3,
            env=external_environment(),
        )
        candidate = Path(result.stdout.strip())
        if result.returncode == 0 and candidate.is_absolute():
            directory = candidate
    directory = directory or Path.home() / "Downloads"
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    filename = re.sub(r"[\x00-\x1f\x7f]", "", Path(filename).name)[:160]
    if filename in {"", ".", ".."}:
        raise ValueError("Invalid export filename")
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=directory, prefix=".dragontrip-", delete=False
        ) as output, source.open("rb") as data:
            temporary = Path(output.name)
            os.chmod(temporary, 0o600)
            digest = hashlib.sha256()
            while chunk := data.read(65536):
                output.write(chunk)
                digest.update(chunk)
            output.flush()
            os.fsync(output.fileno())
        for suffix in range(1000):
            name = (
                filename
                if suffix == 0
                else f"{Path(filename).stem}-{suffix}{Path(filename).suffix}"
            )
            target = directory / name
            try:
                os.link(temporary, target)
                return {"path": str(target), "sha256": digest.hexdigest()}
            except FileExistsError:
                continue
        raise ValueError("Too many exports with the same filename")
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)
