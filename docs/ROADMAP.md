# Roadmap

This page separates implemented capabilities from future priorities. [Capabilities and current limits](CAPABILITIES.md) describes the product today; [CHANGELOG.md](../CHANGELOG.md) records version changes and [0.9.1 verification](BUILD-0.9.1.md) records exact platform checks.

## Available in 0.9.1

- Local desktop projects, SQLite, evidence files and a Tauri-managed Python backend.
- Nmap/WhatWeb/ProjectDiscovery httpx/ffuf adapters with validated profiles, bounded queue, cancellation and retained results/history.
- Scope rules, previewed Nmap/Burp/Nuclei offline imports, source provenance and comparison, applications and method-specific endpoints.
- Persistent infrastructure graph, custom objects/manual relationships, Inspector and saved coordinates/viewport.
- Linked notes/hypotheses, draft findings and follow-up tasks from objects, scans and observations; original source navigation and retained unsuccessful checks.
- Project context restoration, recoverable research drafts, version-aware conflict resolution and retained earlier text.
- Four-state manual methodologies and saved recon sequences with full preview, approved automatic progression, pause, cancellation and explicit retry history. Restart/import never resumes network work.
- Task planning, explicit fictional demo, Markdown evidence, finding templates and append-only manual retests.
- Configurable Markdown, standalone HTML and selected-evidence ZIP reports; portable `.dtproj` v5 with recovery text and v1–v5 import.
- Separately encrypted credential vault and optional encrypted credential transfer.
- Appearance/tool settings, keyboard navigation, command palette, Debian packaging, checksums and tagged release workflow.
- API/dependency security fixes, verified GTK safety backport and scheduled dependency audits; coordinated dependency updates and installed-Kali publication gates.

See [the user guide](USAGE.md) and [release notes](releases/v0.9.1.md). The download remains a prerelease / early MVP; availability does not imply support for every platform or target form.

## Next priorities

- Maintain Kali Rolling installed-package CI and complete real 4 GB VirtualBox acceptance.
- Benchmark larger engagements before increasing graph/archive limits; improve resource use based on measurements.
- Add explicit evidence-retention management beyond manual artifact cleanup.
- Evaluate native PDF/DOCX output and additional finding templates using real workflow feedback.
- Broaden target/adapter scope only with validated behavior, preserved evidence and regression coverage.
- Improve onboarding and accessibility using feedback from real assessment workflows.

These are priorities, not promised delivery dates. Windows/macOS/ARM installers, live hostname/CIDR/IPv6 recon and native PDF/DOCX reports are not implemented. Offline scope/import support for additional target forms does not enable live scanning. Investigation paths remain manual plans; automatic exploitation is not part of the product.

## Implementation history

[Research stages](RESEARCH-WORKSPACE.md) · [Phase 2: recon](PHASE2.md) · [Phase 3: knowledge/vault](PHASE3.md) · [Phase 4: product polish](PHASE4.md) · [Planning/reporting](PLANNING.md)
