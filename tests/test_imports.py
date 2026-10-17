"""Scope, real export structures, transactional imports and portable provenance."""

import base64
import io
import json
from pathlib import Path
from types import SimpleNamespace
import zipfile
import pytest
from dragontrip.db import Node, Project, database
from dragontrip.import_formats import parse_source, MAX_SOURCE
from dragontrip.scope import web_url, canonical_rule, classify


def items(entries):
    content = ""
    for url, method, response in entries:
        request = base64.b64encode(
            f"{method} /login?q=1 HTTP/1.1\r\nHost: app.htb\r\nContent-Type: application/x-www-form-urlencoded\r\n\r\nuser=lab&pass=test".encode()
        ).decode()
        content += f'<item><url>{url}</url><host ip="10.10.10.10">app.htb</host><method>{method}</method><request base64="true">{request}</request><status>200</status><response>{response}</response></item>'
    return (
        '<?xml version="1.0"?><!DOCTYPE items [<!ELEMENT items (item*)>]><items>'
        + content
        + "</items>"
    ).encode()


BURP = items(
    [
        ("http://app.htb/login?q=1", "GET", "first"),
        ("http://app.htb/login?q=1", "POST", "first"),
        ("http://admin.htb/login", "GET", "admin"),
    ]
)
ISSUE = b"""<?xml version="1.0"?><!DOCTYPE issues [<!ELEMENT issues (issue*)>]><issues><issue><serialNumber>12</serialNumber><type>1234</type><name>Missing header</name><host ip="10.10.10.10">http://app.htb</host><path>/login</path><location>/login [header]</location><severity>Low</severity><confidence>Firm</confidence><issueDetail>original description</issueDetail><remediationBackground>add header</remediationBackground><requestresponse><request base64="false">GET /login HTTP/1.1\r\nHost: app.htb\r\n\r\n</request><response>HTTP/1.1 200 OK\r\n\r\noriginal</response></requestresponse></issue></issues>"""
NMAP = b"""<nmaprun><host><status state="up"/><address addr="10.10.10.10" addrtype="ipv4"/><hostnames><hostname name="app.htb"/></hostnames><ports><port protocol="tcp" portid="80"><state state="open"/><service name="http" product="fixture"/></port></ports></host><host><address addr="10.10.10.11" addrtype="ipv4"/></host><runstats><finished exit="success"/></runstats></nmaprun>"""


def project(client):
    return client.post("/projects", json={"name": "Import test"}).json()["id"]


def scope(client, pid, included=("app.htb", "admin.htb", "10.10.10.0/24"), excluded=()):
    response = client.put(
        f"/projects/{pid}/scope",
        json={
            "rules": [{"value": v, "mode": "include"} for v in included]
            + [{"value": v, "mode": "exclude"} for v in excluded]
        },
    )
    assert response.status_code == 200, response.text


def preview(client, pid, data, unknown=False):
    return client.post(
        f"/projects/{pid}/tool-import/preview",
        files={"file": ("export.xml", data)},
        data={"include_unknown": str(unknown).lower()},
    )


def apply(client, pid, data, unknown=False):
    plan = preview(client, pid, data, unknown)
    assert plan.status_code == 200, plan.text
    result = client.post(
        f"/projects/{pid}/tool-import/apply",
        files={"file": ("export.xml", data)},
        data={
            "preview_token": plan.json()["preview_token"],
            "include_unknown": str(unknown).lower(),
        },
    )
    assert result.status_code == 200, result.text
    return result.json()


