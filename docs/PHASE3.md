# Phase 3 — Investigation workspace

**Historical implementation record.** For current knowledge, vault and transfer behavior, use the [user guide](USAGE.md), [data guide](DATA.md) and [capabilities](CAPABILITIES.md).

## Delivery order

1. Data and behavior
   - Preserve observed scan evidence; store manual content separately.
   - Custom objects: editable name, category, description, investigation status and tags.
   - Project knowledge: notes, findings with severity/remediation, ordered manual attack paths.
   - Validate every object/scan reference against its project; retain deleted-object references as explicitly missing.
   - Encrypt credential contents with a password-derived key; never include them in project polling or events.
2. Interface
   - Explicit dark native controls, including open select options.
   - Shared graph cards with category, content preview, status and tags; Inspector editor.
   - Searchable knowledge lists and explicit save/cancel editors with object/evidence links.
   - Vault setup/unlock, hidden secrets, explicit reveal, lock and idle expiry.
3. Integration and acceptance
   - Upgrade existing SQLite databases without changing scan history or positions.
   - Verify CRUD, cross-project isolation, restart persistence, encryption and lock behavior.
   - Build frontend and frozen backend; exercise the real API/UI in Chromium under light/dark system preferences.

## Scope

Attack paths document ordered hypotheses and investigation steps. They do not execute tools. Findings and notes are authored by the user, with explicit links to existing objects and source scans. Scan evidence remains read-only. Ordinary notes, findings and custom-object descriptions are stored as plain project data; sensitive values belong in Vault.

Vault uses AES-256-GCM with independent random nonces and record/project identity as authenticated data. Scrypt (N=32768, r=8, p=1) derives the key from a master password and random salt. Only ciphertext, salt and an encrypted verification record persist. Unlock lasts at most ten minutes without a credential operation; explicit lock and backend restart discard the in-memory key. Forgetting the password cannot be recovered. Vault protects stored contents, not a compromised running computer. Password changes/recovery and credential use by tools are outside this phase.

## Use

- Click a custom object → **Edit object** to change its category, description, status and tags. The card previews its content. Old custom objects acquire defaults when edited; coordinates and existing links stay intact.
- Click a manual edge to edit its relationship label. Observed objects and evidence edges remain read-only.
- From Inspector choose **Add linked note** or **Add linked finding**. Knowledge pages support creation, editing, deletion, text search, status filtering and navigation back to objects or scan output. Findings include severity and remediation.
- In **Attack Paths**, add steps referencing existing objects, describe the action/rationale, reorder steps and track planned/validated/blocked status. Paths are authored plans, with no execution or automatic validation.
- Source-scan selection includes recent project scans. To reference an older scan, copy its ID from history/Inspector and enter it in **Link historical scan by ID**. The API verifies ownership. Deleted objects appear explicitly as missing references, which can be retained or removed during editing.
- **Credentials Vault** creates one password-protected vault for the local installation. Entries are isolated by project. Title, username, secret, private notes and object links are encrypted together. Secret values are omitted from lists and retrieved only by an explicit reveal action. Empty replacement-secret input retains the existing value. Closing/restarting the backend locks the vault; idle key expiry is enforced even when its page is closed.

## Verification

```bash
.venv/bin/python -m pytest -q
npm test
npm run build
.venv/bin/python scripts/bundle-backend.py
.venv/bin/python scripts/smoke-packaged.py
# Start npm run dev separately, then:
CHROMIUM_PATH=/usr/bin/chromium node scripts/workspace-smoke.cjs
DRAGONTRIP_TEST_BACKEND=backend/dist/dragontrip-backend/dragontrip-backend \
  CHROMIUM_PATH=/usr/bin/chromium node scripts/workspace-smoke.cjs
```

The browser scenario uses temporary project storage and bridges only Tauri's connection delivery. It checks custom-object editing, linked notes, findings, step ordering, vault create/edit/reveal/hide/lock/unlock, backend restart and select colors under light/dark system preferences. Screenshots contain test data; secrets are hidden. `SCREENSHOT_DIR` selects their output directory. The CI browser scenario uses the frozen backend after desktop packaging.

Initial Phase 3 cloud validation: 48 backend tests including a live owned-loopback Nmap scan; 11 frontend tests; TypeScript/Vite production build; PyInstaller sidecar build and HTTP/restart smoke; Phase 3 browser acceptance against Python and frozen backends, including the production frontend bundle; existing real Nmap/graph/manual-edge browser acceptance. The migration test upgrades an existing Phase 2 database and retains legacy object coordinates. Encryption tests cover ciphertext tampering, record-identity binding, wrong passwords, cross-project isolation and idle-key purge. Current expanded acceptance results are recorded in [Phase 4](PHASE4.md).

The initial Phase 3 snapshot was validated in the browser and frozen backend. Native installed-package verification is now included in [Phase 4](PHASE4.md), including real WebKit Markdown, uploads/previews, vault and encrypted project transfer. Historical Phase 2 binaries do not include these changes.

Screenshots from the actual production-frontend/frozen-backend browser run: [custom object](screenshots/phase3-node.png), [finding](screenshots/phase3-findings.png), [manual path](screenshots/phase3-path.png), [vault with hidden secret](screenshots/phase3-vault.png). They show isolated test data, not a native WebKit run.
