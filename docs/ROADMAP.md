# Delivery roadmap

This checklist covers the four requested phases. A feature is implemented only with working persistence and a usable interface; release verification is tracked separately from implementation.

1. **Desktop MVP** (existing): Tauri lifecycle, projects, Nmap, graph, Inspector, SQLite migrations, Debian packaging.
2. **Recon automation** (implemented; all four tool adapters verified locally): Quick/Full/Service profiles, WhatWeb/ProjectDiscovery httpx/ffuf, FIFO concurrency, cancellation/recovery, parsed evidence, recommendations, scan history.
3. **Attack knowledge graph**
   - Existing: editable typed custom objects, manual relationships, ordered path builder, findings, linked notes, encrypted credentials.
   - Implemented: safe Markdown preview, evidence/screenshot attachments, references from knowledge records, project Timeline and unified knowledge search.
4. **Product polish**
   - Data: versioned project archives with checksums, preserved evidence and remapped identities, validated transactional import into a new project; explicit handling of credential portability.
   - Configuration: validated tool executable locations and detection, persistent theme/accent/density/reduced-motion preferences.
   - Graph: slim graph payloads, incremental metadata updates, stable viewport persistence, selected-object focusing, low-detail large-graph mode and resource measurements.
   - UX: keyboard navigation and actions, searchable command palette, project/object/knowledge navigation, focus management, accessible controls, helpful empty/error/loading states.
   - Delivery: extension documentation, functional/performance checks, frontend/frozen-backend/native build and acceptance, versioned Debian package and checksum.

Implementation order is data contracts and migration → API and validation → UI → integration/performance verification → release documentation. Existing projects and manual content must survive upgrades. Paths remain user-authored investigation plans; no automatic exploitation is included.

All four feature phases are implemented in 0.4.0. The local Debian package, browser/frozen-backend scenarios, all four real recon adapters, installed desktop launcher and expanded native workflow have passed. Release publication, a fresh Kali CI run (cloud repository access is denied), and the user’s VirtualBox hardware acceptance are separate outstanding release gates. Evidence and exact limits are in [PHASE4.md](PHASE4.md).

## Next workspace additions

Implemented on top of 0.4.0: persistent investigation task board, aggregated project progress/risk overview and configurable Markdown reporting. See [PLANNING.md](PLANNING.md) for current behavior and verification; desktop release acceptance remains separate.
