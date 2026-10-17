# Phase 4 — Product polish (0.4.0)

**Historical implementation and measurement record.** Package versions and environment limitations below belong to that snapshot. See [current release verification](BUILD-0.9.1.md) and [installation](INSTALL.md) for the published package.

## Implemented behavior

- **Knowledge completion:** GFM Markdown headings, lists/checklists, tables, fenced code and preview; evidence/screenshot upload and image preview; authenticated original-file export; knowledge links to files and scans; paginated Timeline and project-wide search. Vault contents are excluded from search.
- **Portable projects:** Projects → Project portability exports a `.dtproj` to Downloads. Import creates a new project with the graph, positions, knowledge, scan history, original artifacts, screenshots, events and viewport. No queued or running task resumes. Relationships and evidence links are remapped; subsequent scans retain stable entity identities.
- **Credential portability:** Excluded by default. An explicit export opt-in requires an unlocked local vault and a separate archive password of at least 12 characters. Import needs that password and an unlocked destination vault. Archive metadata never contains plaintext credentials.
- **Appearance:** Dark/light/system theme, three accents, compact/comfortable density, reduced motion and automatic/full/compact graph detail, all persisted through the API.
- **Tool settings:** Absolute executable overrides for Nmap/WhatWeb/ProjectDiscovery httpx/ffuf, validated by actual version probes; empty entries restore PATH discovery. Existing saved profiles and queue controls remain available.
- **Navigation/accessibility:** Back/forward history, visible focus and skip link, page titles, keyboard-accessible forms/palette, extended shortcuts, searchable knowledge in the palette and commands for project creation, custom objects, scans, task panel and vault locking. Inspector supports numeric graph positioning for keyboard users.
- **Graph/data performance:** Overview payloads omit large XML/JSON buffers; Inspector retrieves evidence on selection. Cached card data avoids rebuilding every card on selection. Viewport restoration no longer fits the whole graph after each scan result. Selecting a distant/tiny object focuses it. At reduced zoom/cards use compact detail; large graphs avoid excess edge labels and SVG minimap work. History/knowledge/search/Timeline queries are bounded and indexed.

## Verification commands

```bash
export PATH="$PWD/.build-tools/bin:$PATH"  # cloud-local Nmap, if needed
DRAGONTRIP_LIVE_TEST=1 .venv/bin/python -m pytest -q
npm test
npm run build
.venv/bin/python scripts/bundle-backend.py
.venv/bin/python scripts/smoke-packaged.py
# Start Vite or Vite preview on port 1420 in a separate terminal:
DRAGONTRIP_TEST_BACKEND=backend/dist/dragontrip-backend/dragontrip-backend \
  node scripts/workspace-smoke.cjs
node scripts/profile-graph.cjs
# With all recon tools installed:
.venv/bin/python scripts/recon-smoke.py
# In the native test environment:
DRAGONTRIP_VALIDATION_DIR=/tmp/dragontrip-native-results \
  xvfb-run -a dbus-run-session -- python3 scripts/native-smoke.py /usr/bin/dragontrip --profile
```

Browser tests bridge only connection delivery; native tests use real Tauri IPC and WebKit. All test scans target owned loopback HTTP servers. Data, passwords and credentials created by these scripts are disposable fixtures. Do not run live-Nmap/browser/native acceptance simultaneously when they use the same loopback port 8080.

## Release evidence

See the accompanying profile JSON and screenshots for the actual measured version, environment, viewport and sample counts. Chromium heap is not whole-application memory. Native PSS/RSS includes the application process tree and excludes Xvfb/WebDriver. A focused graph renders a subset of its stored objects; DOM counts must be read with the recorded viewport.

The package is built with the pinned Rust toolchain and a frozen Python sidecar. Its matching SHA-256 file sits beside `src-tauri/target/release/bundle/deb/dragontrip_0.4.0_amd64.deb`. Local packaging/verification does not publish a GitHub release.

Kali Rolling/VirtualBox desktop and hardware acceptance remain distinct from the Debian cloud-container check. The current cloud network denies `http.kali.org` (HTTP 403 from the policy proxy), so the fresh Kali run cannot be installed here without an environment network update. The repository's installed-Kali CI job runs the expanded native scenario, including Markdown, evidence, settings, vault and portable projects. No new Kali result is claimed until that job executes.

## Measured local results

- 61 backend tests passed, including the real loopback Nmap test and filtering knowledge before pagination; 13 frontend tests passed. TypeScript/Vite build and frozen-backend startup/migrations/restart checks passed.
- Full real-tool acceptance passed with Nmap 7.95, WhatWeb 0.5.5, ProjectDiscovery httpx 1.7.1 and ffuf 2.1.0-dev. This includes selected-service diagnostic scripts, graph deduplication, retained coordinates, origin boundaries and disposable wordlist cleanup.
- Production-browser acceptance passed against the frozen backend: editable objects, Markdown/evidence, Timeline/search, themes, viewport, vault, encrypted project transfer, keyboard palette and restart. Baseline real Nmap/drag/manual-edge acceptance additionally checks numeric positioning after a drag.
- Native installed-package acceptance passed on Debian 13 / WebKitGTK 2.54 with XFWM/Xvfb: launcher/icon/window class and painted pixels; actual Tauri IPC; Nmap/WhatWeb; XML/JSON export; graph dragging/manual edges; Markdown, screenshot upload/preview, Timeline/search, light/dark theme, vault reveal/hide, encrypted project export/import, restart and shutdown cleanup. No connection bridge is injected into native tests.
- Native idle PSS was about 506 MiB; the focused 100/300-object scenarios measured about 563/600 MiB PSS and p95 drag-frame intervals of 42/47 ms. The focused view rendered 9 graph cards. See [native measurements](phase4-native-profile.json), including the SHA-256 of the installed package. These are individual runs; a previous run under competing build load reached 104 ms p95 with 300 objects.
- The Chromium 1,000-manual-object scenario loaded in about 1.05 s, transferred 265 KiB of compact project metadata, used about 54 MiB of JavaScript heap and measured 17 ms p95 drag-frame intervals in a focused view (9 rendered cards). Its overview rendered all 1,000 compact cards; the minimap was omitted. See [browser measurements](phase4-browser-profile.json). These figures describe this cloud host and exact fixtures, not a VirtualBox performance guarantee.

Actual native screenshots: [graph](screenshots/phase4-native-graph.png), [web recon](screenshots/phase4-native-recon.png), [light appearance](screenshots/phase4-native-appearance.png), [installed launcher](screenshots/phase4-installed-launcher.png). [Markdown with screenshot evidence](screenshots/phase4-markdown-evidence.png) is from the production Chromium scenario. All contain isolated test data.

Native automation uses tauri-driver to start WebKit with Tauri's automation environment and talks to WebKit's standard endpoint directly; this avoids intermittent reset connections in tauri-driver 2.1's HTTP forwarding pool. The image's nested WebKit sandbox is disabled **only for isolated container tests**, as in the prior CI setup. Production startup retains its normal sandbox. Pixel checks explicitly cover both dark and light themes and reject uniform/unpainted content.
