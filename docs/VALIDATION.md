# Verification record — 15 October 2026

## Completed checks

- Python 3.12, Rust 1.99.0, Linux x86_64.
- 17 backend tests passed, including actual Nmap 7.95 against a test-owned loopback HTTP server. Coverage includes IPv4 validation, XML/entity protection, Host/Origin/token guards, persistence and idempotent ingestion, historical evidence, custom objects, process errors, cancellation before/during launch and restart recovery.
- 7 frontend tests passed: projects/API, Inspector/evidence, coordinate saves, retry/errors, native export action/error reporting, command palette and bounded DOM rendering for a 1,000-row inventory.
- TypeScript/Vite production build, Cargo check with lockfile, Rust formatting check and optimized Tauri release build passed.
- PyInstaller one-folder distribution built and passed authenticated HTTP + migrations + restart persistence tests.
- Debian package built: `dragontrip_0.1.0_amd64.deb`, approximately 28.2 MiB compressed / 66.9 MiB installed. It contains the Rust executable, bundled frontend, Python runtime/dependencies, launcher and icons. It contains no Nmap, Node modules or Rust toolchain.
- Debian control metadata and desktop launcher validated; the actual X11 window class matches the launcher. Library dependencies are WebKitGTK 4.1 and GTK 3. A SHA-256 file accompanies the artifact.
- Browser UI integration passed using real API/Nmap and only a test bridge for connection delivery.
- **Native packaged application test passed with actual Tauri IPC and WebKitGTK, without an IPC/API mock.**

## Native scenario exercised

The executable and backend were extracted from the built Debian archive. The test:

1. Launched the real native application and loaded Dashboard.
2. Created a project and scanned its own 127.0.0.1:8080 HTTP server using actual Nmap.
3. Displayed the resulting Host, Service, source XML evidence and Inspector.
4. Exported source XML via the native filesystem command, checking private permissions, collision protection and rejection of an invalid scan ID.
5. Dragged a service node and verified its new coordinates in SQLite through the authenticated API.
6. Added a custom hypothesis and connected its handle to the host.
7. Closed the application and required its application/backend/WebKit descendants to exit.
8. Relaunched and verified the project, manual relationship and coordinates, with no automatic scan restart.
9. Closed the native application while another Nmap task was active; no live application descendants remained.

See `scripts/native-smoke.py` and `docs/screenshots/native-graph.png`.

## Native resource measurements

Full measurements are in [native-profile.json](native-profile.json). The script includes the Rust shell, WebKit renderer/network processes, Python backend and Nmap when running. It excludes WebDriver, Xvfb and the test HTTP server.

PSS attributes shared pages proportionally. Summed RSS counts shared pages in more than one process; both are reported. CPU is a short one-second sample across owned processes, where 100% means one core. These samples are not steady-state averages or peak-memory limits. Idle/graph measurements follow a four-second warmup.

| Scenario | Sum RSS | Sum PSS | CPU sample |
| --- | --- | --- | --- |
| Dashboard | 452 MiB | 327 MiB | 12.5% |
| Active scan | 527 MiB | 399 MiB | 3.8% |
| Graph, 100 nodes | 493 MiB | 368 MiB | 1.9% |
| Graph, 300 nodes | 547 MiB | 422 MiB | 8.6% |

Native launch to Dashboard: about 1.82 s, including the automation launch. Node drag frame samples: median 16 ms; p95 17 ms at 100 nodes and 26 ms at 300 nodes. All fixture objects used for profiling were explicitly manual hypotheses, stored only in the test's temporary data directory. Discovered service results were never fabricated.

Linux uses WebKit's native non-accelerated rendering policy by default, selected after comparing compositor memory costs in this virtual-display environment. The opt-in `DRAGONTRIP_HARDWARE_ACCELERATION=1` preserves WebKit's standard policy. The normal default requires no environment flags.

The PSS observations fall within the design's approximate goals, while summed RSS exceeds some of them. No whole-application memory guarantee is claimed.

## Environment and remaining target checks

Native tests ran on **Debian 13 under Xvfb**, not on the user's Kali/XFCE VirtualBox VM. System writes were unavailable despite task authorization, so Rust and Debian dependency packages were installed/extracted in the workspace. Two helper-path constants in the local WebKit library copy were relocated to reach its extracted helper executables. This was test-runtime relocation only; the application's Debian archive contains none of those libraries or path patches. A private D-Bus session was used. WebKit sandboxing was not disabled.

The package was extracted and its executable/resources tested; `apt install`, desktop-menu registration and uninstall were not executed against the host system. Before calling the Kali release accepted:

1. Install the Debian package on Kali and launch it from the applications menu with no dev server or separately started backend.
2. Repeat the authorized-target acceptance scenario at 1366×768 and 1920×1080.
3. Repeat the supplied profile on the 4 GB VirtualBox VM, including sustained idle CPU, peak scan memory and real graph workloads.
4. Verify resize handles, keyboard focus/reduced-motion, missing Nmap and package uninstall on XFCE.

GitHub CI now includes the native smoke/profile recipe, but the remote workflow has not been run during this session.
