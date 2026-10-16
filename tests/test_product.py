import hashlib
import io
import json
import zipfile
from pathlib import Path
import pytest
from PIL import Image
from dragontrip.db import Scan, Node, Credential


def new_project(client):
    return client.post(
        "/projects", json={"name": "Portable lab", "description": "Local test data"}
    ).json()["id"]


def png():
    buffer = io.BytesIO()
    Image.new("RGB", (30, 20), "#7188af").save(buffer, format="PNG")
    return buffer.getvalue()


def rewrite_archive(data, transform, files=None):
    with zipfile.ZipFile(io.BytesIO(data)) as source:
        manifest = json.loads(source.read("manifest.json"))
        transform(manifest)
        entries = {
            name: source.read(name)
            for name in source.namelist()
            if name != "manifest.json"
        }
    entries.update(files or {})
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as destination:
        destination.writestr("manifest.json", json.dumps(manifest))
        for name, value in entries.items():
            destination.writestr(name, value)
    return output.getvalue()


def test_attachment_validation_scoping_integrity_and_references(
    client, app, tmp_path, monkeypatch
):
    pid, other = new_project(client), new_project(client)
    data = png()
    base = f"/projects/{pid}/attachments"
    uploaded = client.post(base, files={"file": ("../../proof.png", data, "image/png")})
    assert uploaded.status_code == 201, uploaded.text
    item = uploaded.json()
    assert item["filename"] == "proof.png"
    assert item["sha256"] == hashlib.sha256(data).hexdigest()
    assert (tmp_path / "attachments" / item["id"]).stat().st_mode & 0o777 == 0o600
    assert client.get(base + "/" + item["id"] + "/content").content == data
    assert (
        client.get(f"/projects/{other}/attachments/{item['id']}/content").status_code
        == 404
    )
    assert (
        client.post(
            base,
            files={"file": ("x.svg", b'<svg onload="alert(1)"/>', "image/svg+xml")},
        ).status_code
        == 422
    )
    assert (
        client.post(
            base, files={"file": ("x.png", b"not an image", "image/png")}
        ).status_code
        == 422
    )
    assert (
        client.post(
            base, files={"file": ("x.html", b"<script>bad</script>", "text/html")}
        ).status_code
        == 422
    )
    assert (
        client.post(
            base, files={"file": ("x.txt", b"\xff\xfe", "text/plain")}
        ).status_code
        == 422
    )
    foreign = client.post(
        f"/projects/{other}/knowledge",
        json={
            "kind": "note",
            "title": "x",
            "content": {"attachment_ids": [item["id"]]},
        },
    )
    assert foreign.status_code == 422
    knowledge = client.post(
        f"/projects/{pid}/knowledge",
        json={
            "kind": "note",
            "title": "Screenshot note",
            "content": {"body": "**Proof**", "attachment_ids": [item["id"]]},
        },
    ).json()
    assert client.delete(base + "/" + item["id"]).status_code == 409
    assert client.get(f"/projects/{pid}/knowledge/{knowledge['id']}").json()["content"][
        "attachment_ids"
    ] == [item["id"]]
    monkeypatch.setenv("XDG_DOWNLOAD_DIR", str(tmp_path / "downloads"))
    first = client.post(base + "/" + item["id"] + "/export").json()
    second = client.post(base + "/" + item["id"] + "/export").json()
    assert first["path"] != second["path"]
    assert Path(first["path"]).read_bytes() == data
    assert Path(first["path"]).stat().st_mode & 0o777 == 0o600
    path = tmp_path / "attachments" / item["id"]
    path.write_bytes(b"changed")
    assert client.get(base + "/" + item["id"] + "/content").status_code == 409
    assert client.post(f"/projects/{pid}/archive", json={}).status_code == 409
    assert (
        client.delete(f"/projects/{pid}/knowledge/{knowledge['id']}").status_code == 200
    )
    assert client.delete(base + "/" + item["id"]).status_code == 200
    assert not path.exists()


