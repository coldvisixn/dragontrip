# Dragontrip 0.8.0: from evidence to handoff

The MVP is a local workspace for a human-led assessment: **import or recon → linked observations and findings → evidence → reviewed deliverable**. It keeps the existing graph, scope, methodologies, guided workflows, tasks and vault.

## First project

Create a project. Project overview offers **Import results**, **Define target scope** and **Start live recon**. Empty dashboards omit unused metrics. Project details lets you rename the project and edit its description without recreating records.

Import supported Nmap XML, Burp saved-items/issue XML or HTTP Nuclei JSONL, review the preview and then apply it. Imports do not send traffic. [Formats, identity and scope rules](IMPORTS.md) still apply. Live adapters support individual IPv4 targets/origins; offline domain/CIDR/IPv6 scope is not live scanning support.

**Create fictional demo** on Dashboard or Projects explicitly creates a separate `[DEMO]` project with reserved documentation addresses, a draft finding, a note and a task. It creates no scope authorization and runs no tools. New real projects stay empty.

## Recover your work

Note, finding and manual investigation-plan editors keep a per-project, per-record draft. To resume a new record, choose **New note/finding/path** again. For an existing record, open the same record and choose **Edit**. Closing the editor preserves its draft; **Discard draft** clears it while retaining the saved record and uploaded files.

A synchronous WebView copy covers navigation while an ordered, debounced API sync stores the draft in SQLite. A cleared draft has a revision tombstone so a delayed old autosave cannot recreate it. Reopening waits for pending writes before loading. Editing a saved record carries its original update revision; a concurrent change fails explicitly rather than overwriting newer content. This is one recoverable draft per record, not a collaborative version-history system. If another editor changed the saved record, copy any draft text you want to keep, reload the page, discard the stale recovered draft, then edit the latest saved record.

Draft status identifies saving, recovery and sync failure. If both local storage and SQLite sync fail, keep the application open; the editor retains its in-memory copy and guards page unload. Retry draft recovery if the initial API read fails. Drafts are unencrypted, are excluded from reports and `.dtproj`, and should not contain vault secrets. Successful record save clears its draft. Reports keep their composition for reuse instead of clearing it after export.

Canonical drafts live under `draft:<project>:<editor>` in the existing SQLite configuration table. No physical schema migration is added. A WebView recovery copy is separate from the data-directory backup; wait for **Draft saved on this device** before backing up. [Backups](DATA.md).

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

Native PDF/DOCX export is not implemented. Use browser print for HTML. Cloud collaboration, unattended workflow advancement, automatic exploitation, finding correlation and custom methodology definitions remain outside this increment.

## Portability and verification

New `.dtproj` exports use **v4** for retained retests; imports read **v1–v4**. Older apps reject v4. Drafts remain on the device. Back up before upgrading and do not edit upgraded data with an older binary.

[Build and exact verification](BUILD-0.8.0.md) · [Browser acceptance](../scripts/delivery-smoke.cjs) · [Installed Tauri/WebKit acceptance](../scripts/native-delivery-smoke.py).
