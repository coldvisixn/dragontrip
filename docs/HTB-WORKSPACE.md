# Local investigation and recovery

This checkout extends the existing local project model; it adds no customer fields or mandatory finding completeness checks. Notes, findings, tasks, paths and methodologies remain ordinary Knowledge records. Tool observations do not confirm vulnerabilities, access or stage completion.

## Follow an investigation

1. Create/open a project. In **Recon → Import results**, preview Nmap XML, Burp XML or Nuclei HTTP JSONL. For live recon, include explicit targets in **Recon → More… → Targets & scope**.
2. In **Research**, choose a host/service in the graph or an application/endpoint in Web applications. Imported observations retain their original source evidence.
3. Use **Create linked record** on an observation, object or scan result. Choose a note/hypothesis, draft finding or task. Existing records appear first; repeating creation opens the existing record of that type. A changed response is a new observation; an identical observation in another export reuses its links.
4. In **Notebook → Notes**, record a hypothesis. The linked-record control prepares a task with the hypothesis, object, observations, scans and attachments carried forward. Task statuses and the Result section preserve unsuccessful checks too. The editor offers small, editable hypothesis, service enumeration and unsuccessful-check templates.
5. Follow **Source observation**, **Source object**, **Source scan** or **Source hypothesis** back to the evidence. Observation links open that specific imported observation. Use **Show all observations** to return to the complete object history.
6. Navigate away and reopen Dragontrip. Each project restores its last page/tab, graph selection/query/type/viewport, web application/endpoint/filters, search/history filters, knowledge/task editor and draft, methodology text and workflow form/run selection. Opening a project from Projects resumes its latest project page. Deleted selections show an explanation and return to a usable screen.

The three project sections are **Research**, **Recon** and **Notebook**. Each exposes three frequent pages and a **More…** menu. Reports, scope, evidence, vault, methodologies, investigation paths, timeline and project search remain available there and in the command palette. Tool output is hidden while unused; the output button and running-task status remain accessible.

## Drafts, conflicts and recovery

Notes, findings, paths and tasks share a draft-aware editor. Draft text is written synchronously to browser storage and asynchronously to the local SQLite backend. The displayed status distinguishes a durable browser copy, acknowledged backend storage and memory-only text. A record is saved only by its explicit Save action. Closing an editor retains the draft.

A conflicting save presents both texts and modification times. You can save your text as a separate record, load the saved version while retaining your text, or merge manually in the normal editor. A subsequent concurrent change causes another conflict. Deleted records can be recovered as separate records. No finding description/remediation checklist is required.

**Recover earlier text** opens retained versions in the current editor or downloads their JSON. Loading a retained version also preserves the text it replaces. Saving/discarding closes the draft with a tombstone; delayed autosaves cannot recreate it. The retained recovery copy is included in project transfer. New-record saves carry an idempotency key so retrying a lost response does not create another record.

If both browser storage and the backend fail, the editor keeps the text in memory across page changes, shows a persistent workspace warning and requests confirmation on browser unload. Reopen the editor and use **Retry sync** or **Download draft** before closing the application. A completed upload after closing an editor stays in project Evidence and does not attach itself to another editor. If record saving succeeds but the list/project refresh fails, the message says the record was saved and offers a refresh retry.

Methodology selections/check notes are also stored in the workspace and use version-aware saves. Conflicts offer a separate methodology, saved version or manual merge. Original text is retained before switching versions. Methodology coverage remains an explicit user decision.

Draft recovery covers the research Knowledge editors and methodology notes. Custom graph-object editors now retain drafts too, including creation dialogs. Report composition retains its existing project-scoped recovery. Preferences and vault forms retain explicit-save behavior. Memory-only research text also prevents native window closure until the user chooses whether to keep working, download recovery JSON or close without saving.

## Run a saved sequence

Save/reopen a recon workflow, inspect **Preview workflow**, then **Create run**. The preview lists every selected target, profile/tool, ports, rate, timeout, diagnostic scripts and wordlist. A run freezes the ordered actions; saving it starts no network work.

After acknowledging the displayed targets/actions and any higher-traffic confirmation, choose **Run remaining sequence** or launch a single step. Automatic mode advances only after successful completion. It uses the existing bounded queue, adapter validation and cancellation. Scope and profile parameters are checked again before each next step; scope is also checked immediately before a queued process starts. Missing tools, changed parameters/scope, failed/cancelled/interrupted scans stop progression with a reason.

**Pause after current step** lets the current tool finish and prevents later submissions. Resume requires a fresh explicit action. **Stop sequence** cancels queued/running tools. **Retry failed step** requires explicit authorization and retains every previous attempt in **All attempts**; results record their run and step in scan options. A run retains up to 200 attempts; create a new run beyond that limit.

Automatic authorization exists only in the current backend process. Restarting or importing a running sequence marks it paused; no background sequence is reconstructed and no network action resumes automatically. Imported active scans remain interrupted as before. Recommendations explain their observed service basis and open a scan preview; they neither execute exploits nor confirm findings.

## Storage and portable projects

No physical database migration is needed: project-scoped workspace/recovery cells use the existing Configuration table; new provenance and sequence fields extend existing Knowledge JSON. Old content remains readable with defaults.

Exports now use `.dtproj` **version 5**. Import still accepts versions 1–4. Version 5 transfers workspace state, drafts/recovery text, source observations and sequence attempt history, remapping object, record, observation, scan, import and attachment references into the new project. Workflow authorization is never transferred. Older Dragontrip versions reject version 5; use a complete data-directory backup before upgrading.

Recovery metadata is plain project data, as are ordinary notes. The archive allows 2,000 workspace items and 8 MiB of recovery metadata within its existing 32 MiB manifest/128 MiB expanded budgets; each workspace item is bounded to 200,000 JSON characters/bytes at API/archive validation. These limits do not change evidence/file limits.

## Validation

```bash
npm run lint
npm run format:check
.venv/bin/python -m pytest -q
npm test
npm run build
# With Vite running on port 1420 and system Chromium:
node scripts/investigation-smoke.cjs
```

The browser acceptance uses an isolated data directory and real local API/import/archive code. It covers new project → Burp import → endpoint observation → linked note → task with an unsuccessful result → navigation → backend restart with browser workspace cache removed → recovered draft → conflicting save/manual merge → successful save with failed refresh → separate-copy recovery after record deletion → compact light/dark 1000×650 views and keyboard Back/Forward. Screenshots are written to `/tmp/dragontrip-investigation-screenshots`.

Backend regression tests cover repeated-source authoring, provenance/archive remapping, closed-draft stale writes, version conflicts/idempotent retries, project isolation, automatic sequence progression, pause/cancel/retry/history, confirmation preflight, scope changes and restart interruption. Frontend tests cover memory-only recovery, delayed hydration, closed drafts, late uploads and conflict handling. Native Tauri/WebKit packaging and VM acceptance remain separate from browser validation.