def test_archive_roundtrip_graph_scans_evidence_knowledge_vault_and_view(
    client, app, tmp_path, monkeypatch
):
    pid = new_project(client)
    manual = client.post(
        f"/projects/{pid}/nodes",
        json={
            "label": "Keep coordinates",
            "description": "Context",
            "x": 345,
            "y": 678,
        },
    ).json()
    observed_id = f"{pid}:host:127.0.0.1"
    sid = "d9bd7435-74d1-4f7a-bbf7-f105c2bfdf8c"
    with app.state.sessions() as db:
        db.add(
            Scan(
                id=sid,
                project_id=pid,
                target="127.0.0.1",
                status="completed",
                command='["nmap", "127.0.0.1"]',
                output="Historical output",
            )
        )
        db.add(
            Node(
                id=observed_id,
                project_id=pid,
                label="127.0.0.1",
                kind="host",
                attrs=json.dumps(
                    {"scan_id": sid, "source": "nmap", "evidence_xml": "<host/>"}
                ),
                x=10,
                y=20,
            )
        )
        db.commit()
    xml = b"<nmaprun><host/></nmaprun>"
    (tmp_path / "artifacts" / (sid + ".xml")).write_bytes(xml)
    client.post(
        f"/projects/{pid}/edges", json={"source": manual["id"], "target": observed_id}
    )
    attachment = client.post(
        f"/projects/{pid}/attachments",
        files={"file": ("proof.png", png(), "image/png")},
    ).json()
    body = {
        "kind": "path",
        "title": "Preserved path",
        "content": {
            "body": "# Context",
            "node_ids": [manual["id"]],
            "scan_ids": [sid],
            "attachment_ids": [attachment["id"]],
            "steps": [{"node_id": observed_id, "action": "Verify observation"}],
        },
    }
    assert client.post(f"/projects/{pid}/knowledge", json=body).status_code == 201
    view = {"x": 100, "y": -80, "zoom": 0.75}
    assert client.put(f"/projects/{pid}/view", json=view).status_code == 200
    assert (
        client.post(
            "/vault/setup", json={"password": "local-master-password"}
        ).status_code
        == 200
    )
    credential = {
        "title": "Private account",
        "username": "test-user",
        "secret": "test-private-secret",
        "node_ids": [manual["id"]],
    }
    assert (
        client.post(f"/projects/{pid}/credentials", json=credential).status_code == 201
    )
    options = {"include_credentials": True, "password": "portable-password-123"}
    exported = client.post(f"/projects/{pid}/archive", json=options)
    assert exported.status_code == 200, exported.text[:200]
    data = exported.content
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        assert "Private account" not in archive.read("manifest.json").decode()
        assert "test-private-secret" not in archive.read("vault.json").decode()
        assert archive.read("artifacts/" + sid + ".xml") == xml
    assert (
        client.post(
            "/imports",
            files={"file": ("lab.dtproj", data)},
            data={"password": "incorrect-password"},
        ).status_code
        == 422
    )
    imported = client.post(
        "/imports",
        files={"file": ("lab.dtproj", data)},
        data={"password": options["password"]},
    )
    assert imported.status_code == 201, imported.text
    new_pid = imported.json()["id"]
    assert new_pid != pid
    detail = client.get(f"/projects/{new_pid}").json()
    assert len(detail["nodes"]) == 2 and len(detail["edges"]) == 1
    custom = next(node for node in detail["nodes"] if node["kind"] == "custom")
    host = next(node for node in detail["nodes"] if node["kind"] == "host")
    assert custom["x"] == 345 and custom["y"] == 678
    assert host["id"] == f"{new_pid}:host:127.0.0.1"
    assert (
        client.post(
            f"/projects/{new_pid}/edges",
            json={"source": custom["id"], "target": host["id"]},
        ).status_code
        == 201
    )
    assert len(client.get(f"/projects/{new_pid}").json()["edges"]) == 1
    new_scan = detail["scans"][0]["id"]
    assert new_scan != sid and host["attrs"]["scan_id"] == new_scan
    assert client.get("/scans/" + new_scan + "/artifact").content == xml
    path = client.get(f"/projects/{new_pid}/knowledge?kind=path").json()[0]
    assert path["content"]["node_ids"] == [custom["id"]]
    assert path["content"]["scan_ids"] == [new_scan]
    assert path["content"]["steps"][0]["node_id"] == host["id"]
    assert path["content"]["attachment_ids"][0] != attachment["id"]
    assert client.get(f"/projects/{new_pid}/view").json() == view
    credentials = client.get(f"/projects/{new_pid}/credentials").json()
    assert credentials[0]["node_ids"] == [custom["id"]]
    revealed = client.get(
        f"/projects/{new_pid}/credentials/{credentials[0]['id']}"
    ).json()
    assert revealed["secret"] == credential["secret"]
    assert not app.state.manager.tasks
    monkeypatch.setenv("XDG_DOWNLOAD_DIR", str(tmp_path / "downloads"))
    saved = client.post(f"/projects/{pid}/export", json={}).json()
    assert Path(saved["path"]).is_file()
    assert (
        hashlib.sha256(Path(saved["path"]).read_bytes()).hexdigest() == saved["sha256"]
    )


