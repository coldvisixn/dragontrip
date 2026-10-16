# Development and packaging

[Install the ready-made package](INSTALL.md) if you want to use Dragontrip rather than build it.

## Toolchain

- Linux x86_64 with GTK 3 / WebKitGTK 4.1 development packages.
- Node.js 22+ and npm.
- Python 3.12, including `venv` and development headers, as used by the verified build.
- The Rust version pinned in `rust-toolchain.toml` (currently 1.99.0).

On Kali/Debian-family systems:

```bash
sudo apt update
sudo apt install -y build-essential pkg-config libssl-dev libwebkit2gtk-4.1-dev \
  libgtk-3-dev librsvg2-dev patchelf python3 python3-venv python3-dev nmap

git clone https://github.com/coldvisixn/dragontrip.git
cd dragontrip
bash scripts/setup.sh
npm run desktop:dev
```

Install Node/Rust through their official supported distribution channels. Keep the supplied npm, Cargo and Python lockfiles. `setup.sh` installs the locked Python environment and npm dependencies.

Tauri manages Vite and backend lifecycle during development. `npm run dev` alone starts only the frontend and cannot obtain the desktop API credentials; the browser test scripts provide a test-only connection bridge. Production uses bundled assets and never runs Vite.

## Checks

```bash
.venv/bin/python -m pytest -q
npm test
npm run build
```

The live Nmap test starts its own loopback HTTP server:

```bash
DRAGONTRIP_LIVE_TEST=1 .venv/bin/python -m pytest tests/test_nmap_live.py -q -s
```

For browser acceptance, start Vite on port 1420 and use a system Chromium:

```bash
CHROMIUM_PATH=/usr/bin/chromium node scripts/workspace-smoke.cjs
CHROMIUM_PATH=/usr/bin/chromium node scripts/planning-smoke.cjs
```

For the production backend, add `DRAGONTRIP_TEST_BACKEND=backend/dist/dragontrip-backend/dragontrip-backend`. Tests create isolated project data. Recon tests use owned loopback targets; do not run scenarios sharing port 8080 concurrently.

## Build a `.deb`

```bash
source .venv/bin/activate
npm run desktop:build
python scripts/smoke-packaged.py
ls src-tauri/target/release/bundle/deb/*.deb
```

The build stages the Python interpreter/dependencies with PyInstaller, builds Tauri and writes a normalized `dragontrip_<version>_amd64.deb` and `.deb.sha256`. Recon tools stay system dependencies. PyInstaller does not make glibc independent: build on the oldest supported distribution and verify the exact resulting package.

Native tests require `tauri-driver`, the distribution's WebKit WebDriver package, Xvfb, D-Bus, screenshot tools and Pillow. The installed-launcher test also needs XFWM, wmctrl and desktop-file-utils. See [the managed-container recipe](BUILD-CLOUD.md) for the prepared cloud workflow and [release verification](BUILD-0.5.0.md) for concrete results.

## Repository map

| Directory | Purpose |
| --- | --- |
| `frontend/src/` | React UI, graph, knowledge, planning and reporting screens. |
| `backend/dragontrip/` | Local API, recon adapters, queue, persistence, evidence, archives and vault. |
| `backend/migrations/` | Alembic schema upgrades. |
| `src-tauri/` | Desktop lifecycle, IPC, security and Linux packaging. |
| `tests/` | Backend/API/persistence/parser/process tests. |
| `scripts/` | Setup, bundling and browser/native acceptance. |
| `.github/workflows/` | CI verification and tagged release publication. |
| `docs/` | User guides, architecture contracts and dated build evidence. |

[Contributing](../CONTRIBUTING.md) · [Extension contracts](EXTENSIONS.md) · [Publishing a release](RELEASING.md)
