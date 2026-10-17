# Pull request reconciliation for 0.9.1

All 16 PRs existing at the start of release preparation were reviewed, including
closed PRs, their branch diffs and the failed CI steps. There were 12 open PRs,
all dependency proposals; no unmerged application feature was found in them.

| PR | Proposal | Disposition for 0.9.1 |
| --- | --- | --- |
| [#1](https://github.com/coldvisixn/dragontrip/pull/1) | Developer checks, formatting and Dependabot | Already merged; retained. The old branch's commit hash differs because of squash merging. |
| [#2](https://github.com/coldvisixn/dragontrip/pull/2) | Playwright 1.64.0 | Included in the consolidated release; browser acceptance uses the matching version. |
| [#3](https://github.com/coldvisixn/dragontrip/pull/3) | React Vite plugin 6.1.2 | Included together with Vite 8.3.4. Its isolated update failed npm peer resolution against Vite 6. |
| [#4](https://github.com/coldvisixn/dragontrip/pull/4) | Vitest 5.0.4 | Superseded by 5.0.5, tested with the consolidated frontend toolchain. |
| [#5](https://github.com/coldvisixn/dragontrip/pull/5) | Uvicorn 0.54.0 | Included; real HTTP/frozen-backend checks cover startup, requests and shutdown. |
| [#6](https://github.com/coldvisixn/dragontrip/pull/6) | Pydantic core 2.50.1 | Included with Pydantic 2.14.1. Its isolated update conflicted with Pydantic 2.11.4's exact core pin. |
| [#7](https://github.com/coldvisixn/dragontrip/pull/7) | getrandom 0.4.3 | Included with the required `getrandom::fill` API migration. The isolated update failed Rust compilation because `getrandom::getrandom` was removed. |
| [#8](https://github.com/coldvisixn/dragontrip/pull/8) | Vite 8.3.4 | Included with React plugin 6.1.2; its isolated update conflicted with plugin 4's peer range. |
| [#9](https://github.com/coldvisixn/dragontrip/pull/9) | python-multipart 0.0.32 | Already incorporated by security PR #16; its closed status does not represent a missing fix. |
| [#10](https://github.com/coldvisixn/dragontrip/pull/10) | SQLAlchemy 2.1.4 | Included; database, migrations, persistence and transfer regressions cover compatibility. |
| [#11](https://github.com/coldvisixn/dragontrip/pull/11) | pytest 9.1.1 | Already incorporated by security PR #16. |
| [#12](https://github.com/coldvisixn/dragontrip/pull/12) | Pydantic 2.14.1 | Included with core 2.50.1. The isolated update failed pip's exact dependency resolution. |
| [#13](https://github.com/coldvisixn/dragontrip/pull/13) | PyInstaller 6.22.3 | Included; the backend and installer are rebuilt and exercised after freezing. |
| [#14](https://github.com/coldvisixn/dragontrip/pull/14) | TypeScript 7.0.2 | Declined for this release: current typescript-eslint 8.71.2 supports TypeScript `<6.1`. Retain pinned 5.9.3; no `--force` or peer-check bypass. Revisit major compiler updates with matching lint support. |
| [#15](https://github.com/coldvisixn/dragontrip/pull/15) | Seven GitHub Action upgrades | Included; action revisions are pinned to verified upstream commit SHAs. Full Linux/Kali CI validates artifact upload/download and runner compatibility. |
| [#16](https://github.com/coldvisixn/dragontrip/pull/16) | API/dependency security and GLib iterator fix | Already merged and included in the installer for the first time in 0.9.1. |

The open proposals are reconciled through one release PR so that dependent
updates are tested together. The original bot PRs are closed as superseded once
the consolidated changes reach `main`; TypeScript 7 is closed with the explicit
compatibility reason above. Source branches are retained for traceability rather
than deleted as part of review.

Dependabot now groups Pydantic/core and the frontend build tools. TypeScript
major updates are held until the lint toolchain can accept them. Security audits
continue to run on the resolved lockfiles; a held version is not exempt from
vulnerability checks.

The repository keeps the established Linux x86_64 product scope. Completing this
release does not claim unimplemented Windows/macOS/ARM support or the future
roadmap features.
