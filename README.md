<div align="center">

![Dragontrip — local workspace for security research](docs/media/banner.svg)

# Follow the evidence. Keep the thread.

**A local desktop workspace for penetration testing and security research.**

Connect recon results, observations, hypotheses, findings and next checks in one project — and return with your reasoning intact.

**[Download for Linux · v0.10.0](https://github.com/coldvisixn/dragontrip/releases/tag/v0.10.0)** · [Quick start](#get-started) · [See it in action](docs/SHOWCASE.md) · [Русский](README.ru.md)

[![Release](docs/media/badges/release.svg)](https://github.com/coldvisixn/dragontrip/releases/tag/v0.10.0)
[![Linux build](https://github.com/coldvisixn/dragontrip/actions/workflows/linux.yml/badge.svg?branch=main)](https://github.com/coldvisixn/dragontrip/actions/workflows/linux.yml)
[![Linux x86_64](docs/media/badges/platform.svg)](docs/INSTALL.md)
[![MIT license](docs/media/badges/license.svg)](LICENSE)

</div>

![Real Dragontrip interface: imported infrastructure and applications in a fictional portal review](docs/media/research-graph.png)

## Keep the investigation together

An assessment leaves more than scanner output: a response worth checking, a hypothesis that did not hold, an unfinished note, a finding with evidence. Dragontrip keeps those pieces connected to their sources and to the work that comes next.

Built for practicing pentesters, independent security researchers and people learning in authorized labs.

- **Follow the source.** Import Nmap, Burp and Nuclei results; move from infrastructure and web endpoints to the observations and original files behind them.
- **Turn observations into work.** Create a linked note, hypothesis, draft finding or task. Keep unsuccessful checks alongside the leads you pursue.
- **Resume with context.** Restore project navigation, selections, filters and editor drafts. Resolve conflicting edits with both versions in view and recover replaced text.
- **Keep your workspace local.** SQLite and evidence files live on your machine. No Dragontrip account or hosted project database is required.

## From recon to the next check

1. **Set a goal and boundaries.** Use Plan to describe the investigation goal. Record included and excluded targets. Import existing results with a preview, or approve live recon through supported tool profiles.
2. **Explore what you observed.** Follow hosts, services and applications in the graph; inspect method-specific endpoints and source observations.
3. **Form a hypothesis.** Create a linked record, collect evidence and decide what needs manual verification. An imported observation alone does not confirm a vulnerability.
4. **Check and record.** Track follow-up tasks, manual methodology decisions and finding retests. Saved recon sequences can advance automatically after a full preview and approval, with pause, cancel and explicit retry.
5. **Continue or share.** Reopen the project with its working context, transfer it as `.dtproj`, or export selected work as Markdown, standalone HTML or an evidence ZIP.

Reports are one possible result. A useful next check, a disproved hypothesis and a recoverable research notebook are results too.

## In practice

- **Authorized pentest:** bring together Nmap service inventory, Burp endpoint observations and Nuclei HTTP results. Link a suspected access-control issue to its source, plan a manual check and record the outcome before confirming a finding.
- **Independent research:** keep a hypothesis, its supporting responses and the checks that ruled it out; return later without reconstructing the investigation from terminal history.
- **Lab or training:** work through an HTB or similar authorized machine, preserve your reasoning across sessions and keep your own methodology notes.

## See the workflow

**[Short recorded walkthrough](docs/SHOWCASE.md#recorded-walkthrough)** · [Full gallery, including light theme](docs/SHOWCASE.md)

<details>
<summary><strong>Inspect an endpoint and its original observation</strong></summary>

![An imported endpoint response and linked-record actions in the actual application](docs/media/web-observation.png)

</details>

<details>
<summary><strong>Connect a hypothesis to its source and follow-up work</strong></summary>

![A saved hypothesis with source links and an action to create a linked task](docs/media/linked-note.png)

</details>

Screenshots and the recording use the real application with an isolated, explicitly authored fictional project (`192.0.2.10`, `portal.example.test`). No target requests were sent. New projects start empty; the built-in fictional demo is a separate opt-in project.

## Get started

**0.10.0 connects the complete investigation.** Set a project goal, approve a recon plan, follow services into web research and keep evidence, tasks and retests linked. The new workspace preserves context and partial results across interruptions. [Release notes](docs/releases/v0.10.0.md) · [Build verification](docs/BUILD-0.10.0.md) · [Audit and before/after evidence](docs/experience/README.ru.md).

Download **[`dragontrip_0.10.0_amd64.deb`](https://github.com/coldvisixn/dragontrip/releases/download/v0.10.0/dragontrip_0.10.0_amd64.deb)** and its **[SHA-256 file](https://github.com/coldvisixn/dragontrip/releases/download/v0.10.0/dragontrip_0.10.0_amd64.deb.sha256)** into the same folder. GitHub's “Source code” archives are for developers.

If upgrading, close Dragontrip and [back up the complete data directory](docs/DATA.md#back-up-the-installation) before installing.

```bash
sha256sum --check dragontrip_0.10.0_amd64.deb.sha256
sudo apt update
sudo apt install ./dragontrip_0.10.0_amd64.deb
dragontrip
```

Create a project and set its goal in **Plan**. Choose **Import results**, preview a supported export and open **Research**. For a guided example without your own data, choose **Create fictional demo** on Dashboard or Projects. [First-project guide →](docs/USAGE.md)

For live recon on Kali, install the tools you want to use:

```bash
sudo apt install nmap whatweb httpx-toolkit ffuf
```

The `.deb` bundles the frontend and Python backend; Node.js, Rust, pip and Docker are not needed to run it. Recon tools are separate system executables. The httpx adapter needs **ProjectDiscovery httpx** (`httpx-toolkit` on Kali), not the Python library.

**Current download:** 0.10.0 is a prerelease (early MVP), with an English interface and a Linux x86_64 installer. The release installer is checked on Ubuntu and installed on Kali before publication; see [build verification](docs/BUILD-0.10.0.md). A real 4 GB VirtualBox acceptance remains separate. [Installation, updates and troubleshooting →](docs/INSTALL.md) · [Инструкция для Kali →](docs/INSTALL-KALI.md)

## Capabilities and boundaries

The workspace also includes manual review methodologies, an infrastructure graph, evidence attachments and source history, a task board, an encrypted credential vault, portable projects and configurable reports. [Full capabilities and current limits →](docs/CAPABILITIES.md) · [What changed in 0.10.0 →](docs/releases/v0.10.0.md)

- Live recon uses **Nmap, WhatWeb, ProjectDiscovery httpx and ffuf**, with individual IPv4 targets or IPv4 web origins depending on the adapter. Offline domain/CIDR/IPv6 support does not enable live scanning of those forms.
- Imports support specific Nmap XML, Burp XML and HTTP Nuclei JSONL exports. There is no built-in Nuclei runner, arbitrary shell runner or automatic exploitation.
- Ordinary project data is **not encrypted**. The vault encrypts credentials separately. Research drafts and retained recovery text travel in `.dtproj` v6; review them before sharing. Report composition stays local. [Storage, backups and recovery →](docs/DATA.md)
- Reports export Markdown, HTML or ZIP with explicitly selected evidence (100 files / 32 MiB); native PDF/DOCX export is not available. Windows, macOS and ARM installers are not provided.

Use Dragontrip only for testing you are authorized to perform. Recon sends traffic to the targets you approve; methodologies and investigation paths record manual work. [Security policy →](SECURITY.md)

## Documentation and contribution

[Documentation index](docs/README.md) · [User guide](docs/USAGE.md) · [Imports](docs/IMPORTS.md) · [Recon sequences](docs/METHODOLOGIES.md) · [Drafts and recovery](docs/HTB-WORKSPACE.md) · [Changelog](CHANGELOG.md) · [Roadmap](docs/ROADMAP.md)

Built with **Tauri 2 · React/TypeScript · Python/FastAPI · SQLite**.

To build from source, install the [development dependencies and pinned toolchain](docs/DEVELOPMENT.md), then:

```bash
git clone https://github.com/coldvisixn/dragontrip.git
cd dragontrip
bash scripts/setup.sh
npm run desktop:dev
```

[Contributions](CONTRIBUTING.md), [reproducible bug reports](https://github.com/coldvisixn/dragontrip/issues/new/choose) and usability feedback are welcome. Please use fictional or redacted data. Report implementation vulnerabilities through [SECURITY.md](SECURITY.md).

[MIT licensed](LICENSE). Separately installed recon tools retain their own licenses.
