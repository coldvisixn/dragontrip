# Dragontrip 0.9.0 build and verification

Local evidence is separate from the Ubuntu installer produced by the tagged release workflow. Use the checksum attached to the actual download.

## Local installer

- Version/architecture: **0.9.0 / amd64**.
- Path: `src-tauri/target/release/bundle/deb/dragontrip_0.9.0_amd64.deb`.
- Size: **44,861,510 bytes**.
- SHA-256: `b6d41bde309f588cae878e6534bec141e2a42a4f7e5d47f8896eb741770006d5`.
- Rust 1.99.0, production TypeScript/Vite assets, PyInstaller backend; Debian 13 / WebKitGTK 2.54 test container. Installed with `dpkg -i` and exercised as `/usr/bin/dragontrip` with actual native IPC.

## Observed checks

- **103 backend tests passed**, including real loopback Nmap, source/reimport deduplication, provenance and v5 transfer/remapping, record conflicts/idempotence, closed-draft stale writes, sequence advancement/pause/cancel/retry, scope/confirmation changes, restart interruption and 0.8 draft migration.
- **44 UI tests passed** across 11 files. They cover draft conflicts/copies/merges, delayed hydration, memory-only recovery, project isolation, old browser drafts, late uploads, task editing and Back/Forward. Lint, formatting, production build and Rust formatting passed.
- The frozen backend passed authenticated HTTP, migrations and restart persistence.
- The **published 0.8.0 installer** was independently downloaded and verified against its release checksum, extracted and used to create a project through its actual frozen backend. The new backend reopened the same data: finding/retest history, object, original attachment bytes and unfinished draft survived. Legacy draft rows remained unchanged; v5 export included migrated recovery data. Reproduce with `scripts/upgrade-smoke.py <extracted-0.8-backend>`.
- Production frontend + frozen backend passed **new project → Burp import → endpoint observation → linked note → task with an unsuccessful result → navigation → backend restart with workspace browser cache removed → recovered editor → conflict/manual merge → successful save with failed interface refresh → recovery after deletion of the saved record**. Compact light/dark 1000×650 views and keyboard Back/Forward passed.
- Browser regression passed object editing, notes/findings/plans, vault, screenshot evidence, Markdown escaping, Timeline/search, preferences, encrypted transfer and restart. Planning/reporting, Burp research and grouped navigation passed. Research acceptance asserts that a POST filter survives reload, then explicitly clears it to inspect a GET endpoint.
- A real local Nmap → ProjectDiscovery httpx sequence passed after **one full preview/authorization**, with automatic advancement and two retained completed scan results. Methodology decisions remained explicit.
- Installed native acceptance passed full restart recovery without browser mirrors, evidence upload, manual retest, report-summary recovery and ZIP export. With WebView storage and workspace HTTP writes deliberately faulted, text survived navigation; native recovery JSON contained the original text; a real window-manager close showed the guard and kept the application open. Restoring the backend allowed sync and record save.
- The full installed native regression passed Nmap/WhatWeb, native private XML/JSON exports, graph dragging/manual links, Markdown/screenshot evidence, vault/encrypted transfer, restored graph/tool filters and shutdown during Nmap without live descendants. Planning and Burp research passed, including restored method filters. These regressions used the preceding 0.9.0 candidate; the final deleted-record copy fix was then rebuilt and checked through production-browser acceptance. Tagged CI repeats native checks on its independent build.
- Installed native methodologies passed explicit check decisions, two actual WhatWeb/httpx processes, run history and restart persistence.

## Reproduce and interpret

```bash
DRAGONTRIP_LIVE_TEST=1 npm run check
.venv/bin/python scripts/bundle-backend.py
.venv/bin/python scripts/smoke-packaged.py
# Serve production frontend on port 1420:
npx vite preview --config frontend/vite.config.ts --host 127.0.0.1 --port 1420
# In another terminal:
DRAGONTRIP_TEST_BACKEND=src-tauri/resources/backend/dragontrip-backend node scripts/investigation-smoke.cjs
# After installing the .deb, with native driver and desktop test dependencies:
xvfb-run -a dbus-run-session -- python3 scripts/native-delivery-smoke.py /usr/bin/dragontrip
```

Screenshots contain only synthetic fixtures: [research](investigation-validation/screenshots/research.png), [memory-only recovery](investigation-validation/screenshots/memory-recovery.png), [compact light theme](investigation-validation/screenshots/compact-light.png). Native tests use real Tauri IPC and filesystem exports. Only the deliberate failure scenario faults storage/HTTP; no native command is replaced. Nested-container WebKit sandbox disabling is a test-environment setting and does not change production defaults.

Browser profiling exercised 100/300/1,000 manual objects, persisted graph dragging, focus filtering and automatic minimap disabling above 500 objects. It ran alongside compilation and is not a hardware performance benchmark. No specific VirtualBox/4 GB performance or human usability-study claim is made. The release workflow independently builds and validates its own package; public release and Kali results are recorded separately after completion.
