# Grouped navigation (0.7.1)

The sidebar now has eight navigation links instead of 22. Related screens use a horizontal tab row. Every existing screen remains available, including through Ctrl+K.

| Sidebar | Tabs |
| --- | --- |
| Dashboard | Workspace overview |
| Projects | Project selection and transfer |
| Project | Project overview, Targets & scope, Task board, Timeline, Project search |
| Assets | Network Graph, Hosts, Web applications |
| Recon | Scans, Import results, Recon workflows |
| Investigation | Findings, Notes, Evidence, Attack Paths, Methodologies, Credentials Vault |
| Reports | Reports |
| Settings | Settings, Tools |

Each section remembers its last visited page for the current session. Deep links from Inspector, knowledge links and the command palette select the matching group/tab. Back/Forward retain their existing page history. This is grouped page navigation; it does not introduce multiple independent open documents or promise to retain unsaved form drafts when switching screens.

Use **Collapse sidebar** at the bottom to switch to icons. Each icon retains a tooltip and accessible name. **Expand sidebar** restores labels; this preference persists through application restart. Project sections are disabled until a project is selected. At compact window heights the sidebar reduces spacing; tabs scroll horizontally if necessary.

Tab keyboard controls: Left/Right select adjacent tabs, Home/End select the first/last tab. The active tab is the tab stop and controls the labeled workspace panel. Existing Ctrl+K and Back/Forward shortcuts continue to work.

No backend model, stored project, scan, evidence or archive format changed. This update builds on the 0.7.0 development checkout.

## Verification and screenshots

- 23 UI tests pass, including grouped destinations, last-section restoration, project availability, tab keyboard behavior, Back and persisted collapse preference.
- TypeScript and production Vite build pass.
- Real API/browser acceptance checks eight links, grouped/deep-linked navigation, linked-note routing, command palette, compact preference after reload, and sidebar fit at 1440×1000 and 1000×650.
- Installed Tauri/WebKit acceptance passed grouped pages, last-section restoration, linked-note routing, compact sidebar and full process-restart persistence without an IPC shim. Native automation used the same Debian/WebKit container as the prior build; a fresh Kali/VirtualBox run remains separate.
- Existing frozen-sidecar Burp import/web-map browser acceptance passed after updating its navigation helper.

Screenshots: [expanded](screenshots/navigation/navigation-expanded.png), [compact](screenshots/navigation/navigation-collapsed.png), [investigation tabs](screenshots/navigation/navigation-investigation.png). They show isolated, explicitly authored validation projects rather than user data.

Reproduce with `npm test`, `npm run build`, then `npm run dev` and `node scripts/navigation-smoke.cjs` in a second terminal. Installed WebKit acceptance is `xvfb-run -a dbus-run-session -- python3 scripts/native-navigation-smoke.py /usr/bin/dragontrip`. CI configurations include these checks; local validation is not a claim that remote CI has run on this unpushed work.

The local development package is `src-tauri/target/release/bundle/deb/dragontrip_0.7.1_amd64.deb`, with a matching `.deb.sha256`. No new GitHub release has been published.

Final local package SHA-256: `27a36978d7d1c4d15277f6eaa51577b8d55fb4430e454c275690b909afdb9b4f`. Check with `sha256sum --check dragontrip_0.7.1_amd64.deb.sha256` in the artifact directory. The final frontend additionally keeps keyboard focus on the active tab during repeated arrow-key navigation.

## Current local-investigation navigation

The working tree now groups project pages into **Research**, **Recon** and **Notebook**, with three frequent tabs per section and a native **More…** selector for secondary pages. Existing command-palette destinations remain available. Navigation history, remembered section pages and editor/filter state are project-scoped and persist locally. See [the HTB workspace guide and current validation](HTB-WORKSPACE.md). Earlier screenshots in this document describe the 0.7.1 release baseline.