def test_url_and_scope_are_conservative():
    assert web_url("HTTP://APP.HTB:80/A%2fb?a=1&a=2#f") == (
        "http://app.htb",
        "http://app.htb/A%2fb?a=1&a=2",
        "app.htb",
    )
    assert web_url("https://пример.рф/")[2] == "xn--e1afmkfd.xn--p1ai"
    assert web_url("http://[::1]:80/x")[0] == "http://[::1]"
    assert canonical_rule("10.10.10.13/24") == "10.10.10.0/24"
    for value in [
        "http://u:p@app.htb/",
        "file:///tmp/x",
        "http://app.htb/\nx",
        "http://app.htb\\other/",
        "http://app.htb:99999",
    ]:
        with pytest.raises(ValueError):
            web_url(value)
    rules = [
        SimpleNamespace(mode="include", value="10.10.10.0/24"),
        SimpleNamespace(mode="include", value="*.app.htb"),
        SimpleNamespace(mode="exclude", value="bad.app.htb"),
    ]
    assert classify(rules, "http://app.htb/", "10.10.10.10") == "unknown"
    assert classify(rules, "http://ok.app.htb/") == "included"
    assert classify(rules, "http://bad.app.htb/") == "excluded"
    assert classify(rules, "http://app.htb.evil/") == "unknown"
    rules.append(SimpleNamespace(mode="exclude", value="10.10.10.10"))
    assert classify(rules, "http://ok.app.htb/", "10.10.10.10") == "excluded"
    assert (
        classify(
            [SimpleNamespace(mode="include", value="https://app.htb")],
            "http://app.htb/",
        )
        == "unknown"
    )


def test_preview_no_mutation_vhosts_methods_and_parameters(client, app):
    pid = project(client)
    scope(client, pid)
    plan = preview(client, pid, BURP).json()
    assert plan["format"] == "burp-items"
    assert plan["summary"]["applications"] == 2
    assert plan["summary"]["endpoints"] == 3
    assert client.get(f"/projects/{pid}").json()["nodes"] == []
    assert client.get(f"/projects/{pid}/tool-imports").json() == []
    apply(client, pid, BURP)
    detail = client.get(f"/projects/{pid}").json()
    apps = [n for n in detail["nodes"] if n["kind"] == "application"]
    endpoints = [n for n in detail["nodes"] if n["kind"] == "endpoint"]
    assert {n["attrs"]["origin"] for n in apps} == {
        "http://app.htb",
        "http://admin.htb",
    }
    assert len(endpoints) == 3
    assert all("user" in n["attrs"]["parameters"] for n in endpoints)
    assert len([n for n in detail["nodes"] if n["kind"] == "host"]) == 1
    observations = client.get(f"/projects/{pid}/observations").json()
    assert observations["total"] == 3
    assert all(
        o["data"]["request"].startswith(("GET ", "POST "))
        for o in observations["items"]
    )
    aid = client.get(f"/projects/{pid}/tool-imports").json()[0]["attachment_id"]
    assert client.get(f"/projects/{pid}/attachments/{aid}/content").content == BURP
    assert client.delete(f"/projects/{pid}/attachments/{aid}").status_code == 409
    assert app.state.manager.tasks == {}
    assert apply(client, pid, BURP)["duplicate"] is True
    assert len(client.get(f"/projects/{pid}").json()["nodes"]) == len(detail["nodes"])
    assert client.get(f"/projects/{pid}/observations").json()["total"] == 3


def test_scope_unknown_exclusion_and_stale_preview(client):
    pid = project(client)
    plan = preview(client, pid, BURP).json()
    assert plan["summary"]["selected"] == 0
    scope(client, pid, included=("app.htb",), excluded=("admin.htb",))
    stale = client.post(
        f"/projects/{pid}/tool-import/apply",
        files={"file": ("x.xml", BURP)},
        data={"preview_token": plan["preview_token"]},
    )
    assert stale.status_code == 409
    plan = preview(client, pid, BURP, True).json()
    assert plan["summary"]["excluded"] == 1
    assert plan["summary"]["selected"] == 2
    apply(client, pid, BURP, True)
    assert not any(
        n["attrs"].get("origin") == "http://admin.htb"
        for n in client.get(f"/projects/{pid}").json()["nodes"]
    )
    # Changing scope cannot make a repeated source silently add previously skipped data.
    scope(client, pid)
    assert apply(client, pid, BURP)["duplicate"]
    bad = client.put(
        f"/projects/{pid}/scope", json={"rules": [{"value": "https://app.htb/path"}]}
    )
    assert bad.status_code == 422
    assert len(client.get(f"/projects/{pid}/scope").json()) == 3