def test_exports_require_quiet_project_and_unlocked_vault(client, app):
    pid = new_project(client)
    assert (
        client.post(
            f"/projects/{pid}/archive", json={"include_credentials": True}
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"/projects/{pid}/archive",
            json={"include_credentials": True, "password": "portable-password"},
        ).status_code
        == 423
    )
    with app.state.sessions() as db:
        db.add(Scan(project_id=pid, target="127.0.0.1", status="running"))
        db.commit()
    assert client.post(f"/projects/{pid}/archive", json={}).status_code == 409


def test_download_directory_uses_xdg_configuration(client, tmp_path, monkeypatch):
    pid = new_project(client)
    config = tmp_path / "xdg-config"
    config.mkdir()
    destination = tmp_path / "custom-downloads"
    (config / "user-dirs.dirs").write_text(f'XDG_DOWNLOAD_DIR="{destination}"\n')
    monkeypatch.delenv("XDG_DOWNLOAD_DIR", raising=False)
    monkeypatch.setenv("XDG_CONFIG_HOME", str(config))
    saved = client.post(f"/projects/{pid}/export", json={}).json()
    assert Path(saved["path"]).parent == destination


@pytest.mark.parametrize(
    "case",
    ["traversal", "checksum", "foreign-file", "bad-view", "duplicate", "version"],
)
def test_invalid_archives_leave_no_project_or_files(client, tmp_path, case):
    pid = new_project(client)
    item = client.post(
        f"/projects/{pid}/attachments",
        files={"file": ("proof.txt", b"proof", "text/plain")},
    ).json()
    data = client.post(f"/projects/{pid}/archive", json={}).content

    def change(manifest):
        if case == "checksum":
            manifest["files"]["attachments/" + item["id"]]["sha256"] = "0" * 64
        if case == "bad-view":
            manifest["view"] = {"x": 0, "y": 0, "zoom": 200}
        if case == "version":
            manifest["version"] = 999

    additions = (
        {"../outside": b"bad"}
        if case == "traversal"
        else {"artifacts/unknown.xml": b"bad"} if case == "foreign-file" else None
    )
    modified = rewrite_archive(data, change, additions)
    if case == "duplicate":
        output = io.BytesIO(modified)
        with zipfile.ZipFile(output, "a") as archive:
            archive.writestr("manifest.json", "{}")
        modified = output.getvalue()
    before = len(client.get("/projects").json())
    response = client.post("/imports", files={"file": ("bad.dtproj", modified)})
    assert response.status_code == 422, response.text
    assert len(client.get("/projects").json()) == before
    assert len(list((tmp_path / "attachments").iterdir())) == 1
    assert not (tmp_path / "outside").exists()


