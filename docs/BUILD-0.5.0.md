# Dragontrip 0.5.0 local Debian build

This package includes the task board, project overview and Markdown reports from planning commit `3a8023f`, with synchronized 0.5.0 version metadata. This record describes the local build. Tagged CI releases rebuild from source and attach their own installer/checksum; those artifacts can differ from this local package.

## Artifact

- File: `src-tauri/target/release/bundle/deb/dragontrip_0.5.0_amd64.deb`
- Version/architecture: `dragontrip 0.5.0 amd64`
- Size: 42.58 MiB (about 43 MB)
- SHA-256: `7702c2975038bd79abe0b0228349ab24008867267d27c1d0d1e397f11d612ed8`
- Checksum sidecar: `dragontrip_0.5.0_amd64.deb.sha256`

```bash
sha256sum --check dragontrip_0.5.0_amd64.deb.sha256
sudo apt install ./dragontrip_0.5.0_amd64.deb
dragontrip
```

See [INSTALL-KALI.md](INSTALL-KALI.md) for optional system recon tools and user data locations.

## Verification

The frontend production build and PyInstaller backend build passed. The frozen-backend migration/restart smoke passed. Rust 1.99.0 and the prepared Debian build container produced the Tauri package. Installing this exact package upgraded 0.4.0 to 0.5.0 successfully. SHA-256 digests of the installed executable and backend match the files extracted from this `.deb`.

Installed application checks ran on Debian 13 (trixie), WebKitGTK 2.54.0 and Xvfb:

- Applications-menu launcher, icon, window class, visible rendering and normal window close.
- Real Nmap/WhatWeb against an isolated loopback server, graph/Inspector, native evidence export, object dragging/manual links and restart persistence.
- Markdown, screenshot evidence, Timeline/search, theme settings, vault reveal/hide and encrypted project export/import.
- 100/300-object profiling and closing the application during a scan without leaving live descendants.
- New task creation with owner, priority and object links; project overview; report preview and private Markdown export; persistence after restarting the actual installed application.

The native planning check is reproducible with `scripts/native-planning-smoke.py /usr/bin/dragontrip` under Xvfb and tauri-driver. No connection or API shim is injected. The nested test container disables WebKit's sandbox only for automation; the production application retains its default sandbox configuration.

Measured startup was 2.78 seconds. Idle PSS was 518 MiB and 300-object graph PSS was 632 MiB; all application descendants are included. Full measurements: [0.5.0-native-profile.json](0.5.0-native-profile.json). These are cloud-container measurements, not acceptance results for a 4 GB Kali VirtualBox VM.

Native screenshots use explicitly manual test fixtures: [tasks](screenshots/0.5.0-native-tasks.png) and [report](screenshots/0.5.0-native-report.png).
