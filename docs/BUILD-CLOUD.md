# Reproduce the cloud build

This recipe records the managed-container setup used during 0.4.0 development. Its named container, users and downloaded helper tools are session-specific; check that they exist before reusing the commands. For the current toolchain and standard build, start with [development setup](DEVELOPMENT.md). [0.9.1 verification](BUILD-0.9.1.md) records the published installer and current Ubuntu/Kali checks.

In that setup, Python/frontend checks ran on the host; GTK/WebKit and packaging checks ran in an isolated Debian container because the host had no desktop development libraries. Use the existing checkout unless a separate worktree is needed for your task.

## Host

```bash
cd /workspace/dragontrip
bash scripts/setup.sh
export PATH="$PWD/.build-tools/bin:$PWD/.build-tools/go-bin:$HOME/.cargo/bin:$PATH"
DRAGONTRIP_LIVE_TEST=1 .venv/bin/python -m pytest -q
npm test
npm run build
.venv/bin/python scripts/bundle-backend.py
.venv/bin/python scripts/smoke-packaged.py
```

The original cloud installation placed a rootless Nmap wrapper under `.build-tools/bin`, backed by packages downloaded from the signed Debian repository. ProjectDiscovery httpx 1.7.1 under `.build-tools/go-bin` came from its official GitHub release and was checked against that release's SHA-256 file. These tools are optional session setup artifacts, not shipped inside Dragontrip or created by `setup.sh`.

Rust 1.99.0 is pinned by `rust-toolchain.toml`; use rustup with its normal checksum/TLS verification. Do not replace the version or disable verification to work around installation problems.

For browser checks, start `npm run dev` or a Vite production preview on port 1420. Run `node scripts/workspace-smoke.cjs` and `node scripts/profile-graph.cjs`. `DRAGONTRIP_TEST_BACKEND=backend/dist/dragontrip-backend/dragontrip-backend` selects the frozen backend for functional acceptance. Scripts use isolated data and never require a user project or credential.

## Native container

The original container was named `dragontrip-build-env`, based on `node:22-trixie-slim`. It bound the checkout, host rustup/cargo directories and combined CA bundle. Docker's session proxy defaults were retained. Verify the local daemon and current proxy/CA configuration before reusing or recreating it. Do not dump Docker credentials or disable TLS verification.

The container needs:

```text
build-essential pkg-config libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev
patchelf python3 python3-venv python3-dev libssl-dev
nmap whatweb ffuf xvfb xauth dbus-x11 webkit2gtk-driver xdotool scrot
xfwm4 wmctrl desktop-file-utils libgtk-3-bin python3-pil x11-utils at-spi2-core
```

In the managed environment, mount `/etc/ssl/certs/ca-certificates.crt` read-only at `/run/proxy-ca.pem`, set `SSL_CERT_FILE` and `NODE_EXTRA_CA_CERTS` to that path, and configure apt's `Acquire::https::CaInfo` for any HTTPS package operation. The public CA bundle need not be copied into an image. Preserve the platform's Docker proxy defaults and use normal signed apt repositories.

The host's Python environment is not a container interpreter. Build the sidecar on the host first, then reuse those resources and the tested frontend:

```bash
docker exec -u 1000:1000 dragontrip-build-env bash -lc '
  export PATH=/home/agent/.cargo/bin:$PATH
  CARGO_BUILD_JOBS=3 node node_modules/@tauri-apps/cli/tauri.js build --bundles deb \
    --config '\''{"build":{"beforeBuildCommand":""}}'\''
  python3 scripts/normalize-bundle.py
'
```

This override skips only the already-executed frontend build. It does not change tracked Tauri configuration or bypass checks. On a normal Kali development machine with an activated project virtualenv, `npm run desktop:build` performs all stages directly.

Install the produced package inside the test container with `dpkg -i`. Reinstall even when the version string is unchanged when validating a freshly built file. Compare installed executable/sidecar digests to an extracted copy of that exact `.deb`.

```bash
package_version="$(node -p "require('./package.json').version")"
docker exec dragontrip-build-env dpkg -i \
  "/workspace/dragontrip/src-tauri/target/release/bundle/deb/dragontrip_${package_version}_amd64.deb"
docker exec -u 1000:1000 \
  -e HOME=/tmp/dragontrip-native-home \
  -e WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 \
  -e DRAGONTRIP_VALIDATION_DIR=/tmp/dragontrip-native-results \
  dragontrip-build-env bash -lc '
    export PATH=/home/agent/.cargo/bin:/workspace/dragontrip/.build-tools/go-bin:$PATH
    xvfb-run -a dbus-run-session -- bash scripts/installed-smoke.sh
  '
```

Create the temporary HOME directory owned by UID 1000 first. Install `tauri-driver` with the pinned cargo toolchain and normal `--locked` dependency resolution. The WebKit sandbox override is exclusively for isolated nested-container automation; it is not an application launch requirement or a production configuration change.

`python3 scripts/recon-smoke.py` inside the container exercises all four actual tools against owned loopback servers. Run it separately from native acceptance: both use port 8080. Native tests use real Tauri IPC and WebKit; the browser connection bridge is never shipped in the application.

For ordinary application use on Kali, install the package and system tools as described in [INSTALL-KALI.md](INSTALL-KALI.md). Docker and development toolchains are not application dependencies.
