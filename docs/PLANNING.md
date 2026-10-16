# Investigation planning and reporting

Built on GitHub commit `628ce10` (the completed 0.4.0 workspace). These additions extend that source; they are not a published desktop release.

## Task board

Open a project and choose **Task board**. Create a custom task or start from a service review, finding validation or remediation verification template. Tasks have five statuses (To do, In progress, Blocked, Done, Cancelled), four priorities, an optional owner, a date and linked graph objects. Open a task card to edit its fields or delete it. Within each loaded column, urgent work sorts first, then due dates.

Search matches task titles/content, including owners. Status filtering runs on the backend. Lists load 100 records at a time with an explicit Load more control; column counts describe loaded results. Due dates use UTC; unfinished tasks become overdue the following UTC day. Task status never starts a scan or executes an investigation step.

Tasks use the existing SQLite knowledge store, validation, Timeline and project search. They survive backend restarts and are included in project archives with remapped object references. No database migration or additional runtime dependency is needed. Archives containing task records require this updated application when importing; older 0.4.0 importers do not recognize the new record kind. Existing archives remain supported.

## Project overview

**Project overview** aggregates all project records in SQL: inventory by type, scan outcomes, active findings by severity, completed/blocked/cancelled tasks, overdue work and evidence counts. Cancelled tasks are excluded from the completion denominator. Draft/open/confirmed findings count as active; resolved/dismissed findings do not. The timestamp identifies the snapshot; Refresh loads current values.

## Reports

**Reports** lets you enter a title and executive summary, choose a minimum finding severity, and select active, confirmed or all findings. Optional sections include object inventory, scan history, investigation paths, the task work plan and notes. Notes are excluded by default. Findings sort by severity and include descriptions, remediation, linked object names, source scan IDs and evidence filenames/SHA-256 checksums.

Generate a preview before exporting. Changing report options clears the preview. **Export Markdown** regenerates from current project data and writes a private, non-overwriting `.md` file in Downloads, returning its path and checksum. Vault entries, raw console output, raw scan artifacts and attachment bytes are never included. Authored descriptions and summaries remain Markdown and should be reviewed before sharing. Report options/summary are an unsaved composition; they reset when leaving the page.

Reports support up to 10,000 records per source section and an 8 MiB knowledge-content budget. Requests beyond those bounds fail explicitly rather than truncating evidence. Scan output/options and node evidence attributes are deferred during generation.

## Validation

- Python: `65 passed, 1 skipped`; the opt-in live Nmap test was not run for this change.
- Frontend: `16 passed`, including task save/error retention and report preview/export transitions.
- `npm run build`: TypeScript and production Vite build pass.
- `node scripts/planning-smoke.cjs`: actual UI/API task creation, templates, owners, priorities, dates, links, status editing/search/filtering, overview, report preview/filter/export, persistence across backend restart and navigation at 1366×768. Uses isolated test data and never launches recon.
- Frozen backend: PyInstaller build and packaged migrations/restart smoke pass; the planning browser scenario also passes with the production Vite assets and frozen sidecar.
- Screenshots: `docs/screenshots/phase5-{task-board,project-overview,report}.png` show explicitly manual test fixtures.

Run browser acceptance after starting Vite on localhost:1420. Set `DRAGONTRIP_TEST_BACKEND=backend/dist/dragontrip-backend/dragontrip-backend` to run against the frozen sidecar, and `SCREENSHOT_DIR` to retain screenshots. The 0.5.0 Debian package and installed-Debian native checks now pass; see [BUILD-0.5.0.md](BUILD-0.5.0.md). Installed-Kali/VirtualBox acceptance remains separate.
