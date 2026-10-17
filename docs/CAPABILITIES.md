# Capabilities and current limits

Dragontrip is a local desktop workspace for penetration testing and security research: **recon → observations → hypotheses → manual checks → saved results**. Use it for authorized assessments, independent research or labs. Reports are an optional output of the same project.

[Install](INSTALL.md) · [User guide](USAGE.md) · [Gallery](SHOWCASE.md) · [English overview](../README.md) · [Русский](../README.ru.md)

## Available in 0.9.1

| Workspace              | What it supports                                                                                                                                                                                                 | Guide                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Scope and imports      | Include/exclude rules; previewed Nmap XML, Burp saved-items/issue XML and HTTP Nuclei JSONL imports; preserved sources, import comparison, web applications and method-specific endpoints.                       | [Imports](IMPORTS.md)                                                     |
| Live recon             | Nmap, WhatWeb, ProjectDiscovery httpx and ffuf adapters; validated built-in/saved profiles, bounded queue, cancellation and scan history.                                                                        | [User guide](USAGE.md)                                                    |
| Connected research     | Notes/hypotheses, draft findings and tasks created from objects, observations or scans; source links and reuse of linked records on repeated actions/imports.                                                    | [Research workflow](HTB-WORKSPACE.md)                                     |
| Infrastructure graph   | Hosts, services, URLs and custom objects; typed links, Inspector, saved positions/viewport, search, pan/zoom and minimap.                                                                                        | [User guide](USAGE.md)                                                    |
| Knowledge and evidence | Markdown notes, finding severity/status/remediation, optional templates, screenshot paste/drop/upload, SHA-256 metadata, original source files, Timeline and project search.                                     | [Research and exports](DELIVERY.md)                                       |
| Context and recovery   | Project-specific page/tab, selections, filters and editors; draft status distinguishes WebView, SQLite and memory-only copies; conflict comparison, separate-copy/manual merge and retained earlier text.        | [Recovery](HTB-WORKSPACE.md#drafts-conflicts-and-recovery)                |
| Manual verification    | Web/service methodologies with four explicit review states; ordered investigation plans; append-only finding retests (fixed, still present, inconclusive).                                                       | [Methodologies](METHODOLOGIES.md), [retests](DELIVERY.md#build-a-finding) |
| Recon sequences        | Saved ordered actions, full target/parameter preview, automatic advancement after approval or individual steps, pause after current step, cancellation and explicit retry with attempt history.                  | [Sequence controls](HTB-WORKSPACE.md#run-a-saved-sequence)                |
| Task planning          | Five statuses, priorities, owners, deadlines, templates and object/source links; project progress, overdue work and risk overview.                                                                               | [User guide](USAGE.md)                                                    |
| Reports                | Saved composition, working/delivery presets, preview validation; Markdown, standalone HTML or ZIP with explicitly selected evidence. No mandatory customer fields or finding-completeness gate.                  | [Exports](DELIVERY.md#review-and-export)                                  |
| Credential vault       | Password-derived encryption; reveal/hide/lock and idle expiry. Vault records stay out of search and ordinary reports.                                                                                            | [Encryption](DATA.md#what-is-encrypted)                                   |
| Portable projects      | `.dtproj` export/import, evidence and remapped references; import creates a separate project. Research drafts/recovery and retests travel in v5. Credentials require explicit inclusion and an archive password. | [Transfer](DATA.md#project-archives)                                      |
| Desktop preferences    | Light/dark/system theme, accent, density, reduced motion, graph detail, tool paths and searchable command palette.                                                                                               | [Navigation](NAVIGATION.md)                                               |

## Targets and formats

- Live adapters accept **individual IPv4 addresses or IPv4 HTTP origins**, depending on the tool. Offline scope/imports also support domains, CIDR and IPv6. That does not enable live scanning of these target forms.
- Nuclei **HTTP results can be imported**; a built-in Nuclei runner is not provided. Binary `.burp` projects, HAR and Nessus imports are not supported. See [exact import formats and budgets](IMPORTS.md).
- Tool profiles validate allowed options. There is no arbitrary shell-command runner or automatic exploitation. Tool output never confirms a vulnerability or marks a methodology check tested.
- Automatic recon advances only through the selected, previewed sequence. Failed/cancelled/interrupted steps stop progression; retries are explicit. Restart/import pauses active sequences and never restores execution authorization.

## Data and export limits

- SQLite, evidence, ordinary notes and recovery text are **plain project data**. Vault encryption is separate and does not encrypt the whole project or protect an already compromised computer.
- `.dtproj` v5 includes research workspace drafts and retained conflict/recovery text. Review these before transfer. Report composition stays local. Imports read v1–v5; older apps cannot read v5. Back up before upgrading and restore a matching backup for rollback.
- Reports export Markdown, HTML or ZIP. Native PDF/DOCX is not implemented; HTML can be printed from a browser. Explicit evidence inclusion is limited to **100 files / 32 MiB**. Drafts, vault records and raw scan buffers are excluded from reports; authored text can still contain sensitive data.
- Terminal history retains a bounded **64 KiB tail per scan**. Artifact retention is manual. See [storage and backups](DATA.md) for archive/file budgets and recovery details.
- There is no hosted collaboration service. Local project storage does not stop recon tools from sending traffic to approved targets.

## Release and platform status

The current published download is **0.9.1**, marked **prerelease / early MVP**, for **Linux x86_64 (amd64)** with an English interface. The `.deb` bundles its frontend, Python interpreter and backend; recon executables are installed separately. Windows, macOS and ARM installers are not provided.

The release workflow verifies its package on Ubuntu and installs that exact package on Kali before publication. It also checks data and encrypted-vault upgrades from published 0.8.0 and 0.9.0. These are distinct verification paths; container measurements do not establish performance on a particular VM. A real 4 GB VirtualBox run remains separate. [Exact evidence and limits](BUILD-0.9.1.md) · [Future priorities](ROADMAP.md)
