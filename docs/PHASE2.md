# Phase 2 — Recon Automation (0.2.0)

**Historical implementation record.** For the current release, use [capabilities](CAPABILITIES.md), [installation](INSTALL.md) and [published-package verification](BUILD-0.9.1.md).

Phase 2 adds real recon tools and a persistent, bounded execution queue. Attack Paths, Findings, Notes and Credentials Vault remain Phase 3 features.

## Available workflows

| Profile | Execution | Approval |
| --- | --- | --- |
| Quick Scan | Nmap TCP connect, top 100 ports, light version detection, max rate 100/s, 240s deadline | Target permission |
| Full Scan | Nmap TCP ports 1–65535, max rate 100/s, 900s deadline | Target permission and separate higher-traffic approval |
| Service Enumeration | Selected observed TCP port, deeper version detection and a diagnostic NSE allowlist; generic profile defaults to 80/443/8080/8443 | Target permission and separate diagnostic approval |
| Web fingerprint | WhatWeb aggression 1, no redirects | Target permission |
| HTTP inspection | ProjectDiscovery httpx: status, title, server and technology evidence; no redirects or scheme fallback | Target permission |
| Web path discovery | ffuf with an explicit 1–500-entry relative wordlist, one worker, default 5 requests/s, 180s deadline | Target permission and separate discovery approval |

The supported NSE scripts are `ssh-hostkey`, `smb-protocols`, `ftp-syst` and `rdp-enum-encryption`, each subject to normal Nmap applicability rules and a 15s script timeout. No arbitrary script paths, categories, script arguments, shell commands, exploitation or credential guessing are accepted.

Custom profiles persist name, tool, ports/ranges, rate, timeout and optional diagnostic scripts. Rates are limited to 1–1000/s for Nmap and 1–50/s for web tools; deadlines to 10–900s. Extended ranges, higher rates and diagnostic scripts require a separate confirmation at execution time. WhatWeb performs one passive fingerprint request per target; its rate value does not create additional requests.

## Queue and persistence

Settings → Recon queue controls 1–3 concurrent tasks; the default is one for a 4 GB machine. At most 32 tasks may be queued/running across projects. The scheduler starts accepted tasks in FIFO order. Lowering concurrency lets existing tasks finish before starting more. Queued and running tasks can be cancelled. Shutdown terminates and reaps process groups. After an unexpected restart, queued/running records become interrupted and are never automatically rerun.

Alembic revision 0002 upgrades existing Phase 1 databases. Projects, coordinates, custom objects and existing scans are retained. Profiles and concurrency persist in SQLite. Each accepted task stores its exact arguments and a snapshot of the profile, so deleting a profile does not change existing jobs. Queue time and actual execution start are stored separately.

## Scope and evidence

Nmap accepts one IPv4 address; web adapters accept one HTTP(S) URL with an IPv4 host and optional port/path. Hostnames, CIDR batches, embedded credentials, fragments and query strings are deliberately not execution targets in this release. Redirect following, recursive fuzzing, TLS/CSP host probing and httpx update checks are explicitly disabled. Tools run with a private configuration directory; httpx receives an explicit empty configuration file rather than user-wide tool settings.

Successful Nmap XML and web JSON/JSONL are retained as source artifacts. Terminal output is capped at 64 KiB per scan; total console processing at 8 MiB and source files at 16 MiB. Failed/cancelled partial artifacts and disposable ffuf wordlists are removed, including restart cleanup. Successful evidence retention is manual, as in Phase 1.

Real HTTP responses create stable URL nodes linked to their host. Equivalent root/default-port URLs are normalized, rescans preserve coordinates, and the latest 20 observation references are kept on each URL; the full scan history remains available separately. Empty results create no discovered objects. Out-of-origin records are not ingested. JSON previews are bounded; the full scan evidence can be exported privately and atomically from Inspector or the selected historical scan. HTTPX JSONL exports are normalized to a JSON array when needed; the original JSONL artifact remains unchanged.

A partial Nmap scan marks services unobserved only within its scanned TCP port set. It does not invalidate unrelated ports or manual nodes.

## Interface

- Scan dialog selects built-in or custom profiles and shows their scope, limits and approvals.
- Inspector recommends selected-service enumeration for TCP services and WhatWeb/httpx/ffuf for HTTP services. Recommendations never run automatically.
- URL cards, source JSON, technology fingerprints and recent observation references are visible in Inspector.
- Graph search includes titles/technologies; an object-type filter limits visible nodes.
- Scan history is searched and filtered in SQLite, fetched 50 rows per page, with a maximum API page of 100. Project polling includes only recent scans and currently active jobs, without console buffers.
- Settings manages custom profiles, global concurrency and cancellation.

## Installation and verification

Install optional tools on Kali with `sudo apt install nmap whatweb httpx-toolkit ffuf`. The application detects their actual paths/versions and refuses to use Python's unrelated `httpx` CLI. Tools are not bundled in the `.deb`.

```bash
.venv/bin/python -m pytest -q
npm test
npm run build
# Build the frozen backend before this check. All tools must be installed.
.venv/bin/python scripts/recon-smoke.py
```

The real-tool check scans only its own loopback HTTP servers. It verifies selected-service NSE setup, WhatWeb/httpx/ffuf execution, JSON ingestion, URL deduplication, preserved coordinates, bounded wordlist cleanup and no redirects to a second origin. `--skip-httpx` is explicitly a partial local check, not full acceptance. CI runs full acceptance on Ubuntu and on the installed Kali package, plus native Tauri/graph/export/restart checks.

The complete Ubuntu and installed Kali acceptance passed; release artifact links and evidence are recorded in [VALIDATION.md](VALIDATION.md). A real 4 GB VirtualBox performance check remains separate from container acceptance.
