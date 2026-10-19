# Dragontrip 0.10.0 build evidence

The release workflow builds the installer on Ubuntu 24.04, validates published-version upgrades and packaged Tauri/WebKit behavior, then installs that exact package on Kali Rolling before publishing it. The release page is the download source; local packages and Actions artifacts are not interchangeable with its checksum.

[Release workflow](https://github.com/coldvisixn/dragontrip/actions/workflows/release.yml) · [Release notes](releases/v0.10.0.md) · [Download](https://github.com/coldvisixn/dragontrip/releases/tag/v0.10.0).

## Local implementation acceptance

[The investigation validation report](experience/VALIDATION.ru.md) records 138 backend tests, 48 frontend tests, separate live Nmap, the complete goal-to-retest/restart/archive journey, migration 0005→0006, original-v5 import, both themes and three viewport sizes. Actual Tauri/WebKitGTK testing is recorded separately from browser tests. Raw logs, screenshots and environment details are linked there.

The workspace has been tested against an isolated loopback server and authored fixtures only. No private projects or credentials are included in presentation assets.

The publication working tree also passed `npm run check` (138 backend / 48 frontend) and the browser delivery workflow: evidence attachment, manual retest, report ZIP/HTML and standalone report verification. The gallery and MP4 were recaptured from 0.10.0 using authored offline fixtures.

## Source acceptance

[PR #24](https://github.com/coldvisixn/dragontrip/pull/24) was merged after [Linux/installed-Kali acceptance](https://github.com/coldvisixn/dragontrip/actions/runs/39160996541) and [JavaScript/Python/Rust audits](https://github.com/coldvisixn/dragontrip/actions/runs/39160996489) passed. The tested tree matches the release source `f8a04ea1622433be38c9bfd7038765932d59304b`.

Published 0.8.0 and 0.9.0 installers were also downloaded locally and checked against pinned SHA-256 digests. Both actual frozen backends passed an upgrade to the current backend, preserving records, retests, original evidence, objects, encrypted Vault credentials and legacy drafts; original archives imported and v6 export passed. These local checks are separate from the final published-package verification below.

## Published result — 2026-10-18

- [Release build, native Ubuntu checks, installed-Kali acceptance and publication](https://github.com/coldvisixn/dragontrip/actions/runs/39161980509): all passed.
- Public installer: **63,072,438 bytes**, SHA-256 `b5fa2c052fd52e698d8ae6dd54f386b930adad6ff74803c6c48ee695367220db`.
- Both public assets were independently downloaded. Their SHA-256 values match the public GitHub asset digests, and the supplied checksum verifies the installer. Debian metadata is **0.10.0 / amd64**.
- The actual backend extracted from the public installer passed an upgrade from the published **0.9.1** package, preserving records, retests, evidence, objects, encrypted Vault credentials and legacy drafts. The project goal, original-v5 import and v6 export were verified. [Raw result](release-validation/v0.10.0/published-upgrade.log).
- [Machine-readable package identity](release-validation/v0.10.0/published-package.json) records source, tag, assets and workflow/job IDs. This documentation update does not alter the tagged package.

## Compatibility

Schema 0006 adds `Project.goal`. Project archive exports use v6; imports accept v1–v6. Older applications reject v6; use a matching complete backup when rolling back. Low/Medium/High are rendering preferences, not recon intensity profiles.

## Platform and performance limits

The local native checks ran in Debian 13 / WebKitGTK 2.54.0 / Xvfb, not a physical Kali workstation or VirtualBox VM. Native 300-node frame delays remain documented; browser numbers are not native performance claims. The release pipeline also passed Ubuntu and installed-Kali checks. Kali used the pinned Rolling container with a 4 GiB / 2 CPU limit; that does not establish performance in a physical or VirtualBox environment.
