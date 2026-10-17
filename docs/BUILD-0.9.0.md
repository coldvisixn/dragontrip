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

## Published installer verification — 2026-10-17

[Release v0.9.0](https://github.com/coldvisixn/dragontrip/releases/tag/v0.9.0) was published from `186f24291f54c0c611f03e9d3bac7239021e093c`. [Release workflow](https://github.com/coldvisixn/dragontrip/actions/runs/39024772755) passed its backend/UI, frozen-backend, real 0.8 upgrade, production investigation and native planning/research/methodology/navigation/delivery checks before publishing.

The actual public installer was downloaded independently and checked against its attached sidecar:

- `dragontrip_0.9.0_amd64.deb`: **56,255,844 bytes**.
- SHA-256: `0d980e3bb83350b638924f14b2a3f6242582e6b35a4fdf23053d9b88cef2810e`.
- Version/architecture: **0.9.0 / amd64**.

The downloaded file was installed over the local candidate in the Debian test container. Its real Tauri/WebKit acceptance passed restart without browser draft mirrors, evidence upload, finding template/retest, report composition and ZIP export. Deliberate dual-store failure passed navigation, native recovery JSON, actual window-manager close protection and resumed saving. Deleting the saved note while editing then saving a separate record retained the text. [Machine-readable public-package result](investigation-validation/published-package.json).

The local-build checksum above intentionally differs. Always use the checksum attached to the downloaded installer.

[Installed Kali Rolling acceptance](https://github.com/coldvisixn/dragontrip/actions/runs/39041521955/job/117422788256) passed for the independently CI-built 0.9.0 package: launcher, all real recon adapters/scope checks, full native investigation/transfer/restart and resource profiling, with a 4 GiB / 2 CPU container limit. Its source `3f0c3c0` changes only the native test driver's scroll/focus handling relative to the release; application code is unchanged. This is separate from the downloaded-release Debian verification above and from a real VirtualBox machine.

The initial overall run exposed a separate browser-test race: it removed the browser workspace cache after the text draft was acknowledged but before the navigation/editor-pointer cells were acknowledged. Investigation acceptance now explicitly waits for all three SQLite copies before deliberately removing browser recovery. Native fit automation also waits for node measurement after paint; the graph's normal fit behavior was independently checked with a restored zoomed viewport. These are validation-harness changes; published 0.9.0 application bytes remain immutable.

## Final Linux/Kali acceptance

[The complete Linux/Kali workflow](https://github.com/coldvisixn/dragontrip/actions/runs/39042144371) passed all required checks at `ce8e879ace701babeac377fe369fa321a5c9ea95`: quick/backend/UI, production-browser investigation/regression, native packaged application/research/methodologies/navigation/delivery, Kali package availability, installed launcher/recon/native acceptance and resource profiling. Application source is unchanged from the published tag; subsequent changes synchronize test readiness and record verification evidence.

The independently downloaded public installer also passed the full launcher/native scenario at a 1366×768 X11 screen after test-driver readiness handling was corrected: actual Nmap/WhatWeb, private evidence exports, graph/manual links, Markdown/screenshots, vault/encrypted transfer, restart/tool filters and shutdown during Nmap. No live application descendants remained. Profiling exercised 100/300 objects; these container observations are not a VirtualBox performance guarantee.
