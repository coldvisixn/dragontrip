# Data, privacy and backups

## Storage

Dragontrip stores its application data in:

```text
$XDG_DATA_HOME/dragontrip/
# default: ~/.local/share/dragontrip/
```

The directory contains SQLite project data and local scan artifacts/attachments. Keep the complete directory together. Each Linux user has separate storage; changing `XDG_DATA_HOME` selects a different installation data location.

The desktop starts a loopback-only backend with a fresh per-launch token delivered through Tauri IPC. The application does not require a hosted Dragontrip account or cloud database. Recon adapters still make network requests to approved targets; installing/updating system tools is separate from local project storage.

## What is encrypted

Vault contents are encrypted with AES-GCM using a key derived from the master password with Scrypt. Titles, usernames, secrets, private notes and object references are encrypted together. Unlock keys live in memory and are discarded on lock, idle expiry or backend restart. Password recovery/change is not currently implemented.

Ordinary notes, findings, editor drafts, report compositions, tasks, evidence, scan output and normal reports are plain project data. Vault encryption does not encrypt the whole project or protect a compromised running machine. Keep sensitive values in the vault rather than ordinary notes. See [the security policy](../SECURITY.md) for reporting implementation vulnerabilities.

## Back up the installation

1. Close Dragontrip and wait for its backend to stop.
2. Copy the complete data directory to your backup location using your normal backup tool.
3. Protect the backup appropriately: it includes unencrypted assessment data alongside encrypted vault records.
4. Restore the whole directory with the application closed and preserve its private ownership/permissions.

Do not copy only the main SQLite file while the application is running: SQLite uses WAL files and evidence lives outside the database. Do not merge two database directories manually.

Back up before upgrades. Migrations run at launch; older binaries may not understand an upgraded database. Rollback requires the corresponding pre-upgrade backup.

## Project archives

`.dtproj` archives transfer a project with graph, knowledge, tasks, history and evidence. Import creates a separate project and remaps references. Active imported scans become interrupted and never resume automatically. Archive checksums detect changed evidence.

Credentials are excluded by default. Including them requires an unlocked vault, explicit opt-in and an independent archive password. The credential payload is encrypted; the rest of the archive is not. Import re-encrypts included credentials under the unlocked destination vault.

Task records added in 0.5.0 require the updated importer. Earlier archives remain supported by 0.5.0. Current limits include a 128 MiB expanded archive, a 32 MiB manifest, 10,000 objects, 50,000 edges, 5,000 scans/knowledge records, 500 attachments and 10 MiB per attachment. [Archive extension contract](EXTENSIONS.md#project-archive-contract) documents validation.

0.6.0 adds scope, import runs and immutable source observations through additive migration 0005. New archives use format version 2 and include those records and original sources; version 1 remains readable. Older application versions reject version 2. Imported-source attachments are retained by history and cannot be deleted through ordinary attachment cleanup. [Import limits and provenance](IMPORTS.md).

0.7.0 adds methodology/workflow Knowledge records and archive version 3, including run scan IDs and action references. There is no additional physical database migration. Versions 1/2 remain readable. [Methodology/workflow portability and limits](METHODOLOGIES.md).

## Recoverable drafts (0.8.0)

Note/finding/plan drafts and report composition sync into the existing SQLite configuration table, with an immediate unencrypted WebView recovery copy. Wait for successful draft sync before taking the data-directory backup. Drafts are excluded from project archives and reports; save records before transferring a project. Discard clears draft content while retaining a revision tombstone to reject delayed autosaves. [Recovery behavior and limits](DELIVERY.md#recover-your-work).

0.8.0 exports archive format v4 for append-only finding retests and reads v1/v2/v3. Older apps reject v4. A finding with retests retains its history and can be dismissed instead of deleted. No new physical database migration is needed for this increment.

## Reports and evidence retention

Markdown reports omit vault records, editor drafts, raw scan output and attachment bytes. HTML and ZIP exports include only explicitly checked attachment files, with ownership and integrity verification (100 files / 32 MiB). They can still include authored sensitive text and evidence filenames. Review the preview before sharing. Downloads exports are private and do not overwrite existing files.

Terminal history keeps the last 64 KiB per scan, not a full console transcript. Successful XML/JSON scan artifacts are retained; failed/cancelled partial artifacts are removed. Evidence retention is manual. Attachment deletion requires removing its knowledge references first. Do not delete files behind the application unless you accept missing-evidence errors.

## Uninstall

`sudo apt remove dragontrip` removes the application and retains user data. Archive or back up your work before manually removing a data directory. Uninstalling the application does not uninstall separately installed recon tools.
