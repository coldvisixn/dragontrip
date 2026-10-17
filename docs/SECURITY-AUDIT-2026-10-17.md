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

## GTK security backport and remaining maintenance concern

The Linux Tauri chain requires GTK 3 and `glib 0.18.5`. RustSec [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) describes undefined behavior in `VariantStrIter`, fixed upstream in `glib >=0.20.0`. Simply adding a second newer `glib` dependency does not replace GTK's incompatible 0.18 dependency.

This branch now supplies a compatible backport through `[patch.crates-io]`: the published GLib source plus the two-line upstream correction from an immutable output pointer to a mutable one. GTK's public API and types remain unchanged. The repository owns this narrowly scoped backport until a supported upstream stack includes it.

`src-tauri/vendor/gtk-compat.patch` records the entire change; original crate/archive hashes and licensing are retained. `scripts/check-vendored-gtk.py` reverses the patch in a temporary copy and verifies every file against the published source hashes, and rejects a lockfile that no longer selects the backport. Quick checks and the security workflow run this verification. Linux packaging and release CI run `gtk_security` tests with optimization enabled, covering every affected iterator entry point and mixed/empty iteration.

Cargo audit does not match locally patched path packages against registry advisories. `scripts/audit-rust.py` therefore restores each backport's original registry version/checksum in a temporary audit lockfile and scans it as well. After mandatory source verification, it reports the known, fixed GLib advisory as a verified backport, fails on every vulnerability or other unsoundness, and keeps maintenance warnings visible. Future advisories for the copied GLib version are still monitored. The real lockfile is never modified and no CLI ignore flags are used. The exact source diff, provenance check and optimized behavioral regression are the proof of repair, rather than the scanner's package-source filtering.

RustSec still reports [RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370.html): the transitive build dependency `proc-macro-error 1.0.4` is unmaintained. This is a maintenance warning rather than a separately confirmed Dragontrip exploit. The apparent replacement `proc-macro-error2` is also unmaintained ([RUSTSEC-2026-0173](https://rustsec.org/advisories/RUSTSEC-2026-0173.html)), so it was not introduced. Removing this remaining warning requires migrating the upstream GLib/GTK macro consumers to a different diagnostics API; their locked build dependency remains visible rather than introducing an untested macro rewrite into a security fix.

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
- `scripts/audit-rust.py` with `cargo-audit 0.22.2`: **0 vulnerability entries, 1 verified GLib backport, 1 maintenance warning** (unmaintained build dependency `proc-macro-error`, detailed above), including the original registry baseline of the copied GLib code. Database snapshot: `999ec89d5d3f10f20be14750ec8c2d8b44e0ac9b` from `RustSec/advisory-db`.
- PyInstaller backend rebuilt successfully. Real HTTP, migrations and restart-persistence smoke checks passed against the new frozen backend.
- Optimized GLib iteration regression: **2 passed** using the patched source against the system GLib runtime. Running the identical tests against the original published 0.18.5 source reproduced **SIGSEGV**. The same tests also run against the application's complete dependency tree in packaging/release CI.
- Full desktop packaging and interactive Linux/Kali acceptance are verified by the PR's **Linux build and verification** workflow. Check the run matching the PR's current commit before release; local backend/API checks alone do not establish full desktop acceptance.
