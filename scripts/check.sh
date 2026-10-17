#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v cargo >/dev/null; then
  echo 'Cargo is required; install the pinned Rust toolchain and add cargo to PATH.' >&2
  exit 1
fi

python3 scripts/check-vendored-gtk.py
npm run lint
npm run format:check
.venv/bin/python -m pytest -q
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
