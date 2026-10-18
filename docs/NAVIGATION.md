# Workspace navigation

The sidebar separates global Dashboard/Projects/Settings from four project sections. The selected section exposes all its pages vertically; there is no horizontal tab bar or More menu. Ctrl+K also reaches every page.

| Section | Pages |
| --- | --- |
| Plan | Project overview and goal, Targets & scope, Methodologies |
| Research | Network Graph, Hosts, Web applications |
| Recon | Scans, Import results, Recon workflows |
| Notebook | Notes, Findings, Task board, Attack Paths, Evidence, Credentials Vault, Timeline, Project search, Reports |
| Settings | Settings, Tools |

Each project retains its own navigation history and section pages. Source links select the matching section/page. Back/Forward follows visited pages. Selections, filters, graph view and supported editors recover after restart. [Draft recovery and conflicts](HTB-WORKSPACE.md).

Collapse sidebar switches to compact labels with tooltips and accessible names. Project sections are disabled until a project is selected. Inspector visibility is independent of selection. The header identifies project, current page and goal. Background work shows a compact status row; expand it for result, stop, evidence, linked records and a new attempt. Technical output is a separate details block.

Keyboard controls: Up/Down (also Left/Right) selects adjacent vertical tabs; Home/End selects the first/last. The active tab controls its labeled workspace panel. Ctrl+K opens quick navigation, Alt+Left/Right goes Back/Forward, Ctrl+Shift+F opens project search. Dialogs retain focus and Escape closes them.

[Experience changes and evidence](experience/README.ru.md) · [Browser test](../scripts/navigation-smoke.cjs) · [Native test](../scripts/native-navigation-smoke.py).
