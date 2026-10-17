# Workspace navigation

Six sidebar destinations keep research in three project sections. The first three pages in each section have tabs; additional pages appear in **More…**. Ctrl+K also reaches every existing page.

| Sidebar | Frequent tabs | More… |
| --- | --- | --- |
| Dashboard | Workspace overview | — |
| Projects | Project selection and transfer | — |
| Research | Network Graph, Hosts, Web applications | Project overview, Methodologies, Attack Paths |
| Recon | Scans, Import results, Recon workflows | Targets & scope |
| Notebook | Notes, Findings, Task board | Evidence, Credentials Vault, Timeline, Project search, Reports |
| Settings | Settings, Tools | — |

Each project retains its own navigation history and section pages. Deep links from observations, Inspector, records and the command palette select the matching section/page. Back/Forward follows visited pages. The last page, selections, filters, graph view and supported editors recover after restart. [Draft recovery and conflicts](HTB-WORKSPACE.md).

**Collapse sidebar** switches to icons with tooltips and accessible names; the preference persists. Project sections are disabled until a project is selected. The terminal stays hidden when empty, while running tools remain accessible. Optional metadata and less frequent actions live in contextual details blocks.

Keyboard controls: Left/Right selects adjacent visible tabs; Home/End selects the first/last visible tab. The active tab controls its labeled workspace panel. **More…** is a standard keyboard-operable select. Ctrl+K opens quick navigation, Alt+Left/Right goes Back/Forward, Ctrl+Shift+F opens project search. Dialogs retain focus and Escape closes them.

Browser and installed Tauri/WebKit acceptance cover six links, remembered sections, source-linked note routing, compact sidebar, keyboard navigation, Back and restart recovery. Compact light/dark 1000×650 checks are included in investigation acceptance. [Current evidence](BUILD-0.9.1.md) · [Browser navigation test](../scripts/navigation-smoke.cjs) · [Native navigation test](../scripts/native-navigation-smoke.py).
