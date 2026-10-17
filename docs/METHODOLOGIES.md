# Methodologies and approved recon workflows (0.9.0)

Methodologies record explicit review decisions; saved recon sequences run selected checks within the existing adapter and scope limits. A crawler, automatic finding correlation and live-domain scanning remain outside this release.

## Methodologies

Open **Methodologies**, select Web application review or Network service review, choose an existing project object and add it. Every check starts **Not tested**. Record an explicit decision per check: **Not tested**, **In progress**, **Tested**, **Not applicable**. Add review notes, source scans and attachments, then **Save methodology**. The summary counts distinguish all four states; “not applicable” is not counted as tested. Reapplying a template to the same application/service retains its existing decisions. Scans and imported findings never update coverage automatically.

The web template covers surface mapping, authentication/session handling, access control, input/output handling, headers/cookies/transport, business logic and evidence/follow-up. The service template covers exposure, identity/version, transport, authentication, configuration and evidence. These are editable review records, not a claim that automated tools have completed those checks. Check notes and overall evidence links persist in the existing Knowledge model; there is no new physical database migration.

## Guided sequences

Open **Recon workflows**, name a sequence, add/reorder up to eight actions and select existing scan profiles. Enter explicit targets or populate them from known objects. ffuf actions require a bounded relative wordlist. **Save workflow** sends no traffic. Select the saved workflow and **Preview workflow** to inspect each target, scope, profile, ports, rate, timeout, diagnostic scripts and wordlist.

All workflow targets require explicit included scope. Excluded/unknown targets, missing profiles, invalid targets/wordlists and invalid selected-service bindings prevent a ready preview. Existing adapters still accept single IPv4 targets or IPv4 HTTP origins. No DNS/hosts settings are edited and no external resource crawling is added.

**Create run** saves a snapshot of the ordered actions; it starts no tool. After the complete preview, acknowledge authorization and any higher-traffic/script confirmation. Choose **Run remaining sequence** to advance automatically after successful steps, or **Launch step N** to run one step at a time through the same queue. A failed/cancelled/interrupted step blocks progression until an explicit retry, retaining every attempt. **Pause after current step** lets the current tool finish and prevents later submissions; resuming requires a fresh action. **Stop sequence** cancels queued/running scans and retains history.

Automatic authorization is process-local. Restart/import pauses active sequences and never restores authorization or launches tools. [Current investigation workflow and limits](HTB-WORKSPACE.md). A run's action order survives edits to its saved workflow. Tool availability is checked at launch. Scope is checked again immediately before queue submission, including after asynchronous tool discovery and again immediately before the queued process starts. Scan cancellation, deadlines, process groups and raw evidence use the existing task manager. Coverage checklists remain unchanged after successful scans.

## Transfer and limits

Methodologies, workflow templates and run snapshots live in Knowledge records; run scan IDs and selected-service references are project-scoped and remapped on portable transfer. New `.dtproj` exports use version 5. Versions 1–4 remain readable; older applications reject version 5. Existing project graphs/notes/evidence and prior 0.6.0 imports remain intact.

Custom scan profiles remain application-wide settings and are not bundled in project archives. A transferred sequence referencing an unavailable custom profile is blocked in preview; select/recreate that profile before making a new sequence/run. Built-in profile IDs are portable. Workflow previews do not promise an installed executable; missing tools return actionable launch errors without advancing the sequence. The UI lists the first 100 methodologies/templates/runs, matching existing bounded knowledge queries.

Current limits: 100 checks per record, 2,000 characters per check note, eight workflow actions, 500 ffuf words per action, 5,000 total knowledge records in a portable project. Methodology templates are built in; editing template definitions and per-check evidence/history beyond saved notes are future work. There is no domain/CIDR/IPv6 live workflow executor. Finding retests are documented in [the research and export guide](DELIVERY.md#build-a-finding).

## Reproduction and screenshots

```bash
.venv/bin/python -m pytest tests/test_methodologies.py -q
npm run dev
# In a second terminal, with system Nmap + ProjectDiscovery httpx on PATH:
node scripts/methodology-smoke.cjs
# Actual installed Tauri/WebKit, system WhatWeb + ProjectDiscovery httpx:
xvfb-run -a dbus-run-session -- python3 scripts/native-methodology-smoke.py /usr/bin/dragontrip
```

Both smoke scenarios own a loopback HTTP server on port 8089 and isolated user data. Run them sequentially. The browser scenario drives real Nmap and httpx; the native one drives real WhatWeb and httpx, without an IPC shim. Test fixtures/coverage notes are explicitly authored inside isolated validation projects; new user projects remain empty.

[Methodology screenshot](screenshots/methodologies/methodology-coverage.png) · [Completed sequence](screenshots/methodologies/workflow-complete.png). Verification/package details: [BUILD-0.7.0](BUILD-0.7.0.md).
