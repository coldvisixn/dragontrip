# Publishing a release

User-facing installers belong in [GitHub Releases](https://github.com/coldvisixn/dragontrip/releases). Actions artifacts are temporary verification/development output. Do not commit `.deb` files or user data to Git.

## Prepare

1. Update the version consistently in `package.json`, the root entries of `package-lock.json`, `src-tauri/Cargo.toml`, the `dragontrip` entry in `src-tauri/Cargo.lock` and `src-tauri/tauri.conf.json`.
2. Update `CHANGELOG.md`, installation/download filenames and `docs/releases/v<version>.md`.
3. Verify relevant checks, review the source and push the intended release commit. Avoid tagging unrelated/unreviewed changes.
4. Confirm the tag does not already exist. Published assets are immutable in this workflow; use a new version for corrections.

## Tag and publish

From the intended release commit, for example:

```bash
git tag -a v0.7.1 -m "Dragontrip 0.7.1"
git push origin v0.7.1
```

[The release workflow](../.github/workflows/release.yml) checks the tag against version metadata, builds the Linux `amd64` package on Ubuntu 24.04, runs backend/UI/frozen-backend checks and native Tauri/WebKit planning acceptance, and verifies package metadata/checksums. Only the publish job receives `contents: write`.

On success it creates a release containing exactly the installer and matching `.deb.sha256`, using the per-version release notes. Versions starting with `0.` or containing a prerelease suffix are marked **Pre-release**. This makes the explicit version link the reliable download entry point; do not assume GitHub's `/releases/latest` includes preview releases.

The workflow uses the repository's short-lived `GITHUB_TOKEN`; no personal access token or custom release secret is required. It does not overwrite an existing release. If the build fails before publication, correct/review the source and release with an appropriate new tag rather than moving a published tag.

## Verify the download

Check the release workflow result and the public release page. Download both assets, verify the checksum, install the exact `.deb` in the supported environment and verify launcher/backend/UI behavior. Update platform claims only with corresponding evidence. The CI-built package can differ byte-for-byte from a local Debian build; publish its own checksum.

Kali Rolling CI and real VirtualBox hardware acceptance remain separate from the release's Ubuntu WebKit smoke. Do not label a release as verified on platforms that were not tested.

## Repository presentation

Suggested **About** description:

> From recon to report: a local pentest workspace connecting Nmap, Burp and Nuclei results, infrastructure, findings and evidence. Open-source MVP for Linux.

Suggested topics: `kali-linux`, `linux`, `security-tools`, `reconnaissance`, `pentesting`, `tauri`, `react`, `fastapi`, `sqlite`, `investigation`.

Keep the homepage/download link pointed at Releases. GitHub's repository About/topics are repository settings; committing this guide does not automatically apply those settings.
