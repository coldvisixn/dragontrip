# Verification record — 15 October 2026

## Completed checks

- Python 3.12, Rust 1.99.0, Linux x86_64.
- 19 backend tests passed, including actual Nmap 7.95 against a test-owned loopback HTTP server. Coverage includes IPv4 validation, XML/entity protection, Host/Origin/token guards, persistence and idempotent ingestion, historical evidence, custom objects, process errors, cancellation before/during launch and restart recovery.
- 7 frontend tests passed: projects/API, Inspector/evidence, coordinate saves, retry/errors, native export action/error reporting, command palette and bounded DOM rendering for a 1,000-row inventory.
- TypeScript/Vite production build, Cargo check with lockfile, Rust formatting check and optimized Tauri release build passed.
- PyInstaller one-folder distribution built and passed authenticated HTTP + migrations + restart persistence tests.
- Debian package built: `dragontrip_0.1.2_amd64.deb`, approximately 28.2 MiB compressed / 66.9 MiB installed. It contains the Rust executable, bundled frontend, Python runtime/dependencies, launcher and icons. It contains no Nmap, Node modules or Rust toolchain.
- Debian control metadata and desktop launcher validated; the actual X11 window class matches the launcher. Library dependencies are WebKitGTK 4.1 and GTK 3. A SHA-256 file accompanies the artifact.
- Browser UI integration passed using real API/Nmap and only a test bridge for connection delivery.
- **Native packaged application test passed with actual Tauri IPC and WebKitGTK, without an IPC/API mock.**

## Native scenario exercised

The executable and backend were tested both from an extracted Debian archive and after actual apt installation. The test:

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

Linux configures WebKit software compositing before GTK initialization by default. Version 0.1.1 moves this setting earlier because changing it after webview creation caused a white window on stock WebKitGTK 2.54. The opt-in `DRAGONTRIP_HARDWARE_ACCELERATION=1` preserves WebKit's standard policy. The normal default requires no environment flags.

The PSS observations fall within the design's approximate goals, while summed RSS exceeds some of them. No whole-application memory guarantee is claimed.

## Initial test environment and remaining hardware checks

Native tests ran on **Debian 13 under Xvfb**, not on the user's Kali/XFCE VirtualBox VM. System writes were unavailable despite task authorization, so Rust and Debian dependency packages were installed/extracted in the workspace. Two helper-path constants in the local WebKit library copy were relocated to reach its extracted helper executables. This was test-runtime relocation only; the application's Debian archive contains none of those libraries or path patches. A private D-Bus session was used. WebKit sandboxing was not disabled.

In the initial rootless test, the package was extracted and its executable/resources tested. Actual apt installation and launcher/uninstall checks were subsequently completed in the clean system described below. Before calling the Kali release accepted:

1. Install the Debian package on Kali and launch it from the applications menu with no dev server or separately started backend.
2. Repeat the authorized-target acceptance scenario at 1366×768 and 1920×1080.
3. Repeat the supplied profile on the 4 GB VirtualBox VM, including sustained idle CPU, peak scan memory and real graph workloads.
4. Verify resize handles, keyboard focus/reduced-motion, missing Nmap and package uninstall on XFCE.

GitHub CI includes native smoke/profile and installed Kali jobs; see the run links in the repository for current status.

## Installed package check in a clean system

A further test used stock Debian 13 libraries, WebKitGTK 2.54, and XFWM under Xvfb in a container limited to **4 GB RAM and two CPUs**. Unlike the earlier rootless test, the actual Debian package was installed with apt; no WebKit helper paths or application files were patched.

Passed: package dependency installation, desktop-file validation, `gtk-launch` startup, matching icon/window class, normal WM close, the full native Nmap/graph/export/restart scenario, and closing during a scan. Package removal deleted the executable and retained a test marker in the user data directory.

See [installed-profile.json](installed-profile.json) and `screenshots/installed-graph.png`. The corrected 0.1.1 rendering path measured about 471 MiB PSS at Dashboard and 667 MiB with 300 nodes; p95 drag frame time was 210 ms at 300 nodes (100-node p95: 41 ms). These exceed the earlier rendering-path measurements and the desired smoothness budget at 300 nodes; software-rendered large-graph performance remains a limitation. These are container observations, not a VirtualBox benchmark.

The isolated root container required `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1` for its test runtime. This flag is not set by the application. The earlier unprivileged native test used the normal WebKit sandbox.

The official Kali Rolling image was pulled locally, but its package repository was denied by the session's outbound network policy. The installed-package test is therefore also configured in GitHub Actions on the official Kali image, with stock Kali dependencies and the same resource limits.

The first GitHub run passed backend/frontend tests, production compilation and frozen-backend smoke, then exposed a harness bug: a bare `WebKitWebDriver` name was passed to tauri-driver, which requires a filesystem path. The harness now resolves it with PATH lookup before launch; that fix passed the clean installed-system test.

## Rendering regression gate in 0.1.1

DOM automation initially passed on WebKitGTK 2.54 while the visible webview remained white; its WebDriver screenshot was also unusable. The native checks now capture the actual X11 display with scrot and inspect central workspace pixels, rejecting white or black unpainted surfaces. This new gate reproduced the 0.1.0 failure and passed with the installed 0.1.1 launcher and native graph. Version 0.1.1 initializes software compositing before WebKit startup and maximizes the window to fit the available desktop. The rendering opt-in remains available.

