# Dragontrip 0.8.0 local build and verification

This record describes the local Debian build, separate from the Ubuntu package that the tagged release workflow builds and publishes. [Workflow and limits](DELIVERY.md).

## Local package

- Version/architecture: **0.8.0 / amd64**
- Path: `src-tauri/target/release/bundle/deb/dragontrip_0.8.0_amd64.deb`
- Size: 44,844,926 bytes
- SHA-256: `40c3e1d93899ea9433d12c8d0a5de55a3f377f53a57ad05f0ef232b1c859d417`
- Matching sidecar: `dragontrip_0.8.0_amd64.deb.sha256`
- Rust 1.99.0, production Vite frontend, PyInstaller one-folder backend; local Debian 13 / WebKitGTK 2.54 build container.

Always use the checksum attached to the actual public download. Local and CI packages can differ byte-for-byte.

## Observed checks

- **97 backend tests passed with real loopback Nmap enabled.** New delivery coverage checks scoped draft recovery/restart, late-write rejection/tombstones, append-only retests, stale-record protection, archive v4 round-trip with drafts excluded, HTML/ZIP selection/integrity/stale previews, project details editing and the isolated fictional demo.
- **30 UI tests passed** across 10 files, including draft remount/database recovery, ordered pending writes, cleared drafts, dual-store failure/unload guard and evidence upload races.
- Unified `npm run check` passed lint, formatting, backend/UI suites, TypeScript/Vite production build and Rust formatting. `DRAGONTRIP_LIVE_TEST=1` and the prepared loopback Nmap path were used for the final full check.
- Frozen-backend readiness, authenticated HTTP, migrations and restart persistence passed.
- Production Chromium + actual frozen sidecar passed explicit demo, new-project onboarding, scope and Burp import, finding draft recovery, pasted screenshot, retained retest, HTML/ZIP export, narrow viewport fit and report-composition recovery after backend restart with local mirror removed. Standalone HTML rendered without external requests. [Machine-readable result](delivery-validation/browser-results.json).
- Installed `/usr/bin/dragontrip` passed the actual Tauri/WebKit delivery flow with native IPC, full application/backend restart, SQLite draft recovery with WebView mirror removed, screenshot upload, finding template, manual retest, restored report summary and a ZIP containing the selected screenshot. [Native result](delivery-validation/native/delivery-results.json).
- Existing browser regression passed object editing, knowledge/plans, Vault, Markdown/screenshots, Timeline/search, preferences, viewport, encrypted transfer, palette and restart. Planning, Burp research and grouped-navigation browser acceptance passed.
- The full installed native regression passed real loopback Nmap, graph/Inspector, drag/manual links, evidence/Vault/encrypted transfer, restart/filter persistence and shutdown during Nmap. Graph profiling used an isolated container and is not a VM-performance guarantee.
- Existing native planning/reporting, research and grouped navigation passed. Native methodology acceptance ran actual sequential WhatWeb/httpx against its own loopback HTTP server; the prepared container needed ProjectDiscovery httpx v1.7.1 on PATH, matching CI setup.

## Artifacts and reproduction

Screenshots and sample reports contain only explicitly authored validation fixtures, not user project data. [Project start](delivery-validation/screenshots/start-project.png) · [Finding/retest](delivery-validation/screenshots/finding-retest.png) · [Report](delivery-validation/screenshots/report-delivery.png) · [Standalone sample HTML](delivery-validation/sample-report.html) · [Sample ZIP](delivery-validation/sample-deliverable.zip).

```bash
DRAGONTRIP_LIVE_TEST=1 npm run check
.venv/bin/python scripts/bundle-backend.py
.venv/bin/python scripts/smoke-packaged.py
npx vite preview --config frontend/vite.config.ts --host 127.0.0.1 --port 1420
# In another terminal:
DRAGONTRIP_TEST_BACKEND=backend/dist/dragontrip-backend/dragontrip-backend \
  node scripts/delivery-smoke.cjs
# Install the local package, then run the native scenario:
xvfb-run -a dbus-run-session -- python3 scripts/native-delivery-smoke.py /usr/bin/dragontrip
```

Native tests require tauri-driver 2.1.0, WebKitWebDriver, Xvfb and the documented desktop dependencies. Nested-container automation disables WebKit sandboxing for that test environment; production settings are unchanged. Chromium bridges connection delivery only; the native scenario uses real IPC. The renderer's existing Evidence chunk warning is non-blocking.

The tagged release workflow repeats its own backend/UI/frozen/package and native planning/research/methodology/navigation/delivery checks before publication. This local record does not claim remote CI success. Kali Rolling installed-package CI and a real 4 GB VirtualBox machine remain separate platform checks. No Windows/macOS/ARM or VM-performance claim is made.

## Published release verification — 2026-10-17

[Release v0.8.0](https://github.com/coldvisixn/dragontrip/releases/tag/v0.8.0) was published as a pre-release from commit `d52ebb20c1856d4ef057ab984d3427fb3ef40cc5`. [Release workflow](https://github.com/coldvisixn/dragontrip/actions/runs/39013595541) passed its backend/UI/frozen/package and native planning/research/methodology/navigation/delivery checks before publication.

The actual public installer was downloaded independently, its attached SHA-256 verified, and package metadata checked:

- `dragontrip_0.8.0_amd64.deb`: **56,239,278 bytes**
- SHA-256: `303c219e6bf913b53a0243cc6bab26285beca3fba71e9115b29604cb637cae40`
- Version/architecture: `0.8.0 / amd64`

The downloaded package was installed over the local build in the Debian test container. The native delivery scenario passed again with real IPC: onboarding, SQLite draft recovery after full restart without the local mirror, screenshot upload, finding template, retained retest, report-summary recovery and ZIP export containing selected evidence. [Machine-readable public-package verification](delivery-validation/published-package.json).

The earlier local-build checksum above is intentionally different; it is not the checksum of the public download.

[Installed Kali Rolling CI](https://github.com/coldvisixn/dragontrip/actions/runs/39013554996) also passed for the same release source commit, including launcher/native acceptance and resource profiling. It tests the main workflow's own package build, separately from the downloaded release asset above. The Kali container has a 4 GiB / 2 CPU limit; it does not replace acceptance on a real VirtualBox VM.
