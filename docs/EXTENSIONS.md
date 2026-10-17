# Extending Dragontrip

Extensions are reviewed source changes. This release does not load arbitrary plugins or execute user-supplied command templates.

## Recon adapters

1. Add a tool identifier and default profile in `backend/dragontrip/recon.py`.
2. Extend profile validation with explicit bounds for ports/rate/timeouts and supported flags. Keep targets, argv and paths as separate values. Never concatenate shell commands or accept arbitrary NSE script names.
3. Implement version discovery and structured argument construction. Respect configured executable locations, noninteractive stdin, frozen-library cleanup, per-tool private configuration, disabled update checks and explicit redirect policy.
4. Parse bounded source files into structured results. Validate result origins against the approved target; preserve raw evidence and observation timestamps. Parsers must never create discoveries from empty or failed output.
5. Feed structured data through graph ingestion with stable entity identifiers. Preserve manual objects and their coordinates. Keep observations separate from user-authored hypotheses.
6. Update recommendations and the scan form. Any new scope, traffic or diagnostic behavior needs an explicit execution confirmation; recommendations never launch tasks themselves.
7. Add parser, process-lifecycle and real-tool tests against owned loopback servers. Extend `scripts/recon-smoke.py` and native acceptance when the tool changes the UI workflow.

`TaskManager` owns FIFO scheduling, concurrency, cancellation, output caps, process groups, artifact cleanup and restart recovery. New adapters must use it instead of launching unmanaged children. Treat its current limits as part of the API contract.

## Knowledge and evidence

Knowledge records use typed `Content` fields in `workspace.py`. Validate all node/scan/attachment references against the project. Add schema migrations for durable storage changes. Keep old record defaults and missing-reference handling compatible.

Markdown uses `react-markdown` + GFM with raw HTML disabled. Remote images are not fetched; uploaded raster evidence is authenticated, size checked and decoded for validation. HTTP(S) links open only after user activation through native IPC. Do not add `dangerouslySetInnerHTML` or a raw-HTML plugin.

Evidence attachments are immutable originals with SHA-256 metadata. Extend supported types in `evidence.py` only with a defined validation and rendering policy. Use generated IDs for disk paths, not user filenames. Do not render uploaded HTML/SVG or untrusted PDFs inside the application. Deletion requires unlinking knowledge references.

Vault fields are encrypted together with AES-GCM, with record and project identity as authenticated data. Keep vault contents out of project polling, search, events, console output and ordinary exports. Credential-bearing archives require explicit opt-in, an unlocked vault and independent password encryption. Import re-encrypts them under the destination vault key.

## Frontend modules and graph

Add pages to navigation and the command palette, with a project-required empty state and keyboard access. Keep graph and knowledge modules lazy loaded. Settings come from the local API and persist in SQLite; localStorage is an appearance cache, not a place for credentials.

Graph overview requests use `?compact=true`; the selected-object endpoint supplies full evidence. Use maps for relation/object lookups. Preserve cached node data identity during selection and polling. Do not reset the user's viewport whenever node counts change. Large graphs automatically reduce card detail, suppress excessive edge labels and omit the SVG minimap above 500 objects. Explicit full/compact settings override automatic card detail.

## Project archive contract

`.dtproj` is a ZIP with `manifest.json`, version `3` (versions `1` and `2` remain readable), format `dragontrip-project`. The manifest contains project metadata, objects, edges, historical scans, knowledge, attachment metadata, events, viewport, credential inclusion flag, and a size/SHA-256 map for every additional entry. Version 2 adds scope rules, import runs and source observations, with all node/finding/run/attachment references remapped. Old consumers reject version 2. Imported finding and relation suffixes remain stable so later imports deduplicate after transfer.

Only `artifacts/<scan-id>.xml|json`, `attachments/<id>` and optional encrypted `vault.json` entries are allowed. No archive path is extracted directly. Import validates counts, byte budgets, identities, coordinates, references, image types and checksums, writes a fresh project, remaps identities and cleans staged files on transaction failure. Imported active scans become interrupted and never enter the execution queue. Observed node IDs retain their suffix under the new project ID so rescans deduplicate them.

Preserve archive compatibility or add a new version with explicit migration. Current portability limits: 128 MiB expanded archive, 32 MiB manifest, 10,000 objects, 50,000 edges, 5,000 scans/knowledge records, 500 attachments, 10 MiB per attachment. Completed scans whose source artifact was removed outside the app remain historical records with missing evidence; attachments with missing or changed originals prevent export.

## Verification and release

Use `npm test`, `npm run build`, and `DRAGONTRIP_LIVE_TEST=1 .venv/bin/python -m pytest -q`. Browser acceptance is `scripts/workspace-smoke.cjs`; baseline scan/graph acceptance is `scripts/browser-smoke.cjs`. Run these against built frontend assets and the frozen sidecar as well as development source.

`scripts/profile-graph.cjs` creates only explicitly manual fixtures in isolated storage, exercises a persisted drag at 100/300/1,000 objects and reports graph loading, DOM count, payload size, heap and frame intervals. Native acceptance uses actual Tauri/WebKit, the installed package and Xvfb. `DRAGONTRIP_VALIDATION_DIR` selects an isolated output directory. Rebuild Python resources after backend changes before packaging. See `PHASE4.md` for measured results and remaining platform checks.

## Offline import contracts (0.6.0)

`import_formats.py` parses bounded UTF-8 sources without resolving names or launching tools. `scope.py` handles explicit membership and URL origins. `entities.py` shares stable identity/upsert behavior with manual web objects and existing recon. `imports.py` implements read-only preview, stale-preview validation, transactional apply and observation history. Add formats only with real structure fixtures, entity/link tests, source hashes, repeat-import and archive-roundtrip tests. No absent finding may be resolved by an incomplete export. [User-facing limits](IMPORTS.md).

Version 3 adds checklist/workflow/workflow_run knowledge records. Preserve nested service_node/workflow_id/scan_ids remapping. Guided launches delegate to the existing scan handler, with explicit scope required and double-click serialization; do not infer methodology completion from tool results.

## Archive v4 and drafts (0.8.0)

New exports use archive v4 and preserve append-only `content.retests` (finding records only). Imports read v1–v4; retests in a declared pre-v4 archive are rejected. Normal record editing must retain existing retests; append through `/projects/{pid}/knowledge/{kid}/retests` with the current update revision. Device-local drafts use `/projects/{pid}/drafts/{key}` and the existing configuration table; they are not project archive content. See [delivery contract](DELIVERY.md).

## Archive v5 and workspace (0.9.0)

Research workspace cells use `/projects/{pid}/workspace` and `/projects/{pid}/workspace/{key}` with numeric revision, `value.data` and a permanent `closed` tombstone for each draft ID. v5 includes these cells and remaps embedded project references on import. Imports still read v1–v4. Legacy 0.8 note/finding/path drafts migrate at startup without deleting old rows; report composition stays on the legacy draft API and is not transferred. [Current recovery contract](HTB-WORKSPACE.md).