## External tool environment fix in 0.1.2

PyInstaller prepends its private runtime libraries to `LD_LIBRARY_PATH`. Nmap is a system executable, so inheriting this path can load incompatible libraries from the bundled Python runtime on a newer distribution. The runner now restores `LD_LIBRARY_PATH_ORIG` (or removes the injected path when there was no original value) only for external children of a frozen Linux backend. The backend process keeps its own runtime environment.

Two regression cases start a real external process with a deliberately invalid private `libm.so.6`: the contaminated environment fails at the loader, while the restored environment starts correctly. Native failure diagnostics also include the graph, scan status and visible terminal output. The 0.1.1 Kali check passed installation, desktop launch and Dashboard, then failed waiting for Nmap service ingestion; version 0.1.2 subsequently passed the complete Kali scenario recorded below.

The subsequent detailed Kali trace identified an independent container constraint: stock Kali's Nmap wrapper could not execute `/usr/lib/nmap/nmap` (`Operation not permitted`, exit 126). Its file capabilities request NET_ADMIN, which Docker omits from its default bounding set. The Kali acceptance job now permits NET_ADMIN in its private container network namespace and checks `nmap --version` before UI automation. No host networking or privileged-container mode is used. The scan test now reports a failed terminal scan immediately instead of waiting for a service node that cannot appear.

## Final 0.1.2 acceptance

[GitHub run 38776280992](https://github.com/coldvisixn/dragontrip/actions/runs/38776280992) completed successfully for commit `0304cba` on 15 October 2026. All three jobs passed: Linux build/native acceptance, Kali package preflight, and installed Kali acceptance.

The official Kali Rolling image used stock installed application and Nmap binaries, XFWM, a private Xvfb/D-Bus session, 4 GB RAM and two CPUs. Actual apt installation, launcher/icon/window class and painted pixels, authorized loopback Nmap discovery, Inspector/source XML, native export, node dragging/manual relationships, restart persistence and shutdown during an active scan all passed. Uninstall removed the executable and retained a user-data marker. Its production archive and checksum are in `dragontrip-linux-amd64`; the Kali resource profile and actual X11 screenshot are in `kali-native-validation`.

The container-only WebKit sandbox flag and Nmap capability allowance are test-environment configuration, not application startup requirements. This establishes container compatibility, not a hardware benchmark on the user's VirtualBox VM. The earlier measured software-rendering limitation at 300 nodes remains documented above.


## Phase 2 local acceptance (0.2.0)

The Phase 2 backend suite passed 39 tests with real Nmap enabled, including migration of a populated Phase 1 database, tool identity checks, bounded queue/cancellation, scope validation, source parsers, graph positioning and subprocess stdin isolation. All 11 frontend tests passed. The frozen backend, production frontend and native Debian package build passed.

The installed native application also passed on Debian 13 in an isolated 4 GB / two-CPU container: desktop launcher, real Nmap, WhatWeb launched from Inspector, URL ingestion, private XML/JSON export, graph editing, history filtering, restart persistence and shutdown during a scan. The [actual X11 screenshot](screenshots/phase2-recon.png) and [resource measurements](phase2-native-profile.json) were captured from code commit `24db948`, before the final stdin isolation and test-selection fixes. This local run used the default 64 MiB Docker shared-memory limit and software rendering; it was not a VirtualBox hardware benchmark.

For 100 nodes the measured drag-frame median/p95 was 17/61 ms; for 300 nodes it was 28/175 ms. Process-tree RSS at 300 nodes was 887.5 MiB (PSS 653.5 MiB). Large-graph smoothness and memory targets still need work. Supported execution targets in this release are single IPv4 addresses or HTTP(S) IPv4 URLs; hostname/CIDR batching remains outside 0.2.0.


## Final Phase 2 CI acceptance

[GitHub Actions run 38792713976](https://github.com/coldvisixn/dragontrip/actions/runs/38792713976) verified code commit `50293bf` on 15 October 2026. Ubuntu passed backend/frontend tests, production packaging, frozen-backend migration/restart checks, real Nmap/WhatWeb/ProjectDiscovery httpx/ffuf acceptance and the complete native UI scenario. Official Kali Rolling passed apt preflight, installation of the actual 0.2.0 package, all four real-tool checks, desktop launcher/native graph and export/restart/resource checks, and uninstall with retained user data.

Both real-tool runs included selected-service enumeration with the bounded NSE allowlist, URL graph ingestion/deduplication, preserved coordinates, rejection of cross-origin redirect ingestion and disposable wordlist cleanup. The native scenario explicitly selects the loopback HTTP service even when an unrelated SSH service is present. External version probes and task processes receive closed stdin; this also resolved the Ubuntu WhatWeb discovery stall seen in earlier acceptance runs.

Download the package and matching checksum from **dragontrip-linux-amd64** in that run. **kali-native-validation** contains CI-generated screenshots and measurements from the installed Kali application. These artifacts are separate from the local Debian measurements above. Phase 3 is not implemented by this release.
