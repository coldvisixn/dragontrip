# Your first investigation

[Install Dragontrip](INSTALL.md) first. The interface currently uses English labels.

## 1. Create a project

Use **New project** and name your assessment or lab. Projects keep their graph, scans, findings, notes, tasks and evidence separate. Project overview opens with import/scope/recon actions. Edit its name and description under **Project details**. For a walkthrough, **Create fictional demo** on Dashboard/Projects makes a separate example project without launching tools.

## 2. Run recon within your scope

Start with **Import results** if you already have supported Nmap XML, Burp saved-items/issue XML or HTTP Nuclei JSONL. Review the preview before applying it. [Formats and scope rules](IMPORTS.md).

For live recon, choose **Start live recon** from Project overview, or **Start scan** from the graph. Select a profile and enter an authorized target. Adapters accept individual IPv4 addresses or IPv4 web origins, as appropriate; hostnames, ranges and IPv6 are not supported.

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

You can start a linked note/finding from Inspector or create one on its own page. Missing/deleted references are shown explicitly rather than silently replaced. **Use finding template** inserts blank reproduction/impact headings; paste or drop screenshots into the evidence picker.

Note/finding/plan editors recover a draft when reopened, including after restart. Closing preserves it; **Discard draft** clears it. Drafts are unencrypted and excluded from portable projects, so save records before transferring them. **Record a retest** appends manual verification history: fixed resolves, still present confirms, inconclusive retains status. [Recovery, evidence and retest limits](DELIVERY.md).

## 5. Plan follow-up

Open **Task board**. Start a custom task or use a service review, finding validation or remediation verification template. Set a priority, owner, due date and linked objects. Edit a card to change its state:

**To do → In progress → Done**, with **Blocked** and **Cancelled** available when appropriate.

Due dates are interpreted in UTC. Search matches titles/content, including owners; the status filter runs on the backend. Columns count loaded results; use **Load more tasks** after the first 100 records. Priorities and due dates order each loaded column.

**Project overview** shows inventory, scan outcomes, active findings by severity, completed work and overdue tasks. Cancelled tasks do not count toward the completion denominator. Refresh loads a new snapshot.

## 6. Prepare a report

In **Reports**, choose **Delivery preset** (confirmed findings and inventory) or **Working preset** (active findings and working sections). Enter a title and executive summary, adjust filters/sections and generate a preview. Composition persists per project after leaving the page or restarting.

Choose **Export format**: Markdown, standalone HTML or ZIP. HTML can be printed in a browser; ZIP contains HTML, Markdown and explicitly selected evidence files. Only checked files are embedded/copied, up to 100 files / 32 MiB. Markdown alone includes filenames/hashes without attachment bytes. Vault records, editor drafts and raw console buffers are excluded, but authored text and selected files may contain sensitive data; review them before sharing.

Changing options clears the preview. Export from the UI checks the content fingerprint; changed report data requires a fresh preview. Files are saved privately to Downloads without overwriting existing files. Native PDF/DOCX export is not implemented. [Current reporting behavior and limits](DELIVERY.md#review-and-export).

## 7. Save and transfer work

Saved records persist locally. New exports use `.dtproj` v4 for retest history; v1/v2/v3 imports are supported, and older apps reject v4. Device-local drafts are excluded. For a portable copy, use **Projects → Project portability → Export project** and transfer the `.dtproj` archive. Finish or cancel active scans first. Import creates a new project and does not resume historical scans.

Credentials are excluded by default. Including them requires explicit selection, an unlocked vault and a separate archive password; importing them requires an unlocked destination vault. [Data and backups](DATA.md) explain whole-installation backups and upgrade compatibility.

## Navigation

`Ctrl+K` opens the command palette; `Ctrl+Shift+F` opens project search. The navigation arrows move through visited pages. Inspector and the bottom task panel are resizable. Theme, accent, density, reduced motion and graph detail are under **Settings**.
