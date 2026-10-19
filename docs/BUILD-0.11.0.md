# Dragontrip 0.11.0 validation

[Release notes](releases/v0.11.0.md) · [Release workflow](https://github.com/coldvisixn/dragontrip/actions/workflows/release.yml) · [Download](https://github.com/coldvisixn/dragontrip/releases/tag/v0.11.0)

## Implementation checks

The localization and motion changes passed 55 frontend tests, ESLint/Ruff, formatting and the production frontend build. Chromium acceptance against an isolated real backend verified English/Russian switching, language persistence after reload, original project text, Russian command search, translated option values, normal tab transitions and disabled transitions for application/system reduced motion. The Russian interface was inspected at 1366 × 850 without horizontal page overflow.

`scripts/localization-smoke.cjs` makes this browser check reproducible and runs against the frozen backend in Linux and release CI. Browser acceptance substitutes only Tauri's API connection delivery; it is separate from testing the installed desktop application.

## Installer publication

The tagged release workflow must pass its complete backend/frontend checks, frozen-backend language/motion acceptance, upgrades from published 0.8.0, 0.9.0 and 0.10.0 installers and native Tauri/WebKit tests. Its exact Debian package must also pass installed-Kali acceptance before the publish job creates the GitHub release. The workflow publishes the installer and its matching SHA-256 file without replacing previous assets.

The Actions page records the actual job results. A source commit or local browser check alone is not evidence that a new installer has been published. Download the `.deb` and `.deb.sha256` from the release page and verify them together.

## Compatibility and limits

Database schema 0006 and project archive v6 are unchanged from 0.10.0; imports read v1–v6. Projects, authored content, original evidence and encrypted credentials keep their existing representation. Language is a device preference; motion is retained with appearance settings. Recon tools remain separate system installations.

The supported installer targets Linux x86_64. Container-based Ubuntu/Kali checks do not establish performance on a physical workstation or a particular VirtualBox VM. Existing technical output and generated report content retain their source language.
