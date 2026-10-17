# Your first investigation

[Install Dragontrip](INSTALL.md) first. The interface currently uses English labels.

## 1. Create a project

Use **New project** and name your assessment or lab. Projects keep their graph, scans, findings, notes, tasks and evidence separate. Existing work is restored after restarting the application.

## 2. Run recon within your scope

Choose **Start scan**, select a profile and enter an authorized target. Adapters accept individual IPv4 addresses or IPv4 web origins, as appropriate; hostnames, ranges and IPv6 are not supported.

Quick/Full/Service profiles, saved profiles and a queue control how work is launched. Review the confirmation before starting. **Scans** provides history and filters. The bottom panel shows queued/running work and bounded terminal output. Cancel through the task controls rather than closing the terminal.

Install tools separately if **Tools** marks them unavailable. Nmap discovers services; WhatWeb/httpx add web observations; ffuf supports bounded content discovery. Inspector can suggest relevant tools, but a suggestion does not launch one automatically. [Recon contracts and limits](PHASE2.md) describe adapter details.

## 3. Connect infrastructure and evidence

Open **Network Graph** and select a host, service or URL to inspect its attributes and source evidence. Move nodes to arrange the investigation; positions and viewport persist. Add a **Custom node** for a manual object or hypothesis and connect manual relationships using node handles.

Observed evidence remains distinct from manually authored content. Use **Evidence** for attachments and screenshots. Attachments have SHA-256 metadata; a knowledge record can reference them. **Timeline** records activity; **Project search** finds objects, knowledge, tasks, scans and evidence metadata.

## 4. Record knowledge

- **Notes:** Markdown context, hypotheses and observations.
- **Findings:** impact/evidence, severity, status, remediation and links to affected objects, scans or attachments.
- **Attack Paths:** ordered, manual investigation plans with planned/validated/blocked steps. They do not execute tools.
- **Credentials Vault:** encrypted titles, usernames, secrets, notes and object references. Unlock explicitly and reveal only when needed. The master password cannot be recovered.

You can start a linked note/finding from Inspector or create one on its own page. Missing/deleted references are shown explicitly rather than silently replaced.

## 5. Plan follow-up

Open **Task board**. Start a custom task or use a service review, finding validation or remediation verification template. Set a priority, owner, due date and linked objects. Edit a card to change its state:

**To do → In progress → Done**, with **Blocked** and **Cancelled** available when appropriate.

Due dates are interpreted in UTC. Search matches titles/content, including owners; the status filter runs on the backend. Columns count loaded results; use **Load more tasks** after the first 100 records. Priorities and due dates order each loaded column.

**Project overview** shows inventory, scan outcomes, active findings by severity, completed work and overdue tasks. Cancelled tasks do not count toward the completion denominator. Refresh loads a new snapshot.

## 6. Prepare a report

In **Reports**, enter a title and executive summary, choose finding status/minimum severity and select sections. Generate a preview, review it, then choose **Export Markdown**. The report is saved privately to Downloads without overwriting an existing file.

Reports can include findings/remediation, object inventory, scan history, investigation paths, tasks and optional notes. Evidence references include filenames/checksums; attachment bytes, raw console output and vault entries are excluded. Authored project text can contain sensitive information, so review the deliverable before sharing it.

Changing options clears the preview; export regenerates from current project data. Report composition resets when leaving the page. PDF and HTML exports are not implemented. [Reporting limits](PLANNING.md) are documented separately.

## 7. Save and transfer work

Normal edits persist locally. For a portable copy, use **Projects → Project portability → Export project** and transfer the `.dtproj` archive. Finish or cancel active scans first. Import creates a new project and does not resume historical scans.

Credentials are excluded by default. Including them requires explicit selection, an unlocked vault and a separate archive password; importing them requires an unlocked destination vault. [Data and backups](DATA.md) explain whole-installation backups and upgrade compatibility.

## Navigation

`Ctrl+K` opens the command palette; `Ctrl+Shift+F` opens project search. The navigation arrows move through visited pages. Inspector and the bottom task panel are resizable. Theme, accent, density, reduced motion and graph detail are under **Settings**.

## 0.8.0 workflow update

New projects open in Project overview with import, scope and live recon actions. Rename a project through Project details. Dashboard/Projects offers an explicit, separate fictional demo. Note/finding/plan editors recover device-local drafts; Reports keeps its options/summary. Findings support a description template, pasted/dropped screenshots and retained manual retests. Reports has delivery/working presets and Markdown, HTML or selected-evidence ZIP output. [Complete workflow and limits](DELIVERY.md).
