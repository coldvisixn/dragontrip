<div align="center">

# DRAGONTRIP

**Investigate a machine. Keep your reasoning. Pick up where you left off.**

A local desktop workspace for Hack The Box and similar authorized labs: Nmap, Burp and Nuclei results, observations, hypotheses, findings and next checks in one project. No Dragontrip account required.

[Download v0.9.0](https://github.com/coldvisixn/dragontrip/releases/tag/v0.9.0) · [Installation](docs/INSTALL.md) · [Русский](README.ru.md) · [Documentation](docs/README.md)

[![Release](https://img.shields.io/github/v/release/coldvisixn/dragontrip?include_prereleases&label=release)](https://github.com/coldvisixn/dragontrip/releases)
[![Linux build](https://github.com/coldvisixn/dragontrip/actions/workflows/linux.yml/badge.svg?branch=main)](https://github.com/coldvisixn/dragontrip/actions/workflows/linux.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux%20x86__64-7c6bf0)](docs/INSTALL.md)

</div>

![Dragontrip project start](docs/investigation-validation/screenshots/research.png)

Dragontrip is for pentesters and security researchers who want to carry an assessment from raw tool output to findings with traceable evidence. Keep infrastructure, web applications, notes, checklists and follow-up work together on your own machine.

**0.9.0 · Early MVP · Linux x86_64 · MIT.** Download the `.deb` and matching checksum from the versioned release above. The interface is in English. [Release notes](docs/releases/v0.9.0.md) · [Workflow and limits](docs/DELIVERY.md).

## What's new in 0.9.0

- **Resume your investigation:** project-specific page/tab, target, application/endpoint, searches, filters, graph view and open-editor recovery.
- **Resolve draft conflicts:** see both versions and timestamps, save a separate record or merge manually, and recover replaced text. Status distinguishes browser, SQLite and memory-only copies.
- **Write from observations:** create linked notes/hypotheses, draft findings or tasks with known objects, source runs and evidence. Repeated clicks and imports reuse linked records.
- **Run selected checks:** one full sequence preview, automatic next steps, pause, cancel and explicit retry with attempt history. Restart never resumes network actions.
- **Less interface overhead:** Research, Recon and Notebook, contextual actions and collapsed optional fields. Existing methodologies, vault, manual retests and reviewed reports remain available.

## One project, from first import to handoff

1. **Set the boundaries.** Record included and excluded IPs, networks, domains and web origins.
2. **Bring your results.** Preview and import Nmap XML, Burp saved-items/issue XML or HTTP Nuclei JSONL. Keep original sources and inspect what each import adds or changes.
3. **Follow the connections.** Move between the infrastructure graph, web applications, method-specific endpoints and the observations behind them.
4. **Build the case.** Link findings, notes and evidence to objects. Record methodology coverage and turn follow-up work into tasks.
5. **Prepare the handoff.** Compose a Markdown report or transfer a project with its evidence in a portable `.dtproj` archive.

For live recon, use Nmap, WhatWeb, ProjectDiscovery httpx or ffuf through validated profiles and a cancellable queue. Saved recon workflows preview every target and parameter, then run as an explicitly approved sequence or one step at a time. Notes, findings and tasks recover drafts and link back to source observations. [Local HTB investigation and recovery](docs/HTB-WORKSPACE.md). [Import formats and limits](docs/IMPORTS.md) · [Methodologies and workflows](docs/METHODOLOGIES.md).

## Get started

1. Open [Releases](https://github.com/coldvisixn/dragontrip/releases/tag/v0.9.0) and download **`dragontrip_0.9.0_amd64.deb`** and its **`.sha256`** file from **Assets**. GitHub's “Source code” archives are for developers.
2. In the folder containing both files, verify and install:

```bash
sha256sum --check dragontrip_0.9.0_amd64.deb.sha256
sudo apt update
sudo apt install ./dragontrip_0.9.0_amd64.deb
dragontrip
```

On Kali, install the recon tools you want to use:

```bash
sudo apt install nmap whatweb httpx-toolkit ffuf
```

The desktop package bundles its frontend and Python backend. You do not need Node.js, Rust, pip or Docker to run it. Recon tools are detected from your system; ProjectDiscovery **httpx** (`httpx-toolkit` on Kali) is different from the Python library with the same name.

Create a project and follow the import/scope/recon actions in Project overview, or explicitly create a separate fictional demo from Dashboard/Projects. See [the first-project walkthrough](docs/USAGE.md) and [installation/troubleshooting](docs/INSTALL.md).

## What you can do

| Workspace | Capabilities |
| --- | --- |
| **Scope and imports** | Include/exclude scope; previewed Nmap/Burp/Nuclei imports, preserved sources, import comparison and application/endpoint views. |
| **Recon** | Nmap, WhatWeb, ProjectDiscovery httpx and ffuf adapters; Quick/Full/Service profiles; saved profiles; a bounded queue with cancellation and scan history. |
| **Infrastructure graph** | Hosts, services, URLs and custom objects; typed relationships; Inspector; saved positions and viewport; search, pan/zoom and a minimap. |
| **Investigation knowledge** | Markdown notes, severity/status/remediation findings with append-only manual retests, finding templates and recoverable drafts; ordered manual plans linked to objects and source scans. |
| **Evidence** | Upload, paste or drop screenshots/files; SHA-256 metadata, original XML/JSON artifacts, authenticated previews, project Timeline and unified search. |
| **Methodologies and workflows** | Four-state web/service review checklists; saved recon sequences with full preview, automatic advancement, pause, cancellation and retained retries. |
| **Task planning** | A five-status board with priorities, owners, deadlines, templates and object links; project progress, overdue work and risk overview. |
| **Reporting** | Persistent composition, delivery/working presets, preview validation and Downloads export as Markdown, standalone HTML or ZIP with selected evidence. |
| **Credential vault** | Password-derived encryption, explicit reveal/hide/lock and idle expiry. Vault entries are kept out of search and ordinary reports. |
| **Portable projects** | `.dtproj` export/import with evidence and remapped identities; importing creates a separate project. Credentials require explicit inclusion and an archive password. |
| **Desktop preferences** | Theme, accent, density, reduced motion, graph detail, tool paths and a searchable command palette. |

![Dragontrip report delivery](docs/delivery-validation/screenshots/report-delivery.png)

Screenshots show explicitly authored, isolated validation projects. Real projects start empty; the fictional demo is a separate opt-in project.

## Local by design

Project data lives in `${XDG_DATA_HOME:-~/.local/share}/dragontrip/`, backed by SQLite and local evidence files. The desktop manages a loopback-only API with a fresh token on each launch. Project work does not require a hosted Dragontrip account or cloud database.

Notes, evidence and ordinary project exports contain plain project data. The credentials vault is encrypted separately; it does not encrypt the whole project or protect an already compromised computer. Back up the data directory with the application closed. [Data handling and recovery →](docs/DATA.md)

Recon tools send network traffic to the targets you approve. Use Dragontrip only where you have permission to test. Investigation paths and tasks document manual work; they do not execute exploits.

## Scope and current limits

- Live recon accepts individual IPv4 addresses or IPv4 web origins, depending on the adapter. Offline scope/imports also support domains, CIDR and IPv6; that support does not enable live scanning of those target forms.
- Imports use specific Nmap XML, Burp XML and HTTP Nuclei JSONL formats. Binary `.burp` projects, HAR and Nessus imports are not supported. Nuclei results can be imported; there is no built-in Nuclei runner.
- Scan profiles use validated tool options; there is no arbitrary shell-command runner or automatic exploitation.
- Reports export Markdown, standalone HTML or ZIP; there is no native PDF/DOCX exporter. HTML can be printed from a browser. Evidence files require explicit selection (100 files / 32 MiB).
- Research drafts and recovery copies are unencrypted and included in v5 `.dtproj` transfers; review them before sharing. Report composition remains local.
- Terminal history retains a bounded tail; artifact retention is manual.
- Current project exports use archive format v5 and read v1/v2/v3/v4. Older apps cannot read v5. Back up before upgrading and avoid reopening an upgraded database with an older binary.
- Large-graph and memory measurements are documented; results from a cloud container do not replace testing on your own VM.

The published 0.9.0 installer passed its [release workflow](https://github.com/coldvisixn/dragontrip/actions/runs/39024772755), independent download/checksum verification and installed Debian Tauri/WebKit restart/recovery acceptance. Installed [Kali Rolling acceptance](https://github.com/coldvisixn/dragontrip/actions/runs/39041521955/job/117422788256) passed for the independently CI-built package with unchanged application code. [Exact evidence and verification limits](docs/BUILD-0.9.0.md). A 4 GB VirtualBox run remains separate. Windows, macOS and ARM installers are not provided. See [the roadmap](docs/ROADMAP.md).

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
