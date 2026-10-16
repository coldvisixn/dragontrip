# Research workspace: audit and delivery plan

Audit baseline: GitHub main `41d94ec`, 0.5.0 (2026-10-16). Checkout was clean and fast-forwarded from 0.4.0. No reset or project replacement.

## Existing implementation

Tauri 2 manages a local authenticated FastAPI sidecar. SQLite migrations 0001–0004 contain projects, graph nodes/edges, scan queue/history, knowledge, credentials, attachments and views. React exposes Nmap/WhatWeb/httpx/ffuf, stable graph coordinates, Inspector, notes/findings/manual paths, vault, Timeline/search, task board, overview and Markdown export. `.dtproj` validates checksums and remaps references transactionally. GitHub v0.5.0 includes installers; BUILD-0.5.0 links successful release and installed-Kali CI. These are existing features, not proposed additions.

Gaps verified in source: recon.target permits only single IPv4 / IPv4 origin; no persisted scope; URL nodes do not distinguish methods or an application aggregate; Nmap parser is single-target; web observations retain only 20 summaries; findings have basic severity/status/remediation; external tool imports and explicit retest results are absent. Graph ingest replaces some observed attributes, so manual knowledge must remain separate. Archive's closed node-kind list must be extended with all new models and links.

## Stages and acceptance

1. **Offline ingestion foundation** (first vertical slice): persisted include/exclude IP/CIDR/domain/origin scope; explicit domain membership without DNS lookups; Burp saved-items XML and issue XML, Nmap XML, Nuclei JSONL preview/apply. Real application/domain/endpoint objects, findings and immutable per-import observations; source-file hashes; exact reimport idempotence; conservative matching; application-focused endpoint list; manual application/endpoint creation and existing linked notes/findings. Migration and portable project roundtrip preserve everything. Acceptance: two vhosts on one IP remain distinct, GET/POST differ, excluded records are skipped, preview writes nothing and sends no network traffic, edits/coordinates survive repeat import, incomplete imports never resolve findings. Build and test the packaged desktop.
2. **Methodologies and workflows** (depends on 1): explicit not-tested/in-progress/tested/not-applicable checklist per object; saved ordered tool profiles, context actions, target/action preview, scope enforcement at dispatch and redirect boundaries, queue/cancel/result links. A bounded GET-only crawler is a separate adapter with redirect/resource budgets; never infer checklist completion from absence of findings. Acceptance: restart/cancel/scope-boundary tests against owned local fixtures.
3. **Finding lifecycle and correlation** (depends on 1): CVSS/vector, CVE/CWE, reproducibility/expected/actual, templates, explicit retest and false-positive decisions; candidate matches across scanners require human confirmation when ambiguous. Compare observations without treating partial absence as fixed. Acceptance: independent source evidence survives merge, edits and export/import; retest history survives restart.
4. **Reports** (depends on above): optional persisted draft; formatting/PDF/DOCX remain lower priority.

Each stage must be reviewable separately. This delivery starts with stage 1, not a claim that all later stages are complete.

## Design decisions

Use existing Node/Edge and Knowledge entities for navigable objects and findings. Add scope rules, import runs and observations with foreign keys and additive migration. Application identity is normalized scheme + IDNA hostname + effective port, never resolved IP. Endpoint identity adds method and exact path/query (fragment removed, query order/values and path case/encoding retained). Unknown methods remain UNKNOWN rather than guessing GET. Query parameter names are observations, not an aggressive dedup key. IP relationships record exported addresses only; no hosts/DNS changes or inferred resolution. IPv6 literals/CIDR can be stored offline; live recon IPv6 is deferred.

Compare import runs of the same format with explicit added/changed/reobserved/not-observed sets; absence is only absence from that export. Exact source matching can coalesce repeat findings; cross-tool similarity is not sufficient to silently merge different issues.

## Research sources and constraints

Reviewed official sources on 2026-10-16:

- [Burp HTTP history](https://portswigger.net/burp/documentation/desktop/tools/proxy/http-history) documents methods, URLs, IPs and request/response context for Professional and Community. [Context menu](https://portswigger.net/burp/documentation/desktop/tools/context-menu) documents Save items. Import only exported selected items, not the whole history/sitemap by implication.
- [Burp reporting](https://portswigger.net/burp/documentation/desktop/getting-started/generate-reports) is Professional functionality. Issue XML contains findings and optionally request/response pairs; it is not a sitemap. Binary Burp project files and HTML reports are not XML interchange. Community users should export saved items; no extension is needed for that minimal path. A future Montoya exporter is justified only if additional structure is required.
- [Legion](https://github.com/Hackman238/legion): open-source host/service workspace, contextual actions and evidence graph. Borrow the workflow, not AI orchestration or exploitation architecture.
- [Faraday](https://docs.faradaysec.com/): importer-centered correlation. Community and commercial features must be checked individually; no dependency on its server or paid automation.
- [reNgine-ng](https://github.com/Security-Tools-Alliance/rengine-ng): open-source configurable recon engines and result organization; adapt bounded local scenarios rather than its deployment architecture.
- [Reconmap](https://reconmap.com/overview/features/): task/command workflow ideas; do not assume all hosted/commercial integrations are freely available.
- [DefectDojo](https://docs.defectdojo.com/): separate observations/reimports and conservative dedup; use open-source parser structures as compatibility evidence, not a dependency on paid integrations.
- [SysReptor](https://docs.sysreptor.com/): structured findings/templates; reporting remains a later priority. Paid feature availability is not assumed.

These references inform the stage boundaries, not promises of equivalent features or license compatibility for copied code. No third-party implementation is copied.

## Follow-up delivery: 0.7.0

The methodology/guided-sequence subset of stage 2 is now implemented and verified: explicit four-state coverage, source links, saved ordered actions, preview, per-step launch into the existing queue, stop/history, scope checks through actual process start and portable run references. [Usage and remaining stage boundaries](METHODOLOGIES.md) · [Package and screenshots](BUILD-0.7.0.md). The crawler, live-domain expansion and unattended orchestration are not part of this delivery.
