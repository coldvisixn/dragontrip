# DRAGONTRIP

[Builds and downloadable Debian artifacts](https://github.com/coldvisixn/dragontrip/actions/workflows/linux.yml)

Local security workspace for Kali Linux: Tauri 2 + React/TypeScript + Python/FastAPI + SQLite. Phase 2 recon automation: Nmap, WhatWeb, ProjectDiscovery httpx and ffuf, with a persistent infrastructure graph and bounded task queue.

**Current implementation: 0.5.0.** Phases 1–4 are implemented: recon automation, an investigation knowledge graph, Markdown/evidence/Timeline/search, encrypted credentials, portable projects, appearance/tool settings and graph/navigation improvements. [Phase 4](docs/PHASE4.md) records current validation and package details; [ROADMAP](docs/ROADMAP.md) maps the requested scope. Local build output is not a published release. The earlier [0.2.0 release run](https://github.com/coldvisixn/dragontrip/actions/runs/38792713976) contains only Phase 2.

## Investigation planning and reporting additions

This branch extends the completed 0.4.0 workspace with a persistent task board (owners, deadlines, priorities and object links), a project progress/risk overview, and configurable Markdown reports with preview and private Downloads export. Tasks participate in search, Timeline and portable project archives. See [planning and reporting](docs/PLANNING.md) for usage, verification and compatibility limits. A local 0.5.0 Debian package has passed installed-Debian native acceptance; see [build verification](docs/BUILD-0.5.0.md). It has not been published as a GitHub release.

## Implemented

- Dashboard, project creation/switching, last-project restoration, activity history.
- Quick/Full/Service Enumeration and saved custom profiles; four detected system tools, with IPv4 or IPv4 web-origin scope.
- FIFO queue, configurable 1–3 concurrent tasks, cancellation, deadlines, process group termination and restart recovery.
- Bounded terminal tail and raw XML evidence; XML parsing rejects entity expansion. Source XML exports use a native, private, atomic save in Downloads without overwriting existing files.
- Stable Host/Service/URL identities, scoped rescan updates, web technology evidence, preserved coordinates and custom objects.
- Lazy-loaded XYFlow graph with custom cards, pan/zoom, minimap, selection, Inspector, search, custom nodes/relationships and guarded deletion.
- Service-aware recommendations, paginated/filterable scan history, private XML/JSON export and settings for profiles/queue.
- Explicit manual hypotheses; automatically discovered objects link to their source scan.
- Resizable Inspector/task panel, logs/events, Ctrl+K palette, offline fonts, reduced-motion support.
- Alembic migrations, XDG storage, loopback API, fresh per-launch token, strict Host/Origin checks.
- Tauri-managed backend startup/shutdown; PyInstaller one-folder distribution; Linux launcher, icons and CI build recipe.

No sample discoveries are injected into user projects. Screenshots under `docs/screenshots/` come from real local recon tests; `native-graph.png` is from the packaged WebKitGTK application. Phase 3 adds editable custom objects, linked Notes and Findings, ordered manual Attack Paths and an encrypted Credentials Vault; see [docs/PHASE3.md](docs/PHASE3.md).

For installing the ready-made package, see [Инструкция для Kali](docs/INSTALL-KALI.md).

## Kali development setup

Build dependencies (on the Kali machine):

```bash
sudo apt update
sudo apt install -y build-essential pkg-config libssl-dev libwebkit2gtk-4.1-dev \
  libgtk-3-dev librsvg2-dev patchelf python3 python3-venv python3-dev nmap
```

Install Node.js 22+ / npm and Rust using their official installation instructions. The repository pins the verified Rust 1.99.0 toolchain in rust-toolchain.toml. Check `node --version`, `cargo --version` and `pkg-config --modversion webkit2gtk-4.1`.

```bash
cd dragontrip
bash scripts/setup.sh
npm run desktop:dev
```

Tauri starts Vite and the backend automatically. Production never runs Vite. Running `npm run dev` alone provides only the frontend and cannot obtain the desktop's API credentials.

Python 3.12 was used for the verified build. Build the Python distribution on the oldest Linux version you intend to support; PyInstaller does not make glibc independent.

## Tests

```bash
.venv/bin/python -m pytest -q
npm test
npm run build

# Starts and scans its own 127.0.0.1:8080 HTTP server only:
DRAGONTRIP_LIVE_TEST=1 .venv/bin/python -m pytest tests/test_nmap_live.py -q -s
```

Optional browser integration (requires a system Chromium for testing; Chromium is not an application dependency):

```bash
npm run dev
# In a second terminal:
CHROMIUM_PATH=/usr/bin/chromium node scripts/browser-smoke.cjs
```

This drives the real UI/API/Nmap pipeline and graph interactions. It injects only Tauri's connection-delivery function into the test browser. Nmap must be installed, and local port 8080 must be free.

## Build the Debian package

```bash
source .venv/bin/activate
npm run desktop:build
python scripts/smoke-packaged.py
ls src-tauri/target/release/bundle/deb/*.deb
sudo apt install ./src-tauri/target/release/bundle/deb/dragontrip_0.5.0_amd64.deb
dragontrip
# Uninstall (user projects remain):
sudo apt remove dragontrip
```

The build embeds the Python interpreter and dependencies as a one-folder resource. Nmap remains a system dependency, detected at runtime. Frontend dependencies and Rust build tools are not shipped. Lockfiles are supplied for npm, Cargo and the tested Python environment. The GitHub workflow builds downloadable packages and checks the installed application on Kali Rolling. Its native-driver path handling was corrected after the first CI run; current results are linked above.

Before a stable release, complete the remaining Kali installation checks in [docs/VALIDATION.md](docs/VALIDATION.md).

## Data and process model

`$XDG_DATA_HOME/dragontrip/` (default `~/.local/share/dragontrip/`) contains SQLite and `artifacts/<scan UUID>.xml or .json`. Storage is created privately; the desktop sets a restrictive umask. Alembic upgrades the schema before opening the API. Back up the entire data directory while the application is closed.

Only successful XML/JSON artifacts are retained. They are evidence, not disposable temporary files; failed/cancelled partial evidence and temporary wordlists are removed. Evidence retention is currently manual. Terminal output combines stdout/stderr and keeps the last 64 KiB per scan. Historical scans retain at most that tail, not complete console transcripts.

Tauri generates a random 256-bit token and launches the backend on an OS-assigned IPv4 loopback port. Token transport is restricted to local Tauri IPC and the backend process environment. The API rejects unknown Host/Origin values and requires a bearer header on every request. Desktop CSP restricts scripts to bundled assets. Browser polling is used instead of a WebSocket: project updates every 2 seconds and selected terminal tail every 1.5 seconds while scans run. Idle polling stops after completion. Polling is bounded and cleaned up on project changes/unmount.

The backend supervises each recon tool in a separate process group. Shutdown cancels tasks, sends TERM then KILL if necessary, and reaps children. A parent watchdog handles unexpected shell loss; interrupted jobs are marked on restart. No automatic scan resumes.

## Layout

- `src-tauri/`: desktop lifecycle, IPC, security and Debian metadata.
- `frontend/src/`: application/design system; graph code loaded on demand.
- `backend/dragontrip/`: API, models, tool adapter/parser, task supervisor, graph ingest.
- `backend/migrations/`: versioned database migrations.
- `tests/`: API, persistence, parser, lifecycle and live Nmap tests.
- `scripts/`: setup, Python bundling and integration verification.
- `docs/`: verification results and outstanding native checks.

## Known limits and next priorities

1. Install the built Debian package on Kali XFCE and complete the applications-menu acceptance check.
2. Repeat the supplied whole-application memory/CPU and 100–300-node profile on the 4 GB VirtualBox VM.
3. Graph overview metadata is still loaded together; benchmark engagements larger than the documented 1,000-object fixture before increasing archive/data limits.
4. Scan artifact retention remains manual; project archives and attachment deletion are available.
5. Run the updated installed-Kali CI scenario and the user’s 4 GB VirtualBox hardware acceptance before labeling the package a stable Kali release.

The current scan profile is intentionally fixed: `-sT -sV --version-light -n -Pn --top-ports 100 --max-retries 1 --host-timeout 180s --stats-every 2s -v -oX <artifact> <IPv4>`. There are no custom commands, exploit actions, credential storage or automatic follow-up tools. Permission is confirmed for each target before launch.

## Native integration and profiling

On an Ubuntu/Debian test machine, install `webkit2gtk-driver`, `xvfb`, `xauth`, `dbus-x11`, `scrot` and `xdotool` (current Kali names its driver package `webkitgtk-webdriver`), then install `tauri-driver` with `cargo install tauri-driver --locked`. Run against the installed application or an extracted Debian executable:

```bash
xvfb-run -a .venv/bin/python scripts/native-smoke.py /usr/bin/dragontrip --profile
```

This uses actual Tauri IPC, the packaged frontend/backend and system Nmap. It checks node dragging and manual links, restarts the native application and closes it during a scan. Profiling creates explicitly manual test objects in temporary storage for 100/300-node measurements. It excludes WebDriver/Xvfb from application process totals and reports both summed RSS and PSS. Port 8080 must be free. Do not run this simultaneously with the browser/live-Nmap tests, which use the same test port.

Linux defaults to WebKit's non-accelerated rendering policy for small VMs. On a machine with a suitable GPU, `DRAGONTRIP_HARDWARE_ACCELERATION=1 dragontrip` leaves WebKit's standard policy enabled. The default is configured before GTK/WebKit initialization to avoid blank windows on WebKitGTK 2.54; ordinary startup requires no user environment settings.

Installed-package checks (requires the XFWM window manager plus `wmctrl`, `xdotool`, `x11-utils`, `libgtk-3-bin` and `desktop-file-utils`):

```bash
xvfb-run -a dbus-run-session -- bash scripts/installed-smoke.sh
```

The check launches the actual desktop entry with `gtk-launch`, checks its icon/window class and visible X11 pixels, and closes it through the window manager before the full native acceptance/profile test. Native checks use Pillow from the development lockfile; installed-system checks additionally need XFWM, wmctrl, desktop-file-utils and python3-pil. The isolated Docker CI job disables the nested WebKit sandbox for the test only; the application never disables its production sandbox.

Extension and adapter contracts: [EXTENSIONS.md](docs/EXTENSIONS.md). Full user-facing features and shortcuts: [PHASE4.md](docs/PHASE4.md).
