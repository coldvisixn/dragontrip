# Dragontrip 0.9.0: local research and reviewed exports

The MVP is a local workspace for a human-led assessment: **import or recon → linked observations and findings → evidence → reviewed deliverable**. It keeps the existing graph, scope, methodologies, guided workflows, tasks and vault.

## First project

Create a project. Project overview offers **Import results**, **Define target scope** and **Start live recon**. Empty dashboards omit unused metrics. Project details lets you rename the project and edit its description without recreating records.

Import supported Nmap XML, Burp saved-items/issue XML or HTTP Nuclei JSONL, review the preview and then apply it. Imports do not send traffic. [Formats, identity and scope rules](IMPORTS.md) still apply. Live adapters support individual IPv4 targets/origins; offline domain/CIDR/IPv6 scope is not live scanning support.

**Create fictional demo** on Dashboard or Projects explicitly creates a separate `[DEMO]` project with reserved documentation addresses, a draft finding, a note and a task. It creates no scope authorization and runs no tools. New real projects stay empty.

## Recover your work

Note, finding, task, object and methodology editors keep project-scoped drafts. Navigation and restart restore the last page, selection, filters and editor. Closing an editor retains its draft; discarding retains a recovery copy. Replaced text is recoverable from the draft controls.

A synchronous WebView copy covers navigation while ordered API sync stores drafts in SQLite. Closed drafts have tombstones so delayed autosaves cannot recreate them. Conflicts show both versions and timestamps: save your version as a separate record, open the saved version, or merge manually. Text is retained before replacement. A successful record save is distinct from a failed interface refresh, and retries are idempotent.

Draft status distinguishes browser-only, SQLite and memory-only copies. If both stores fail, keep the application open, retry or download a recovery JSON. Browser unload and native window close are guarded while research text exists only in memory. A sudden process or OS failure can still lose memory-only work. Drafts and recovery copies are unencrypted; they are excluded from reports. Research workspace drafts are included in v5 project transfers; report compositions remain local.

0.8.0 knowledge drafts migrate without deleting their old copies. Workspace data lives under `workspace:<project>:<key>` in the existing SQLite configuration table. Report composition continues to use `draft:<project>:report`. Wait for **Draft saved on this device** before taking a data-directory backup. [Backups](DATA.md) · [Research and recovery](HTB-WORKSPACE.md).

## Build a finding

**Use finding template** inserts blank observation, reproduction, expected/actual behavior, impact and evidence headings. It creates no vulnerability claim or severity score. Confirming a finding remains a manual decision.

Evidence supports ordinary upload, screenshot paste and file drop. The upload picker preserves links changed while the upload is pending. Save is disabled while a file uploads; leaving the editor retains the file in the project without mutating a later editor. The existing file-type checks, 10 MiB/file and project attachment limits still apply.

**Record a retest** appends a timestamp, result and required review note:

- **Fixed** resolves the finding.
- **Still present** marks it confirmed.
- **Inconclusive** retains the current status.

Retests are manual review records, not automatic validation. Up to 50 are retained per finding. Normal editing cannot rewrite their history; findings with retests cannot be deleted, but can be dismissed. Retests are included in the finding's report content when its status matches the chosen filter.

## Review and export

The **Delivery preset** starts with confirmed findings and inventory, excluding notes, plans, task work and scan history. The **Working preset** includes active findings and working sections. You can adjust the filters and sections. A preset preserves your title and summary. These filters help select content; they do not certify finding quality or remove sensitive authored text.

Generate a preview and inspect it before export. Changing options invalidates the UI preview. The UI sends the preview fingerprint with export; changed selected report content or evidence triggers a request for a fresh preview. Legacy API Markdown exports without a fingerprint still regenerate current content.

- **Markdown:** text plus evidence filenames/hashes; attachment bytes are excluded.
- **Standalone HTML:** readable, printable document with no scripts, external image requests or fonts. Raw Markdown HTML is escaped; remote/unselected Markdown images are omitted. Only explicitly selected files are embedded; image attachments get inline previews and all selected files have download links.
- **ZIP:** `report.html`, `report.md`, `README.txt` and selected original files under generated `evidence/<id>.<type>` paths. The Markdown copy links to those files; HTML embeds the same chosen bytes.

Select at most 100 evidence files / 32 MiB. Ownership, size and SHA-256 are checked before inclusion. Evidence is never selected automatically, including imported request/response sources. Review checked files for credentials or other sensitive data. Vault records, editor drafts and raw scan buffers are excluded, but anything deliberately written into authored content remains there. Downloads exports are private and do not overwrite existing files.

Native PDF/DOCX export is not implemented. Use browser print for HTML. Cloud collaboration, automatic exploitation, finding correlation and custom methodology definitions remain outside this increment. Recon sequences advance only through explicitly previewed, selected actions; restart pauses them.

## Portability and verification

New `.dtproj` exports use **v5** for research workspace recovery and retain append-only retests; imports read **v1–v5**. Older apps reject v5. Transfers include plain research drafts and retained recovery text; review them before sharing. Back up before upgrading and do not edit upgraded data with an older binary.

[Build and exact verification](BUILD-0.9.0.md) · [Browser acceptance](../scripts/delivery-smoke.cjs) · [Installed Tauri/WebKit acceptance](../scripts/native-delivery-smoke.py).