def test_findings_history_manual_edits_and_comparison(client):
    pid = project(client)
    scope(client, pid)
    first = apply(client, pid, ISSUE)
    finding = client.get(f"/projects/{pid}/knowledge?kind=finding").json()[0]
    endpoint = client.get(
        f"/projects/{pid}/web-findings",
        params={"node_id": finding["content"]["node_ids"][0]},
    ).json()
    assert endpoint[0]["id"] == finding["id"]
    nid = finding["content"]["node_ids"][0]
    assert (
        client.put(
            f"/projects/{pid}/nodes/{nid}/position", json={"x": 789, "y": 456}
        ).status_code
        == 200
    )
    content = {**finding["content"], "body": "manual correction", "status": "dismissed"}
    assert (
        client.put(
            f'/projects/{pid}/knowledge/{finding["id"]}',
            json={"kind": "finding", "title": "Reviewed", "content": content},
        ).status_code
        == 200
    )
    note = client.post(
        f"/projects/{pid}/knowledge",
        json={
            "kind": "note",
            "title": "Manual evidence",
            "content": {"body": "keep me", "node_ids": [nid]},
        },
    ).json()
    second = apply(
        client, pid, ISSUE.replace(b"original</response>", b"changed</response>")
    )
    assert len(client.get(f"/projects/{pid}/knowledge?kind=finding").json()) == 1
    updated = client.get(f'/projects/{pid}/knowledge/{finding["id"]}').json()
    assert (
        updated["content"]["body"] == "manual correction"
        and updated["content"]["status"] == "dismissed"
    )
    assert client.get(f"/projects/{pid}/nodes/{nid}").json()["x"] == 789
    assert (
        client.get(f'/projects/{pid}/knowledge/{note["id"]}').json()["content"]["body"]
        == "keep me"
    )
    observations = client.get(
        f"/projects/{pid}/observations", params={"finding_id": finding["id"]}
    ).json()
    assert observations["total"] == 2
    comparison = client.get(
        f'/projects/{pid}/tool-imports/{second["run_id"]}/compare/{first["run_id"]}'
    ).json()
    assert len(comparison["changed"]) == 1
    assert (
        client.delete(f'/projects/{pid}/knowledge/{finding["id"]}').status_code == 409
    )
    third = apply(
        client,
        pid,
        ISSUE.replace(b"/login", b"/other").replace(
            b"<serialNumber>12", b"<serialNumber>13"
        ),
    )
    comparison = client.get(
        f'/projects/{pid}/tool-imports/{third["run_id"]}/compare/{second["run_id"]}'
    ).json()
    assert len(comparison["not_observed"]) == 1 and len(comparison["added"]) == 1
    assert (
        client.get(f'/projects/{pid}/knowledge/{finding["id"]}').json()["content"][
            "status"
        ]
        == "dismissed"
    )


def test_nmap_and_nuclei_create_real_graph_and_links(client):
    pid = project(client)
    scope(client, pid)
    result = apply(client, pid, NMAP)
    graph = client.get(f"/projects/{pid}").json()
    service = next(n for n in graph["nodes"] if n["kind"] == "service")
    assert service["id"] == pid + ":host:10.10.10.10:tcp:80"
    assert service["attrs"]["product"] == "fixture"
    nuclei = json.dumps(
        {
            "template-id": "missing-header",
            "type": "http",
            "info": {
                "name": "Missing header",
                "severity": "low",
                "classification": {"cwe-id": ["CWE-16"]},
            },
            "matched-at": "http://app.htb/login",
            "ip": "10.10.10.10",
            "request": "GET /login HTTP/1.1\r\n\r\n",
            "response": "HTTP/1.1 200 OK\r\n\r\n",
        }
    ).encode()
    other = apply(client, pid, nuclei)
    assert len(client.get(f"/projects/{pid}/knowledge?kind=finding").json()) == 1
    assert (
        client.get(
            f'/projects/{pid}/tool-imports/{result["run_id"]}/compare/{other["run_id"]}'
        ).status_code
        == 422
    )
    other_pid = project(client)
    assert (
        client.get(
            f'/projects/{other_pid}/tool-imports/{result["run_id"]}/compare/{other["run_id"]}'
        ).status_code
        == 404
    )


@pytest.mark.parametrize(
    "data",
    [
        b"\x00\xffBurpProject",
        b"<html/>",
        b"<items><item>",
        b'{"unrelated":1}',
        b'<!DOCTYPE items [<!ENTITY leak SYSTEM "file:///etc/passwd">]><items>&leak;</items>',
        b'<items><item><url>http://app.htb/</url><request base64="true">!!!</request></item></items>',
        b"x" * (MAX_SOURCE + 1),
    ],
)
def test_invalid_source_is_atomic(client, data):
    pid = project(client)
    result = preview(client, pid, data, True)
    assert result.status_code == 422, result.text
    assert client.get(f"/projects/{pid}").json()["nodes"] == []
    assert client.get(f"/projects/{pid}/attachments").json() == []


