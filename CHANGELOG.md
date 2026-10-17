# Changelog

Notable user-facing changes are listed here. Download installers from [Releases](https://github.com/coldvisixn/dragontrip/releases), not the automatic source-code archives.

## [0.9.1] — Security and release maintenance

- Enforce actual API request-body limits, redact passwords/credentials from validation errors and reject malformed loopback/authentication headers safely.
- Backport GLib's optimized string-iterator safety fix for the GTK 3 runtime; verify upstream source hashes and continue monitoring the original registry baseline for new advisories.
- Consolidate reviewed dependency updates, including compatible Pydantic/core and Vite/React-plugin pairs; adapt the getrandom 0.4 API. Keep TypeScript 5.9 until the lint toolchain supports 7.
- Update and pin GitHub Actions; group coupled dependency updates to prevent broken individual update PRs.
- Require encrypted-vault/data upgrades from published 0.8.0 and 0.9.0, plus real installation/native acceptance of the exact release package on Kali before publishing.
- Preserve 0.9 project data and portable archive format v5. No new database migration or archive format change.

## 0.9.0 — Local lab investigation MVP

- Three-section navigation with contextual actions, an unobtrusive tool panel and a simpler observation → hypothesis → check flow.
- Project-scoped page/tab, selection, filters, graph viewport and editor recovery; retain task, methodology and custom-object drafts.
- Side-by-side draft conflicts, separate recovered records, manual merges, retained recovery text and idempotent save retries.
- Create notes, draft findings and tasks from observations, services/endpoints and scan results with provenance/evidence and duplicate protection.
- Full-preview recon sequences with automatic advancement, pause, cancellation, explicit retry/history and no automatic restart.
- Migrate 0.8 research drafts; preserve finding retests and report capabilities. Archive v5 transfers research recovery and remaps source references; v1–v4 remain readable.
- Native close protection for memory-only text and private recovery JSON exports through the desktop Downloads path.

## [0.8.0] — 2026-10-17

- Recover note/finding/manual-plan drafts across navigation and restart using an immediate WebView mirror and ordered SQLite sync. Keep report composition per project; reject stale saved-record edits.
- Open new projects with import/scope/recon actions, suppress empty metrics, offer an explicit isolated fictional demo and edit project name/description.
- Add a blank finding template, paste/drop evidence and retained append-only manual retests with status transitions. Keep upload completion tied to the current editor state.
- Add confirmed-first delivery and working report presets, standalone script-free HTML and ZIP bundles with explicitly selected evidence, ownership/integrity checks and stale-preview validation.
- Export archive format v4 to retain retests; read v1/v2/v3. Drafts stay on the device and are excluded from reports/transfers. Back up before upgrading.
- Add real browser/frozen-backend and installed Tauri/WebKit delivery acceptance; require native delivery checks before tagged publication. See [workflow/limits](docs/DELIVERY.md) and [local build evidence](docs/BUILD-0.8.0.md).

## 0.7.1 — grouped navigation

- Replace 22 flat sidebar destinations with eight links and section tabs: Project, Assets, Recon, Investigation, Reports and Settings.
- Remember each group's last visited page during navigation; derive selected tabs from direct links and Back/Forward history.
- Add a persistent icon-only sidebar, tooltips, keyboard tab navigation and compact-height spacing.
- Preserve all existing screens and command-palette destinations. No backend/data-model changes. Browser/native acceptance scripts now navigate groups and tabs.

## 0.7.0 — local development preview

- Add four-state, object-bound web/service methodologies with review notes, scan and attachment evidence.
- Save ordered recon sequences with scope/parameter preview, immutable action snapshots, explicit step launch, previous-step success checks, queue/cancellation and retained run history.
- Revalidate scope after tool discovery; preserve methodology decisions across scans, restart and portable transfer.
- Use archive version 3 while retaining v1/v2 import support; include live browser/native acceptance and actual UI screenshots. See docs/METHODOLOGIES.md.

## 0.6.0 — local development preview

- Persist explicit IP/CIDR/domain/origin include/exclude scope, with guarded scan dispatch.
- Preview/apply Nmap XML, Burp saved-items/issue XML and HTTP Nuclei JSONL into real graph and knowledge objects, preserving source bytes and immutable observations.
- Add application-focused, method-aware endpoint navigation, manual web objects, evidence tracing and import comparisons. Keep endpoints collapsed in graph overview.
- Preserve old databases and version-1 portable projects; version-2 exports include scope and remapped import provenance.
- Add parser/scope/migration/idempotence/transfer regressions and browser/native research acceptance scripts. See docs/IMPORTS.md and docs/BUILD-0.6.0.md for limits and actual verification.

This entry does not announce a published release or completion of the later workflow/finding-lifecycle stages.

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

[0.8.0]: https://github.com/coldvisixn/dragontrip/releases/tag/v0.8.0

[0.9.1]: https://github.com/coldvisixn/dragontrip/releases/tag/v0.9.1
