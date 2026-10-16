# Dragontrip 0.6.0 local development package

Baseline: fresh GitHub main `41d94ec` (0.5.0), updated without reset from a clean checkout on 2026-10-16. This is the first research-workspace stage, not a published GitHub release. [Audit/stages](RESEARCH-WORKSPACE.md) · [Usage, coverage and remaining work](IMPORTS.md).

## Package

- File: `src-tauri/target/release/bundle/deb/dragontrip_0.6.0_amd64.deb`
- Architecture/version: `amd64`, `0.6.0`
- Size: 44,688,316 bytes (42.62 MiB)
- SHA-256: `24593c9ec78ac571f336879511241554d899d307384b2d1996d6215bbd2bd59d`
- Matching checksum: `dragontrip_0.6.0_amd64.deb.sha256`
- Built with Rust 1.99.0, Tauri 2, Vite production assets and a PyInstaller one-folder Python sidecar.

```bash
# Run in the directory containing the two files:
sha256sum --check dragontrip_0.6.0_amd64.deb.sha256
sudo apt install ./dragontrip_0.6.0_amd64.deb
dragontrip
```

Back up the closed application's complete data directory before upgrading. Migration 0005 is additive. New `.dtproj` exports use version 2; version 1 imports remain supported. Older applications intentionally cannot read version 2 archives.

## Observed checks

- 86 backend tests passed with real loopback Nmap enabled. Coverage includes URL/IDNA/IPv6 normalization, CIDR and scope precedence, malformed XML/base64/entity rejection, preview without writes/tool execution, stale previews, method/vhost separation, original source bytes, repeated imports, preserved manual findings/notes/coordinates, import comparison including empty exports, 0004→0005 migration/restart and version-1/version-2 archive compatibility with remapped provenance.
- 19 UI tests passed; TypeScript and production Vite build passed.
- Frozen backend startup, authenticated API, migrations and restart smoke passed. Source and frozen-sidecar Chromium acceptance passed scope→Burp preview→items/issues import→vhosts/method filter→source evidence→linked note→repeat import→collapsed overview→reload. Uses isolated test storage; no recon tool runs during import.
- Installed Tauri/WebKit research acceptance passed with actual IPC: saved scope, read-only preview, items/issues, vhosts, POST filtering, raw source view/private native export, linked note, idempotence, collapsed graph and full process-restart persistence.
- Installed baseline native regression passed real Nmap/WhatWeb, XML/JSON export and permissions, graph/Inspector, dragging/manual edges, high-traffic approval form, Markdown/screenshot evidence, Timeline/search, preferences, vault reveal/hide, encrypted archive transfer, restart and child-process cleanup on cancellation/close.
- Separate installed-tool acceptance passed all four real adapters: Nmap selected-service/NSE enumeration, WhatWeb, ProjectDiscovery httpx 1.7.1 and ffuf, including cross-origin redirect refusal, deduplication, saved coordinates and temporary wordlist cleanup.
- Installed planning regression passed task owner/priority/object links, overview, Markdown report/export and process-restart persistence.

The native regression was updated to explicitly search/focus a new URL after web recon: additional application nodes can place that URL outside a saved viewport. The original test assumed every newly created card was visible. Product coordinates and viewport remain stable.

The final package repeated the native research and frozen-sidecar browser scenario after display-only fixes to graph hint placement and provenance labels. Baseline/native planning regressions ran on the preceding candidate with identical backend code.

Native tests ran in the prepared Debian 13 container with WebKitGTK 2.54.0 and Xvfb. The exact `.deb` was installed, and installed desktop/sidecar digests were checked against an extracted copy. The nested container disables WebKit's sandbox only for automation; production settings are unchanged. These results do not establish fresh installed-Kali CI, physical/VirtualBox performance or compatibility with every Burp version.

Screenshots from owned fixtures: [native web map](research-validation/screenshots/native-research-map.png), [native application graph](research-validation/screenshots/native-research-graph.png), [browser preview](screenshots/research/research-preview.png). Empty projects contain no fixture data. No Burp installation was used: two actual public XML export structures were parsed in addition to controlled fixtures (details in IMPORTS.md).

## Reproduce

See [BUILD-CLOUD](BUILD-CLOUD.md) for proxy/CA-aware container setup and [IMPORTS](IMPORTS.md#verification-commands) for tests. Run native/recon scripts sequentially because they share loopback port 8080. CI now includes the browser and native research checks; this work has not been pushed/tagged and remote CI has not run for it.

## Deliberately remaining

Live hostname/CIDR/IPv6 dispatch, a bounded crawler, saved multi-step workflows, four-state methodology checklists, expanded CVSS/CVE/CWE/retest fields and templates, cross-tool finding merge/candidate resolution, and report draft persistence are later stages. Import comparisons currently cover imports; they do not add complete historical observations to every old live scan. Imported origins/endpoints can be added manually and annotated with linked knowledge; rename/removal of these new entity types is not yet exposed. No automatic exploitation was added.
