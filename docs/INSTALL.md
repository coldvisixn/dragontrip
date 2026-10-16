# Install Dragontrip

[Русская инструкция для Kali](INSTALL-KALI.md) · [User guide](USAGE.md)

## Choose the right download

Open [Releases](https://github.com/coldvisixn/dragontrip/releases/tag/v0.5.0) and expand **Assets**. Download both:

- `dragontrip_0.5.0_amd64.deb` — the desktop installer for Linux x86_64.
- `dragontrip_0.5.0_amd64.deb.sha256` — its SHA-256 checksum.

GitHub's automatically generated **Source code (zip/tar.gz)** downloads are source snapshots. They do not contain a ready-to-run application. Actions artifacts are intended for development builds; Releases is the user download page.

Version 0.5.0 is an early preview. The local package was checked on Debian 13 with WebKitGTK 2.54; published workflow builds record their own platform and checks. [Installed Kali Rolling CI](https://github.com/coldvisixn/dragontrip/actions/runs/38942229914) also passed for the release commit. The intended primary environment is current Kali Linux x86_64. Windows, macOS, ARM, older distribution compatibility and a specific VM performance guarantee are not provided.

Check your architecture with `dpkg --print-architecture`; this package requires `amd64`.

## Verify and install

Run these commands from the folder containing the downloaded files:

```bash
sha256sum --check dragontrip_0.5.0_amd64.deb.sha256
sudo apt update
sudo apt install ./dragontrip_0.5.0_amd64.deb
```

The checksum should report `OK`. A checksum detects file changes; it is not a separate cryptographic signature. If verification fails, download both files again from the same release.

APT installs the declared GTK/WebKit dependencies. The frontend, Python interpreter and backend dependencies are bundled. Node.js, Rust, pip, a development web server and Docker are not runtime requirements.

### Optional recon tools on Kali

```bash
sudo apt install nmap whatweb httpx-toolkit ffuf
```

Missing tools appear as unavailable in Dragontrip. **ProjectDiscovery httpx** is required for the httpx adapter; the Python `httpx` package is unrelated. On other distributions, obtain the supported tools from their distribution packages or official projects, then check **Tools** and **Settings → tool paths**.

## Launch

Open **Dragontrip** from the applications menu or run:

```bash
dragontrip
```

Create a project and follow [your first investigation](USAGE.md). The application starts and stops its local backend automatically.

## Upgrade

1. Close Dragontrip.
2. Back up the complete [data directory](DATA.md), including attachments and scan artifacts.
3. Download the new release's `.deb` and matching checksum, verify them, then install with `sudo apt install ./<new-package>.deb`.
4. Start Dragontrip. Database migrations run automatically.

Do not open an upgraded database with an older binary. To roll back, restore a matching pre-upgrade backup with the application closed. Archives containing task records introduced in 0.5.0 require the updated importer.

## Uninstall

```bash
sudo apt remove dragontrip
```

Removing the package leaves your project data in place. [Backups, exports and storage details](DATA.md) explain how to manage it separately.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| No `.deb` in the download | Expand **Assets** on the release page. “Source code” is not the installer. |
| Wrong architecture | This build requires `amd64`, not ARM64. Check `dpkg --print-architecture`. |
| Dependency errors | Use `apt install ./package.deb` on a supported, updated Debian-family system. Do not force incompatible GTK/WebKit libraries. |
| Recon tool unavailable | Install the system tool; check **Tools** and configured absolute executable paths. |
| httpx adapter unavailable | Verify you installed ProjectDiscovery httpx, not Python httpx. On Kali use `httpx-toolkit`. |
| Empty or black window | Start `dragontrip` from a terminal and include the error with your distribution/WebKit version in a bug report. Linux defaults to non-accelerated rendering for small VMs. |
| Project did not appear | Check you are using the same Linux user and `XDG_DATA_HOME`. Each user has separate storage. |
| Vault password forgotten | Password recovery is not implemented. Preserve an existing backup; project notes are separate from the encrypted vault. |

On a suitable GPU, `DRAGONTRIP_HARDWARE_ACCELERATION=1 dragontrip` enables the standard WebKit acceleration policy. This is optional, not a required launch setting.

Still stuck? [Open a bug report](https://github.com/coldvisixn/dragontrip/issues/new?template=bug_report.yml) with your version, distribution and reproduction steps. Remove assessment data, tokens and credentials from logs/screenshots.
