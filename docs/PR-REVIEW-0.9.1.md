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

The compatible proposals were reconciled through [release PR #17](https://github.com/coldvisixn/dragontrip/pull/17)
and merged into `main` after full Linux/Kali and security CI passed. The eleven
original bot PRs were then closed as superseded, with their original descriptions
preserved and a link to the integrated changes. TypeScript 7 was closed with the
explicit compatibility reason above. Source branches were retained for traceability.

Dependabot now groups Pydantic/core and the frontend build tools. TypeScript
major updates are held until the lint toolchain can accept them. Security audits
continue to run on the resolved lockfiles; a held version is not exempt from
vulnerability checks.

The repository keeps the established Linux x86_64 product scope. Completing this
release does not claim unimplemented Windows/macOS/ARM support or the future
roadmap features.

## Proposals generated after the release freeze

After #17 reached `main` and `v0.9.1` was tagged, Dependabot opened four more
version proposals. Their diffs and supplied upstream release notes were reviewed;
each proposal's security workflow passed. They are declined for the frozen
0.9.1 release and closed with this explanation, rather than represented as merged
or as proven incompatible. The tested existing versions remain under scheduled
security audits. A future maintenance release can reconsider these updates with
its own installer and upgrade validation.

| PR | Proposal | Review decision |
| --- | --- | --- |
| [#18](https://github.com/coldvisixn/dragontrip/pull/18) | markdown-it-py 4.0.0 → 4.2.0 | Adds parser extension/preset features and a text-joining performance fix. Changes only runtime/lock pins; no project fix is lost. Keep the parser used by the verified report/export build for 0.9.1. |
| [#19](https://github.com/coldvisixn/dragontrip/pull/19) | lucide-react 0.468.0 → 1.57.0 | A major icon-library update changes package metadata/lockfile. No application feature is included; defer icon/API and visual migration to a subsequent release. |
| [#20](https://github.com/coldvisixn/dragontrip/pull/20) | Alembic 1.15.2 → 1.20.0 | Changes only runtime/lock pins. 0.9.1 introduces no migration; the retained migration engine passes upgrades from both published baselines with SQLAlchemy 2.1.4. Defer migration-tool changes to a separate validated package. |
| [#21](https://github.com/coldvisixn/dragontrip/pull/21) | Ruff 0.15.7 → 0.17.0 | Development-tool update changes default Python/rule behavior and lock pins. It adds no installer functionality; retain the linter used for this release's completed checks. |

These four newly generated proposals are separate from the twelve open PRs at
the start of the task. Reviewing a proposal does not require merging every newer
dependency version into an already tagged installer.
