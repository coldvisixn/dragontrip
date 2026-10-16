# Roadmap

This page separates implemented capabilities from future priorities. [CHANGELOG.md](../CHANGELOG.md) records version changes; [build evidence](BUILD-0.5.0.md) records platform-specific verification.

## Available in 0.5.0

- Local projects, SQLite migrations and Tauri-managed Python backend.
- Nmap/WhatWeb/ProjectDiscovery httpx/ffuf adapters, validated profiles, bounded queue, cancellation/recovery and scan artifacts/history.
- Persistent infrastructure graph, editable custom objects/manual relationships, Inspector, saved coordinates/viewport and large-graph refinements.
- Notes, findings, manually authored paths, Markdown, evidence attachments, Timeline and unified search.
- Encrypted credential vault and versioned project archives with optional encrypted credential transfer.
- Task planning, project progress/risk overview and configurable Markdown reports.
- Appearance/tool settings, keyboard navigation and a searchable command palette.
- Debian packaging, checksums and tagged GitHub release workflow.

## Next priorities

- Maintain Kali Rolling installed-package CI and complete real 4 GB VirtualBox acceptance.
- Benchmark larger engagements before increasing graph/archive limits; improve resource use based on measurements.
- Add explicit evidence-retention management beyond manual artifact cleanup.
- Improve report composition persistence and evaluate additional export formats.
- Broaden target/adapter scope only with validated behavior, preserved evidence and regression coverage.
- Improve onboarding and accessibility using feedback from real assessment workflows.

These are priorities, not promised delivery dates. Windows/macOS/ARM support, hostname/CIDR/IPv6 scope and PDF/HTML reports are not implemented. Investigation paths remain manual plans; automatic exploitation is not part of the current product.

## Implementation history

[Phase 2: recon](PHASE2.md) · [Phase 3: knowledge/vault](PHASE3.md) · [Phase 4: product polish](PHASE4.md) · [Planning/reporting](PLANNING.md)
