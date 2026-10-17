# Dragontrip 0.9.1 build and verification

The release contains the security corrections from PR #16 and the coordinated
dependency reconciliation documented in [PR review](PR-REVIEW-0.9.1.md).

## Package

- Version/architecture: **0.9.1 / amd64**.
- Installer: `dragontrip_0.9.1_amd64.deb` and matching `.deb.sha256`.
- [Public download](https://github.com/coldvisixn/dragontrip/releases/tag/v0.9.1).
- [Release workflow](https://github.com/coldvisixn/dragontrip/actions/workflows/release.yml).

The published checksum belongs to the release workflow's actual package. Local
builds and earlier PR artifacts may have different bytes and must not reuse it.

## Published result — 2026-10-17

- Release source: `85072990d515f9db37c76adf7e10fbb92e2b0a85` (`v0.9.1`, merged PR #17).
- [Release build, installed-Kali gate and publication](https://github.com/coldvisixn/dragontrip/actions/runs/39066091106): all passed.
- [Pre-merge Linux/Kali acceptance](https://github.com/coldvisixn/dragontrip/actions/runs/39065068646) and [security audits](https://github.com/coldvisixn/dragontrip/actions/runs/39065068650): passed; the tested tree matches the release commit.
- Public installer: **63,057,764 bytes**, SHA-256 `f9a474f4f4922a4a05d078e661016e283b6fe6a970a385fecdb82d6e40c28174`.
- Both public assets were independently downloaded; their byte lengths and SHA-256 digests match GitHub asset metadata, and the supplied checksum verifies the installer.
- Extracted public package metadata is `0.9.1` / `amd64`. Its actual frozen backend passed a fresh upgrade from the published 0.9.0 backend, including records, retests, original evidence, objects, encrypted vault decryption, legacy drafts and portable v5 export.
- [Machine-readable publication evidence](release-validation/v0.9.1/published-package.json) records asset identity, source and workflow/job IDs. This later documentation update does not change or replace the tagged package.

## Publication gates

The tag must match npm, npm lockfile root metadata, Cargo manifest/lock metadata,
Tauri metadata and versioned release notes. Before publication the workflow must
pass backend/UI checks, the rebuilt frozen backend, optimized GLib regressions,
and native WebKit planning/research/workflow/navigation/delivery acceptance.

Both published **0.8.0** and **0.9.0** installers are downloaded using pinned
SHA-256 digests and used as actual frozen-backend upgrade baselines. Checks cover
records, retests, original evidence, objects, encrypted vault decryption, legacy
draft recovery and portable v5 transfer against the new backend.

The build's `.deb` and native test driver are then passed to a separate Kali
Rolling job. It installs that exact package, exercises the real recon adapters,
desktop launcher/native investigation and shutdown, and checks that uninstalling
retains user data. The publish job depends on both build and installed-Kali
success, so a failing installer cannot be published by this workflow.

## Limits

Kali checks run in the pinned rolling container with a 4 GiB / 2 CPU limit.
They do not establish resource use in a particular VM or replace a physical /
VirtualBox acceptance run. Supported output remains Linux x86_64; no Windows,
macOS or ARM package is claimed. The remaining build-tool maintenance warning is
documented in the [security audit](SECURITY-AUDIT-2026-10-17.md).
