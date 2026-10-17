# Presentation assets

The presentation uses the existing angular Dragontrip mark from [the application icon](../../src-tauri/icon.svg), violet accents and a continuous research path. The central line is **Follow the evidence. Keep the thread.**

- [`banner.svg`](banner.svg): self-contained 1280 × 340 README cover, with an opaque background for both GitHub themes.
- [`social-preview.png`](social-preview.png): ready-to-upload 1280 × 640 social image, with editable [`social-preview.svg`](social-preview.svg).
- [`github-metadata.json`](github-metadata.json): English About description and relevant topics. “Nuclei” refers to result imports; it does not imply a live runner.
- `badges/`: self-contained release, platform and license badges; update the release badge with the README download version. The CI badge links to the live GitHub workflow.
- The screenshot PNGs and [`investigation.mp4`](investigation.mp4): actual application captures; see [the gallery](../SHOWCASE.md).

## Capture provenance and reproduction

Captured from 0.9.0 application code at `ba70fcb` (application code unchanged from the published 0.9.0 tag), with React/Vite in Chromium and the real local Python backend. The only desktop substitute is the test-only connection bridge that supplies the loopback API connection. Records, imports, links, drafts and navigation use normal application code; API responses and displayed text are not mocked. This is a browser demonstration, not installed-package validation.

[`fixtures/portal-nmap.xml`](fixtures/portal-nmap.xml) and [`fixtures/portal-burp.xml`](fixtures/portal-burp.xml) are manually authored demonstration inputs. They contain only `192.0.2.10` and `portal.example.test`, no credentials or real targets. No tools or network requests to targets are made. The capture script checks that scan history is empty and that the task links to its hypothesis. It creates a temporary `XDG_DATA_HOME` and removes it on exit, leaving user projects alone.

From the repository root, after [development setup](../DEVELOPMENT.md):

```bash
npm run dev
# In another terminal:
node node_modules/playwright-core/cli.js install ffmpeg
node docs/media/capture-demo.cjs
node docs/media/render-brand.cjs
```

The capture writes `investigation.webm` as an intermediate. Convert it with system FFmpeg, then remove the intermediate:

```bash
ffmpeg -y -i docs/media/investigation.webm -an \
  -c:v libx264 -crf 27 -preset slow -pix_fmt yuv420p -movflags +faststart \
  docs/media/investigation.mp4
rm docs/media/investigation.webm
```

For capture experiments, set `DRAGONTRIP_MEDIA_OUTPUT` to a separate directory. `CHROMIUM_PATH` selects a system Chromium (default `/usr/bin/chromium`). The brand renderer reads the SVG and renders it at its native dimensions; it does not change screenshots. These assets contain no generated or recreated application UI.

## GitHub repository settings

At preparation time, the repository had no About description or topics. The connected GitHub tools expose repository content writes, but no About/topic update operation; the cloud shell's GitHub API access is blocked by its network policy. Therefore these settings must be applied by a maintainer with repository administration access. Git content can still be pushed normally. Do not treat a committed metadata file as applied GitHub settings.

1. Open [the repository](https://github.com/coldvisixn/dragontrip), click the gear beside **About**, paste the `description` from [`github-metadata.json`](github-metadata.json), add its `topics`, and save.
2. Download [`social-preview.png`](social-preview.png), open [Settings → General](https://github.com/coldvisixn/dragontrip/settings), scroll to **Social preview**, choose **Edit → Upload an image**, and select that PNG. GitHub has no supported social-preview upload operation in the connected tools.

For About and topics, an authenticated GitHub CLI in a network that permits `api.github.com` can apply the same metadata from the repository root:

```bash
python3 - <<'PY'
import json
import subprocess
from pathlib import Path
metadata = json.loads(Path('docs/media/github-metadata.json').read_text())
args = ['gh', 'repo', 'edit', 'coldvisixn/dragontrip', '--description', metadata['description']]
for topic in metadata['topics']:
    args.extend(['--add-topic', topic])
subprocess.run(args, check=True)
PY
```