def test_manual_web_objects_and_url_distinctions(client):
    pid = project(client)
    for url, method in [
        ("http://app.htb/A%2fb?q=1", "GET"),
        ("http://app.htb/A%2Fb?q=1", "GET"),
        ("http://app.htb/A%2fb?q=2", "GET"),
        ("http://app.htb/A%2fb?q=1", "POST"),
    ]:
        r = client.post(
            f"/projects/{pid}/web-objects",
            json={"url": url, "method": method, "ip": "10.10.10.10"},
        )
        assert r.status_code == 201, r.text
    assert (
        len(
            [
                n
                for n in client.get(f"/projects/{pid}").json()["nodes"]
                if n["kind"] == "endpoint"
            ]
        )
        == 4
    )
    assert client.get(f"/projects/{pid}/scan-history").json()["total"] == 0


def test_portable_archive_preserves_provenance_identity_and_reimport(client):
    pid = project(client)
    scope(client, pid)
    apply(client, pid, BURP)
    apply(client, pid, ISSUE)
    source = client.get(f"/projects/{pid}").json()
    archive = client.post(f"/projects/{pid}/archive", json={})
    assert archive.status_code == 200, archive.text
    with zipfile.ZipFile(io.BytesIO(archive.content)) as z:
        manifest = json.loads(z.read("manifest.json"))
        assert manifest["version"] == 5
        assert len(manifest["observations"]) == 4
    imported = client.post(
        "/imports", files={"file": ("copy.dtproj", archive.content, "application/zip")}
    )
    assert imported.status_code == 201, imported.text
    copy = imported.json()["id"]
    dest = client.get(f"/projects/{copy}").json()
    assert len(dest["nodes"]) == len(source["nodes"])
    assert len(dest["edges"]) == len(source["edges"])
    observations = client.get(f"/projects/{copy}/observations").json()
    assert observations["total"] == 4
    for o in observations["items"]:
        assert o["node_id"].startswith(copy + ":")
        assert (
            client.get(
                f'/projects/{copy}/attachments/{o["attachment_id"]}/content'
            ).status_code
            == 200
        )
        if o["finding_id"]:
            finding = client.get(f'/projects/{copy}/knowledge/{o["finding_id"]}').json()
            assert o["node_id"] in finding["content"]["node_ids"]
    assert len(client.get(f"/projects/{copy}/scope").json()) == 3
    assert apply(client, copy, BURP)["duplicate"]
    apply(
        client, copy, ISSUE.replace(b"original</response>", b"copy change</response>")
    )
    assert len(client.get(f"/projects/{copy}/knowledge?kind=finding").json()) == 1
    assert len(client.get(f"/projects/{copy}").json()["nodes"]) == len(source["nodes"])
    assert len(client.get(f"/projects/{copy}").json()["edges"]) == len(source["edges"])
    # A version-1 consumer must not accept new provenance as an old archive.
    manifest["version"] = 1
    bad = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(archive.content)) as old, zipfile.ZipFile(
        bad, "w"
    ) as new:
        for name in old.namelist():
            new.writestr(
                name,
                json.dumps(manifest) if name == "manifest.json" else old.read(name),
            )
    assert (
        client.post(
            "/imports", files={"file": ("bad.dtproj", bad.getvalue())}
        ).status_code
        == 422
    )


