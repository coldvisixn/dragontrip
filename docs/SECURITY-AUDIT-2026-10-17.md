# Security audit — 2026-10-17

Reviewed source: `45134bbc208dd79b9b7ac2dd153507c0b6586823` (`main`, 0.9.0).
The fixes in this branch require a new application build; published 0.9.0 binaries are not changed by this source review.

## Scope

Manual review covered the Tauri launcher and IPC commands, loopback API authentication and origins, request parsing, subprocess arguments and scope checks, XML/JSON and portable project imports, evidence paths, vault encryption, Markdown/report rendering, and CI/release configuration. Automated checks covered the npm, Python and Rust lockfiles, Python static analysis, and fetched Git history for secrets.

This is a source and local regression audit, not a penetration test of deployed systems or a guarantee that every vulnerability has been found. Existing access controls matter: the backend binds to loopback, checks origins and requires a fresh per-launch bearer token. The API issues below require access to that token; they do not demonstrate an unauthenticated Internet attack.

## Confirmed issues and fixes

| Issue | Impact and preconditions | Resolution |
| --- | --- | --- |
| Request size trusted `Content-Length` only | An authenticated chunked JSON request could exceed the documented 256 KiB limit and reach the JSON parser. A false short length also bypassed the application-level upload check when delivered by an ASGI transport. Potential memory/CPU exhaustion; medium severity within the local authenticated boundary. | `LocalAPIGuard` counts actual ASGI body bytes and raises HTTP 413 before passing excess data to the parser. Header-based early rejection and the separate upload/archive budgets remain enforced. |
| Validation responses reflected secret input | Invalid vault/archive passwords and credential values could appear verbatim in HTTP 422 responses, including inputs that `SecretStr` had not yet validated. This increases exposure through response capture, diagnostics or logging; low severity, with no separate recipient or exfiltration demonstrated. | A validation-error handler returns only error type, field location and message, omitting input and context for every endpoint. |
| Malformed guard headers | Host validation accepted arbitrary suffixes after `127.0.0.1:`. Non-ASCII authorization values could raise `TypeError` in `compare_digest` and produce HTTP 500. Neither reproduced an authentication bypass. | The full Host value must match the loopback form. Authorization comparison uses bytes; malformed credentials return HTTP 401. Very long numeric lengths are rejected without unsafe integer conversion. |
| Known dependency advisories | Python's HTTP/file-serving stack, multipart parser, cryptography wheels, pytest, and Vitest's development dependencies had published advisories. Scanner severity does not establish that every affected feature is reachable in Dragontrip. In particular, the Vitest findings concern development tooling, and the vault uses AES-GCM/Scrypt rather than the X.509/PKCS7 APIs mentioned in several cryptography advisories. | Updated and pinned FastAPI 0.143.3, Starlette 1.8.0, cryptography 50.0.2, python-multipart 0.0.32, pytest 9.1.1 and Vitest 4.1.11; synchronized Python/npm lockfiles and newly required transitive packages. npm and Python audits report no remaining known vulnerabilities. |

`tests/test_security.py` adds 22 regressions covering actual streamed body sizes, false lengths, accepted small chunked JSON, rejected multipart uploads, password/credential/malformed-JSON reflection, invalid hosts, numeric headers and non-ASCII authorization. Rejected writes leave no project or evidence records.

The dependency-audit workflow checks lockfiles on pull requests, pushes to `main`, manual runs and a weekly schedule. It includes development dependencies, uses read-only repository permissions and pins its actions to verified commit SHAs. Dependabot remains responsible for proposing dependency updates.

## Remaining upstream dependency concerns

The Linux Tauri chain requires GTK 3 and `glib 0.18.5`. RustSec [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) describes undefined behavior in `VariantStrIter`, fixed in `glib >=0.20.0`. Simply adding a second newer `glib` dependency does not replace GTK's incompatible 0.18 dependency.

No calls to `VariantStrIter` / `array_iter_str` were found in Dragontrip or the inspected Tauri, Wry, Tao, Muda, GTK, GDK and Gio sources. That search is not proof of non-reachability. The dependency warning remains open and has not been suppressed. A coordinated supported GTK/Tauri upgrade or a maintained, tested backport is required to remove it; introducing an unmaintained local GTK fork was not treated as a routine version bump.

RustSec also reports [RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370.html): the transitive build dependency `proc-macro-error 1.0.4` is unmaintained. This is a maintenance warning rather than a separately confirmed Dragontrip exploit. Its consumers must migrate to a maintained alternative; no advisory was ignored to obtain a clean result.

## Other reviewed boundaries

- No secret matches were reported by Gitleaks with redaction enabled across fetched Git refs. This cannot rule out revoked, low-entropy or unrecognized secrets, or refs absent from the checkout.
- XML uses `defusedxml`; existing XXE regressions pass. Portable archives validate paths, counts, expanded sizes, hashes and references, and write evidence under newly generated identities rather than extracting archive paths.
- Recon uses argument arrays without a shell, validated profiles/targets and project scope checks. Imported queued/running scans become interrupted and do not execute automatically.
- Vault records use authenticated AES-GCM encryption and password-derived Scrypt keys. Ordinary project data remains plaintext as documented.
- Frontend Markdown omits raw HTML and external images; exported HTML disables scripts and external resource loading. Evidence reads require authentication and integrity checks.
- Bandit reports only low-severity subprocess warnings for the fixed `xdg-user-dir DOWNLOAD` argv call in `downloads.py`; no shell or user-controlled command string was found there. These are documented findings, not silently disabled checks.

## Verification

- Python: **124 passed, 1 skipped**. The opt-in live Nmap integration test was skipped; no external assessment targets were scanned.
- UI: **44 passed** across 11 files. The first full run had one asynchronous page-load timeout under concurrent compilation; a focused rerun and a subsequent full run passed without changing application code or weakening the assertion.
- `npm run lint`, `npm run format:check`, `npm run build`, `cargo fmt --check`, `pip check`, and `git diff --check` passed.
- `npm audit`: **0 vulnerabilities** including development dependencies.
- `pip-audit --strict --disable-pip --no-deps -r backend/requirements-lock.txt`: **0 known vulnerabilities**. Installed application/dev packages match the lockfile.
- `cargo-audit 0.22.2`: **0 vulnerability entries, 2 informational warnings** (`glib` unsoundness and unmaintained `proc-macro-error`, detailed above). Database snapshot: `999ec89d5d3f10f20be14750ec8c2d8b44e0ac9b` from `RustSec/advisory-db`. A zero vulnerability count must not be read as resolution of those warnings.
- PyInstaller backend rebuilt successfully. Real HTTP, migrations and restart-persistence smoke checks passed against the new frozen backend.
- A new full desktop installer and interactive Linux/Kali acceptance were not run as part of this audit. The repository's existing desktop CI remains responsible for those checks before release.
