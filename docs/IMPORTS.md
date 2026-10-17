# Scope, imports and web applications

This guide describes offline imports and web objects in the current 0.9.1 release. Imports preserve source observations; [linked research and recovery](HTB-WORKSPACE.md), [methodologies and recon sequences](METHODOLOGIES.md), and [finding retests](DELIVERY.md#build-a-finding) build on that evidence.

## Try the complete scenario

1. Create/open a project. Open **Targets & scope**. Include `app.htb`, `admin.htb` and optionally `10.10.10.0/24`; exclude any forbidden IP/domain. Save. Entries may be separated by lines, whitespace or commas.
2. In Burp HTTP history/site map, select relevant requests and use **Save items** to XML. Include requests/responses, preferably base64 encoded. Community and Professional have manual HTTP history; scanner issue reporting is a Professional feature. For issues, use **Export issue data** as XML, not an HTML report. See [PortSwigger context menu](https://portswigger.net/burp/documentation/desktop/tools/context-menu) and [report settings](https://portswigger.net/burp/documentation/desktop/running-scans/reporting/report-settings).
3. Open **Import results**, select the export and click **Preview import**. Review detected format, counts, new/existing objects and findings, per-record scope and warnings. Preview changes no project data. Unknown targets are skipped unless explicitly included for offline investigation; exclusions always win. Changing the file or unknown-target choice invalidates the preview. A changed scope/project membership requires a fresh preview.
4. Click **Import selected records**. Open **Web applications**, select an origin and an endpoint. Filter by method or URL. Inspect parameters, linked findings and imported observations. Expand an observation to see request/response text, then view or privately export the complete original source. Imported findings also expose their source observations on the Findings page.
5. Choose a note, finding or task in **Create linked record type**, then click **Create linked record** to attach manual context. Existing linked records remain available from the source. **Inspect in graph** exposes existing graph links, coordinate editing and other investigation actions. Applications/endpoints can also be added manually without sending requests.
6. Reimport the same file: the stored source is returned, with no new objects or observations. Import a later export to append observations. In Import results choose two same-format runs to compare added, changed, reobserved and not-observed objects. These categories describe those exports only; they never change finding status.
7. Export/import the project through **Projects → Project portability**. Scope, source files, imports, observations, findings and object links transfer with remapped IDs. New archives use format **v5**, including research drafts/recovery and retest history; imports read **v1–v5**. Older apps reject v5. Review ordinary evidence and retained draft text before sharing; they are not vault-encrypted.

For a reproducible fixture exercise, use files in `tests/fixtures/imports/`. They are explicit test data, never injected into user projects. The two vhosts in those fixtures share `10.10.10.10` but remain separate applications; GET and POST at the same URL remain separate endpoints.

## Supported formats and actual coverage

| Format | Created entities | Limits and omissions |
| --- | --- | --- |
| Nmap XML `<nmaprun>` | IP hosts, open TCP/UDP/SCTP services, exported hostname associations | Multi-host IPv4/IPv6 exports accepted. Closed ports, NSE/OS detail remain in original evidence. Incomplete/failed exports warn and never imply absence/fix. |
| Burp XML `<items>` | Domains/exported IP associations, origins, method-specific endpoints, query/form/top-level JSON parameter names, immutable request/response observations | Only selected exported items. No vulnerabilities or unexported sitemap are inferred. Cookies/headers stay in messages. Nested JSON and multipart parameter models are deferred. |
| Burp XML `<issues>` | Origins/endpoints present in issues, findings, included request/response observations | No whole sitemap. Missing method remains `UNKNOWN`. Severity/confidence, description/remediation preserved; HTML descriptions remain source text. Collaborator events, traces and classification details remain in the original XML; they are not separate structured entities. |
| Nuclei JSONL | HTTP origins/endpoints, findings keyed by template and matcher, included messages/classification/extracted results | Non-HTTP and unsuccessful results are skipped with warnings. Missing requests leave method `UNKNOWN`. There is no built-in Nuclei runner. |

Binary `.burp` project files, Burp HTML/CSV, HAR, Nessus and other formats are unsupported. No extension is necessary for saved-items XML; a future Montoya exporter could supply additional structure if needed. Burp was not installed/run in this environment: compatibility was checked against actual public export structures and owned fixtures, not every Burp release/edition.

Public compatibility examples inspected: [ProjectDiscovery Burp saved-items fixture](https://github.com/projectdiscovery/nuclei/blob/dev/pkg/input/formats/testdata/burp.xml), [DefectDojo Burp issue fixture](https://github.com/DefectDojo/sample-scan-files/blob/master/burp/burpvulns_v2_1_02.xml), and [Nuclei ResultEvent schema](https://github.com/projectdiscovery/nuclei/blob/dev/pkg/output/output.go). The sample files are not copied into the product.

## Identity and scope rules

Origins use lowercase scheme/IDNA hostname and omit default ports. Resolved IP never defines application identity. Endpoint IDs include the method and exact normalized URL; path case, escaping, query order, duplicate parameter names and values are retained, while fragments are removed. This intentionally keeps more endpoints rather than conflating security-relevant variants. There is no guessed route-template deduplication.

An exact domain includes only that domain. `*.example.htb` includes descendants, not the apex. CIDR is stored canonically without expanding it to thousands of target rows. Origin rules apply to that scheme/host/port. Exclusions override inclusions, including exported IP exclusions. An included IP does not implicitly authorize every domain exported on it. No DNS lookups, hosts edits, network verification or DNS resolution assumptions occur during import/manual creation.

Live recon adapters accept a single IPv4 or IPv4 origin. Scope is checked at submission, again after tool discovery, and immediately before a queued process starts. Individual scans with empty scope retain their explicit authorization checkbox; saved recon workflows require explicit included scope. Live hostname/CIDR/IPv6 dispatch, DNS-aware redirect enforcement and a crawler are not implemented. Offline domain/IPv6 support does not enable those features.

Existing web recon now also creates application/GET-endpoint views, while keeping old URL IDs and their links. Old persisted URL nodes are not retroactively guessed into endpoints. The graph overview collapses endpoint nodes; use Web applications for a windowed endpoint list, or the endpoint type filter for explicit graph detail. Existing graph positions are retained. The project overview still loads graph metadata together (10,000-object project budget); this is not server-side lazy graph loading.

## Evidence and deduplication

Each applied source has a SHA-256, original attachment and import run. Each observation records a source locator (`item`, `issue/requestresponse`, Nmap host/port, or JSONL line), fingerprint, object and optional finding reference. Observations and source files are retained. Imported-source attachments and imported findings cannot be deleted while they own historical evidence; dismiss a false positive through the finding status instead. **Record a retest** appends a manual **Fixed**, **Still present** or **Inconclusive** decision with a required note, preserving history. Import comparisons never record a retest or resolve a finding automatically. [Retest behavior](DELIVERY.md#build-a-finding).

Exact file bytes are idempotent per project. A repeated file stays idempotent after scope changes; export a new selection/file to add previously skipped content. Same-format finding matching is deliberately conservative: Burp uses issue type/name/serial/location and endpoint, Nuclei uses template/matcher and endpoint. Changed Burp serials can create candidate duplicates. Cross-tool matches and manual ambiguous merges are deferred; this stage does not silently join distinct problems. Existing finding text/status/remediation, notes and graph coordinates survive subsequent imports.

Source files can contain session cookies, tokens and passwords. They are ordinary private project evidence, not vault-encrypted content. Portable archives contain them. Message previews are limited to 32,000 characters per request/response; source-file preview to 64,000 characters. Full original bytes remain exportable with integrity validation. Source HTML is never executed in a browser frame.

Input limits: 10 MiB/file, 5,000 observations/file, 1 MiB/parsed record, 500 imported sources, 50,000 observations and 24 MiB observation metadata/project. Existing portable budgets still apply: 10,000 objects, 50,000 edges, 5,000 knowledge records, 500 attachments/128 MiB evidence and 32 MiB total manifest. Export refuses oversized snapshots rather than truncating history. Split larger engagements before those budgets are exceeded.

## Verification commands

```bash
.venv/bin/python -m pytest -q
npm test
npm run build
# In a separate terminal, start the frontend:
npm run dev
# Real API + Chromium, isolated data:
node scripts/research-smoke.cjs
# Repeat against the frozen sidecar after bundling:
DRAGONTRIP_TEST_BACKEND=backend/dist/dragontrip-backend/dragontrip-backend node scripts/research-smoke.cjs
# Actual installed Tauri/WebKit and process-restart persistence:
xvfb-run -a dbus-run-session -- .venv/bin/python scripts/native-research-smoke.py /usr/bin/dragontrip
```

Native automation requires the WebKitWebDriver/tauri-driver environment described in [development setup](DEVELOPMENT.md). [Current release verification](BUILD-0.9.1.md) records the successful build/native checks and installed-Kali publication gate. [BUILD-0.6.0](BUILD-0.6.0.md) preserves the original import-stage implementation record.
