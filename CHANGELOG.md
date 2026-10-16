# Changelog

Notable user-facing changes are listed here. Download installers from [Releases](https://github.com/coldvisixn/dragontrip/releases), not the automatic source-code archives.

## [0.5.0] — 2026-10-16

### Added

- Persistent task board with To do/In progress/Blocked/Done/Cancelled states, priorities, owners, due dates, templates and graph-object links.
- Project overview with work completion, overdue tasks, inventory, scan outcomes and active finding severities.
- Configurable Markdown reports: executive summary, finding filters/remediation, optional inventory/history/paths/tasks/notes, preview and private Downloads export.
- Task search, Timeline events, project archive portability and restart persistence.
- Tagged-release packaging and download instructions, English/Russian project overview and user/development documentation.

### Verification and compatibility

- Local 0.5.0 package passed installed-Debian Tauri/WebKit checks, including the new planning/reporting workflow. [Build evidence](docs/BUILD-0.5.0.md).
- Task-containing archives require the updated importer. Existing archives remain supported. Back up before upgrading; do not downgrade an upgraded database without its matching backup.
- Early preview for Linux `amd64`. Kali/VirtualBox hardware acceptance is tracked separately.

## 0.4.0

- Editable custom objects/relationships, linked notes and findings, ordered manual investigation paths and encrypted credentials vault.
- Markdown previews, evidence uploads, Timeline and unified project search.
- Versioned project archives with checksums and optional encrypted credential transfer.
- Appearance/tool settings, persisted graph viewport, navigation and large-graph refinements.

## 0.2.0

- Nmap/WhatWeb/ProjectDiscovery httpx/ffuf recon adapters, validated profiles, bounded queue, cancellation and recovery.
- Persistent infrastructure graph, Inspector, source artifacts, recommendations and scan history.
- Tauri-managed Python backend and Debian packaging.

[0.5.0]: https://github.com/coldvisixn/dragontrip/releases/tag/v0.5.0
