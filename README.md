<div align="center">

# DRAGONTRIP

**Your investigation, connected.**

An offline-first desktop workspace for security assessments: discover infrastructure, connect the evidence, track findings and turn your work into a report.

[Download v0.5.0](https://github.com/coldvisixn/dragontrip/releases/tag/v0.5.0) · [Installation](docs/INSTALL.md) · [Русский](README.ru.md) · [Documentation](docs/README.md)

[![Release](https://img.shields.io/github/v/release/coldvisixn/dragontrip?include_prereleases&label=release)](https://github.com/coldvisixn/dragontrip/releases)
[![Linux build](https://github.com/coldvisixn/dragontrip/actions/workflows/linux.yml/badge.svg?branch=main)](https://github.com/coldvisixn/dragontrip/actions/workflows/linux.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux%20x86__64-7c6bf0)](docs/INSTALL.md)

</div>

![Dragontrip infrastructure graph in the packaged desktop application](docs/screenshots/phase4-native-graph.png)

Dragontrip keeps recon results, infrastructure relationships, notes, findings, evidence and follow-up tasks in one local project. It is designed for Kali Linux users working on authorized assessments, labs and investigation workflows.

**Current version: 0.5.0 — early preview.** An installable Debian package is available for Linux x86_64 (`amd64`). The local package has passed installed-Debian/WebKit checks, and [installed Kali Rolling CI](https://github.com/coldvisixn/dragontrip/actions/runs/38942229914) has passed for the release commit. Testing on a 4 GB VirtualBox VM remains separate. Windows, macOS and ARM packages are not provided.

**Research foundation (0.6.0):** Adds project scope, offline Nmap/Burp/Nuclei imports and an application-focused web map. The published download above remains 0.5.0. See [scope/import usage and exact limitations](docs/IMPORTS.md), [audit and staged plan](docs/RESEARCH-WORKSPACE.md), and [local build verification](docs/BUILD-0.6.0.md).

**0.7.0 development update:** four-state methodologies and guided, saved recon sequences now complement the 0.6.0 import/web-map stage. [Usage and limitations](docs/METHODOLOGIES.md) · [Local package verification](docs/BUILD-0.7.0.md).

**0.7.1:** a grouped sidebar, section tabs and a persistent compact mode simplify navigation. [Screenshots and behavior](docs/NAVIGATION.md).

## Get started

1. Open [Releases](https://github.com/coldvisixn/dragontrip/releases/tag/v0.5.0) and download **`dragontrip_0.5.0_amd64.deb`** and its **`.sha256`** file from **Assets**. GitHub's “Source code” archives are for developers.
2. In the folder containing both files, verify and install:

```bash
sha256sum --check dragontrip_0.5.0_amd64.deb.sha256
sudo apt update
sudo apt install ./dragontrip_0.5.0_amd64.deb
dragontrip
```

On Kali, install the recon tools you want to use:

```bash
sudo apt install nmap whatweb httpx-toolkit ffuf
```

The desktop package bundles its frontend and Python backend. You do not need Node.js, Rust, pip or Docker to run it. Recon tools are detected from your system; ProjectDiscovery **httpx** (`httpx-toolkit` on Kali) is different from the Python library with the same name.

Create a project, scan an authorized IPv4 target, inspect discovered objects in the graph, then link your findings and tasks to the evidence. See [the first-project walkthrough](docs/USAGE.md) and [installation/troubleshooting](docs/INSTALL.md).

## What you can do

| Workspace | Capabilities |
| --- | --- |
| **Recon** | Nmap, WhatWeb, ProjectDiscovery httpx and ffuf adapters; Quick/Full/Service profiles; saved profiles; a bounded queue with cancellation and scan history. |
| **Infrastructure graph** | Hosts, services, URLs and custom objects; typed relationships; Inspector; saved positions and viewport; search, pan/zoom and a minimap. |
| **Investigation knowledge** | Markdown notes, severity/status/remediation findings and ordered, manually authored investigation paths, linked to objects and source scans. |
| **Evidence** | Screenshot/file attachments, SHA-256 metadata, original XML/JSON artifacts, authenticated previews, project Timeline and unified search. |
| **Task planning** | A five-status board with priorities, owners, deadlines, templates and object links; project progress, overdue work and risk overview. |
| **Reporting** | Configurable Markdown reports with executive summary, finding filters, remediation, inventory, task plan and evidence references; preview and Downloads export. |
| **Credential vault** | Password-derived encryption, explicit reveal/hide/lock and idle expiry. Vault entries are kept out of search and ordinary reports. |
| **Portable projects** | `.dtproj` export/import with evidence and remapped identities; importing creates a separate project. Credentials require explicit inclusion and an archive password. |
| **Desktop preferences** | Theme, accent, density, reduced motion, graph detail, tool paths and a searchable command palette. |

![Task board in the installed 0.5.0 application](docs/screenshots/0.5.0-native-tasks.png)

Screenshots show manual test fixtures and local validation projects. New projects start empty.

## Local by design

Project data lives in `${XDG_DATA_HOME:-~/.local/share}/dragontrip/`, backed by SQLite and local evidence files. The desktop manages a loopback-only API with a fresh token on each launch. Project work does not require a hosted Dragontrip account or cloud database.

Notes, evidence and ordinary project exports contain plain project data. The credentials vault is encrypted separately; it does not encrypt the whole project or protect an already compromised computer. Back up the data directory with the application closed. [Data handling and recovery →](docs/DATA.md)

Recon tools send network traffic to the targets you approve. Use Dragontrip only where you have permission to test. Investigation paths and tasks document manual work; they do not execute exploits.

## Scope and current limits

- Recon targets are individual IPv4 addresses or IPv4 web origins, depending on the adapter. CIDR ranges, IPv6 and hostname scope are not currently supported.
- Scan profiles use validated tool options; there is no arbitrary shell-command runner or automatic exploitation.
- Reports export Markdown. PDF/HTML reporting is not implemented. Report composition resets when leaving its page.
- Terminal history retains a bounded tail; artifact retention is manual.
- Archives containing 0.5.0 task records require the updated importer. Back up before upgrading and avoid reopening an upgraded database with an older binary.
- Large-graph and memory measurements are documented; results from a cloud container do not replace testing on your own VM.

See [the roadmap](docs/ROADMAP.md) and [0.5.0 build verification](docs/BUILD-0.5.0.md) for exact behavior and test evidence.

## Build and contribute

The stack is **Tauri 2 + React/TypeScript + Python/FastAPI + SQLite**, packaged with PyInstaller for Linux.

```bash
git clone https://github.com/coldvisixn/dragontrip.git
cd dragontrip
bash scripts/setup.sh
npm run desktop:dev
```

Install the Linux development dependencies and pinned toolchain first: [development and packaging](docs/DEVELOPMENT.md). Contributions, bug reports and reproducible test cases are welcome: [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

[Installation](docs/INSTALL.md) · [Инструкция для Kali](docs/INSTALL-KALI.md) · [User guide](docs/USAGE.md) · [Data and backups](docs/DATA.md) · [Changelog](CHANGELOG.md) · [Release process](docs/RELEASING.md) · [Security](SECURITY.md)

## License

[MIT](LICENSE). Recon tools installed separately retain their own licenses.
