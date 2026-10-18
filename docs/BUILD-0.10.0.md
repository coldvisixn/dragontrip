# Dragontrip 0.10.0 build evidence

The release workflow builds the installer on Ubuntu 24.04, validates published-version upgrades and packaged Tauri/WebKit behavior, then installs that exact package on Kali Rolling before publishing it. The release page is the download source; local packages and Actions artifacts are not interchangeable with its checksum.

[Release workflow](https://github.com/coldvisixn/dragontrip/actions/workflows/release.yml) · [Release notes](releases/v0.10.0.md) · [Download](https://github.com/coldvisixn/dragontrip/releases/tag/v0.10.0).

## Local implementation acceptance

[The investigation validation report](experience/VALIDATION.ru.md) records 138 backend tests, 48 frontend tests, separate live Nmap, the complete goal-to-retest/restart/archive journey, migration 0005→0006, original-v5 import, both themes and three viewport sizes. Actual Tauri/WebKitGTK testing is recorded separately from browser tests. Raw logs, screenshots and environment details are linked there.

The workspace has been tested against an isolated loopback server and authored fixtures only. No private projects or credentials are included in presentation assets.

The publication working tree also passed `npm run check` (138 backend / 48 frontend) and the browser delivery workflow: evidence attachment, manual retest, report ZIP/HTML and standalone report verification. The gallery and MP4 were recaptured from 0.10.0 using authored offline fixtures.

## Compatibility

Schema 0006 adds `Project.goal`. Project archive exports use v6; imports accept v1–v6. Older applications reject v6; use a matching complete backup when rolling back. Low/Medium/High are rendering preferences, not recon intensity profiles.

## Platform and performance limits

The local native checks ran in Debian 13 / WebKitGTK 2.54.0 / Xvfb, not a physical Kali workstation or VirtualBox VM. Native 300-node frame delays remain documented; browser numbers are not native performance claims. Publication additionally requires the release pipeline's Ubuntu and installed-Kali checks. Public package identity and final run links will be recorded after that pipeline succeeds.