def test_upgrade_0004_and_restart_preserve_old_project(tmp_path):
    from alembic import command
    from alembic.config import Config
    from dragontrip.app import create_app
    from fastapi.testclient import TestClient

    root = tmp_path / "old"
    engine, sessions = database(root / "dragontrip.sqlite3")
    config = Config(str(Path(__file__).resolve().parents[1] / "backend/alembic.ini"))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "0004")
    with sessions() as db:
        db.add(Project(id="legacy", name="Old engagement"))
        db.flush()
        db.add(
            Node(
                id="legacy:host:10.0.0.1",
                project_id="legacy",
                kind="host",
                label="10.0.0.1",
                x=12,
                y=34,
                attrs='{"scan_id":"old"}',
            )
        )
        db.commit()
    engine.dispose()
    token = "a" * 64
    for _ in range(2):
        app = create_app(token, root, dev=True)
        with TestClient(
            app,
            base_url="http://127.0.0.1",
            headers={"Authorization": "Bearer " + token},
        ) as c:
            detail = c.get("/projects/legacy").json()
            assert (
                detail["nodes"][0]["x"] == 12
                and detail["nodes"][0]["attrs"]["scan_id"] == "old"
            )
            assert c.get("/projects/legacy/scope").json() == []


def test_empty_export_records_absence_without_resolving_findings(client):
    pid = project(client)
    scope(client, pid)
    first = apply(client, pid, ISSUE)
    empty = apply(client, pid, b"<issues/>")
    comparison = client.get(
        f'/projects/{pid}/tool-imports/{empty["run_id"]}/compare/{first["run_id"]}'
    ).json()
    assert len(comparison["not_observed"]) == 1
    assert (
        client.get(f"/projects/{pid}/knowledge?kind=finding").json()[0]["content"][
            "status"
        ]
        == "open"
    )


def test_import_never_launches_recon_and_scan_dispatch_enforces_scope(
    client, monkeypatch
):
    from dragontrip import recon

    def unexpected(*args, **kwargs):
        raise AssertionError("Import must not inspect or launch external tools")

    monkeypatch.setattr(recon, "discover", unexpected)
    pid = project(client)
    scope(client, pid, included=("app.htb",))
    apply(client, pid, ISSUE)
    response = client.post(
        f"/projects/{pid}/scans", json={"target": "127.0.0.1", "authorized": True}
    )
    assert response.status_code == 422
    assert "scope" in response.text


def test_ipv6_offline_scope_and_export(client):
    pid = project(client)
    scope(client, pid, included=("2001:db8::/32",))
    source = b'<nmaprun><host><address addr="2001:db8::1" addrtype="ipv6"/><ports><port protocol="tcp" portid="443"><state state="open"/><service name="https"/></port></ports></host><runstats><finished exit="success"/></runstats></nmaprun>'
    apply(client, pid, source)
    assert len(client.get(f"/projects/{pid}").json()["nodes"]) == 2
    archive = client.post(f"/projects/{pid}/archive", json={})
    assert (
        client.post(
            "/imports", files={"file": ("ipv6.dtproj", archive.content)}
        ).status_code
        == 201
    )


def test_old_v1_archive_remains_readable(client):
    pid = project(client)
    client.post(f"/projects/{pid}/nodes", json={"label": "Legacy manual note"})
    archive = client.post(f"/projects/{pid}/archive", json={}).content
    old = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(archive)) as src, zipfile.ZipFile(old, "w") as dst:
        for name in src.namelist():
            value = src.read(name)
            if name == "manifest.json":
                manifest = json.loads(value)
                manifest["version"] = 1
                for field in ("scope_rules", "import_runs", "observations"):
                    manifest.pop(field)
                value = json.dumps(manifest)
            dst.writestr(name, value)
    imported = client.post("/imports", files={"file": ("old.dtproj", old.getvalue())})
    assert imported.status_code == 201, imported.text
    assert (
        client.get("/projects/" + imported.json()["id"]).json()["nodes"][0]["label"]
        == "Legacy manual note"
    )


def test_nuclei_skips_unsuccessful_results_and_retains_classification():
    valid = {
        "template-id": "header",
        "type": "http",
        "info": {"name": "Header", "classification": {"cve-id": ["CVE-2020-0001"]}},
        "url": "https://app.htb/",
        "response": "HTTP/1.1 200 OK",
    }
    failed = {**valid, "matcher-status": False}
    network = {**valid, "url": "app.htb:22", "type": "tcp"}
    fmt, rows, warnings = parse_source(
        ("\n".join(json.dumps(r) for r in [valid, failed, network])).encode()
    )
    assert fmt == "nuclei-jsonl" and len(rows) == 1
    assert len(warnings) == 2
    assert rows[0]["finding"]["classification"]["cve-id"] == ["CVE-2020-0001"]
    assert rows[0]["data"]["method"] == "UNKNOWN"