def test_settings_search_timeline_and_compact_graph(client, app):
    pid = new_project(client)
    node = client.post(
        f"/projects/{pid}/nodes",
        json={"label": "Unique boundary", "description": "searchable metadata"},
    ).json()
    knowledge = client.post(
        f"/projects/{pid}/knowledge",
        json={
            "kind": "note",
            "title": "Markdown",
            "content": {"body": "Unique boundary **reasoning**"},
        },
    ).json()
    other = new_project(client)
    assert (
        client.post(
            "/vault/setup", json={"password": "private-search-password"}
        ).status_code
        == 200
    )
    client.post(
        f"/projects/{pid}/credentials",
        json={"title": "Never indexed", "secret": "UniqueVaultSecret"},
    )
    result = client.get(
        f"/projects/{pid}/search", params={"q": "Unique boundary"}
    ).json()
    assert {row["kind"] for row in result["items"]} >= {"object", "knowledge"}
    assert (
        client.get(f"/projects/{pid}/search", params={"q": "UniqueVaultSecret"}).json()[
            "total"
        ]
        == 0
    )
    assert (
        client.get(f"/projects/{other}/search", params={"q": "reasoning"}).json()[
            "total"
        ]
        == 0
    )
    assert client.get(f"/projects/{pid}/search", params={"q": "%"}).json()["total"] == 0
    first = client.get(
        f"/projects/{pid}/search", params={"q": "Unique boundary", "limit": 1}
    ).json()
    second = client.get(
        f"/projects/{pid}/search",
        params={"q": "Unique boundary", "limit": 1, "offset": 1},
    ).json()
    assert first["items"][0]["id"] != second["items"][0]["id"]
    timeline = client.get(f"/projects/{pid}/timeline?limit=1").json()
    assert timeline["total"] >= 3 and len(timeline["items"]) == 1
    assert (
        client.get(f"/projects/{pid}/timeline?q=Credential").json()["items"][0][
            "message"
        ]
        == "Credential added to vault"
    )
    appearance = {
        "theme": "light",
        "accent": "cyan",
        "density": "compact",
        "reduced_motion": True,
        "graph_detail": "compact",
    }
    assert client.put("/settings/appearance", json=appearance).status_code == 200
    assert client.get("/settings").json()["appearance"] == appearance
    assert (
        client.put(
            "/settings/appearance", json={**appearance, "theme": "unknown"}
        ).status_code
        == 422
    )
    assert (
        client.put(
            "/settings/tools", json={"paths": {"nmap": "/nonexistent/nmap"}}
        ).status_code
        == 422
    )
    assert (
        client.put(
            f"/projects/{pid}/view", json={"x": 0, "y": 0, "zoom": -1}
        ).status_code
        == 422
    )
    with app.state.sessions() as db:
        row = db.get(Node, node["id"])
        attrs = json.loads(row.attrs)
        attrs["evidence_xml"] = "x" * 16000
        attrs["evidence_json"] = "y" * 16000
        row.attrs = json.dumps(attrs)
        db.commit()
    compact = client.get(f"/projects/{pid}?compact=true")
    full = client.get(f"/projects/{pid}/nodes/{node['id']}")
    assert "evidence_xml" not in compact.json()["nodes"][0]["attrs"]
    assert full.json()["attrs"]["evidence_xml"] == "x" * 16000
    assert len(compact.content) < len(full.content) / 10
    assert client.get(f"/projects/{other}/nodes/{node['id']}").status_code == 404


def test_valid_long_unicode_knowledge_and_json_request_budget(client):
    pid = new_project(client)
    body = {
        "kind": "finding",
        "title": "Длинное описание",
        "content": {"body": "я" * 12000, "remediation": "ф" * 6000},
    }
    response = client.post(f"/projects/{pid}/knowledge", json=body)
    assert response.status_code == 201, response.text
    assert response.json()["content"]["remediation"] == "ф" * 6000
    oversized = client.post(
        "/projects",
        content=b"x" * (256 * 1024 + 1),
        headers={"Content-Type": "application/json"},
    )
    assert oversized.status_code == 413


def test_knowledge_status_filter_applies_before_pagination(client, app):
    from dragontrip.db import Knowledge

    pid = new_project(client)
    with app.state.sessions() as db:
        db.add_all(
            [
                Knowledge(
                    project_id=pid,
                    kind="finding",
                    title=f"Finding {index}",
                    content=json.dumps(
                        {
                            "status": "confirmed" if index == 60 else "draft",
                            "body": "Review",
                        }
                    ),
                )
                for index in range(61)
            ]
        )
        db.commit()
    response = client.get(
        f"/projects/{pid}/knowledge",
        params={"kind": "finding", "status": "confirmed", "limit": 50},
    )
    assert response.status_code == 200
    assert [row["title"] for row in response.json()] == ["Finding 60"]
    assert (
        client.get(
            f"/projects/{pid}/knowledge",
            params={"kind": "finding", "status": "confirmed", "offset": 1},
        ).json()
        == []
    )
