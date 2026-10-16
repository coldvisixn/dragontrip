# Dragontrip 0.7.0 development package and UI evidence

Adds four-state methodologies and guided saved recon sequences on top of the existing 0.6.0 scope/import/application-map work. [Behavior and limitations](METHODOLOGIES.md). This is a local development package, not a published GitHub release.

## Artifact

- Path: `src-tauri/target/release/bundle/deb/dragontrip_0.7.0_amd64.deb`
- Version/architecture: `0.7.0`, `amd64`
- Size: 44,698,686 bytes (42.63 MiB)
- SHA-256: `3e393f9bea2f97237f076e34a509c2495267299abb5ac935165264537891059f`
- Matching sidecar: `dragontrip_0.7.0_amd64.deb.sha256`

```bash
sha256sum --check dragontrip_0.7.0_amd64.deb.sha256
sudo apt install ./dragontrip_0.7.0_amd64.deb
dragontrip
```

Built with Rust 1.99.0, production Vite assets and the PyInstaller one-folder sidecar. The exact final package was installed over 0.6.0 in the prepared Debian 13/WebKitGTK 2.54 container. Installed desktop/sidecar bytes match the extracted package; checksum and package metadata passed verification.

## Observed verification

- **91 backend tests passed**, with real loopback Nmap enabled. New checks cover explicit four-state coverage, persistence/portable transfer, project-reference validation, preview without execution, stale scope/preview, action snapshots, sequential success requirements, authorization, immutable run history, cancellation, remapped scan/workflow references, scope changes during tool discovery and scope changes while queued. Existing imports, graph, evidence, archives, vault, reporting and queue tests remain included.
- **19 UI tests passed** and TypeScript/production build passed.
- Frozen sidecar startup, authenticated API, migration/restart persistence passed.
- Chromium with real source and frozen backend passed methodology creation/edit/save/reload and two actual sequential **Nmap → ProjectDiscovery httpx** tasks against an owned loopback HTTP server. Scan completion did not alter manually recorded methodology states. The UI and queue now refresh together when workflow tasks are submitted.
- The final frozen-sidecar browser regression passed Burp items/issues preview/import, vhosts, method filtering, original source evidence, linked note, idempotence, collapsed overview and reload. Screenshots below were refreshed from the working 0.7.0 interface.
- The installed **Tauri/WebKit** application, with real IPC and no connection shim, passed methodology state/notes persistence across full application restart and two actual sequential **WhatWeb → httpx** processes against its own loopback target. Native screenshots were captured from that installed package.
- Modified workflow YAML parses successfully. CI now includes the new smoke scenarios and the release build installs their tool dependencies. This work has not been pushed/tagged, so these changes do not claim a new remote CI success or GitHub release.

Nested-container native automation disables WebKit sandboxing for the test only. Production settings are unchanged. A fresh Kali/VirtualBox hardware run is still separate from these Debian container results. The 0.6.0 baseline installed-Native/planning regressions remain documented in BUILD-0.6.0; this increment repeated the new workflow scenario, import browser regression and full backend/UI suites.

## Screenshots from real isolated validation projects

- [Methodology coverage](screenshots/methodologies/methodology-coverage.png)
- [Completed Nmap/httpx sequence](screenshots/methodologies/workflow-complete.png)
- [Burp import preview](screenshots/research/research-preview.png)
- [Web application / source evidence](screenshots/research/research-web-map.png)
- [Installed native methodology](methodology-validation/screenshots/native-methodology.png)
- [Installed native workflow](methodology-validation/screenshots/native-workflow.png)

Coverage notes and `app.htb` objects are deliberately authored test fixtures; new user projects receive no demo records. Loopback task results come from real tools, not generated scanner output.

## Compatibility and remaining work

No physical database migration beyond 0005 is needed: methodologies and action/run snapshots use the existing Knowledge table. New `.dtproj` archives use version 3, preserve/remap the new references, and retain v1/v2 import support. Global custom scan profiles are not packaged in project archives; unavailable profile IDs block workflow preview.

This stage implements guided sequences with explicit advancement, not an unattended scheduler. A bounded crawler, live domain/CIDR/IPv6 dispatch, expanded finding correlation/CVSS/retest history, custom methodology definitions and per-check historical evidence remain future work. No automatic exploitation was introduced.
