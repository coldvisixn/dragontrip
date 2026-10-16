import json
from pathlib import Path
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from dragontrip.app import create_app
from dragontrip.db import Credential, Node, Scan, Configuration, database
from conftest import TOKEN


def project(client, name="Lab"):
    return client.post("/projects", json={"name": name}).json()["id"]


def node(client, pid, label="Manual object"):
    response = client.post(f"/projects/{pid}/nodes", json={"label": label})
    assert response.status_code == 201
    return response.json()


def test_custom_content_and_relationships_survive_reingestion(client, app, tmp_path):
    from dragontrip.graph import ingest

    pid = project(client)
    first, second = node(client, pid), node(client, pid)
    assert (first["x"], first["y"]) != (second["x"], second["y"])
    content = {
        "label": "Review admin endpoint",
        "category": "task",
        "description": "Why this matters\nNext steps",
        "status": "investigating",
        "tags": ["web", "follow-up"],
    }
    path = f"/projects/{pid}/nodes/{first['id']}"
    assert client.put(path, json=content).status_code == 200
    assert client.put(path + "/position", json={"x": 718, "y": 315}).status_code == 200
    edge = client.post(
        f"/projects/{pid}/edges", json={"source": first["id"], "target": second["id"]}
    ).json()
    ep = f"/projects/{pid}/edges/{edge['id']}"
    assert (
        client.put(ep, json={"kind": "Investigate authentication"}).status_code == 200
    )
    with app.state.sessions() as db:
        scan = Scan(
            id="observation", project_id=pid, target="127.0.0.1", status="completed"
        )
        db.add(scan)
        db.flush()
        ingest(db, scan, [{"ip": "127.0.0.1", "state": "up", "services": []}])
        db.commit()
    data = client.get(f"/projects/{pid}").json()
    saved = next(n for n in data["nodes"] if n["id"] == first["id"])
    assert (
        saved["label"] == content["label"]
        and saved["attrs"]["description"] == content["description"]
    )
    assert saved["attrs"]["tags"] == content["tags"] and saved["x"] == 718
    assert (
        next(e for e in data["edges"] if e["id"] == edge["id"])["kind"]
        == "Investigate authentication"
    )
    host = next(n for n in data["nodes"] if n["kind"] == "host")
    assert (
        client.put(f"/projects/{pid}/nodes/{host['id']}", json=content).status_code
        == 403
    )
    other = project(client, "Other")
    assert (
        client.put(f"/projects/{other}/nodes/{first['id']}", json=content).status_code
        == 404
    )
    for invalid in [
        {"label": " "},
        {"label": "x", "tags": ["x" * 31]},
        {"label": "x", "category": "service"},
        {"label": "x", "status": "open"},
    ]:
        assert client.put(path, json=invalid).status_code == 422


@pytest.mark.parametrize("kind", ["note", "finding", "path"])
def test_knowledge_crud_isolation_missing_references_and_restart(
    client, app, tmp_path, kind
):
    pid, other = project(client), project(client, "Other")
    local, foreign = node(client, pid), node(client, other)
    with app.state.sessions() as db:
        db.add(
            Scan(id="evidence", project_id=pid, target="127.0.0.1", status="completed")
        )
        db.commit()
    content = {
        "body": "Observed behavior and reasoning",
        "node_ids": [local["id"]],
        "scan_ids": ["evidence"],
        "severity": "high",
        "remediation": "Restrict access",
        "steps": (
            [{"node_id": local["id"], "action": "Check boundary", "status": "planned"}]
            if kind == "path"
            else []
        ),
    }
    base = f"/projects/{pid}/knowledge"
    body = {"kind": kind, "title": "Investigation 100%", "content": content}
    response = client.post(base, json=body)
    assert response.status_code == 201, response.text
    saved = response.json()
    kp = base + "/" + saved["id"]
    assert len(client.get(base, params={"kind": kind, "q": "reasoning"}).json()) == 1
    assert len(client.get(base, params={"kind": kind, "q": "%"}).json()) == 1
    assert client.get(base, params={"kind": kind, "q": "unmatched"}).json() == []
    assert client.put(kp, json={**body, "title": "Edited title"}).status_code == 200
    assert (
        client.put(f"/projects/{other}/knowledge/{saved['id']}", json=body).status_code
        == 404
    )
    assert (
        client.delete(f"/projects/{other}/knowledge/{saved['id']}").status_code == 404
    )
    assert (
        client.post(
            base, json={**body, "content": {**content, "node_ids": [foreign["id"]]}}
        ).status_code
        == 422
    )
    assert (
        client.post(
            base, json={**body, "content": {**content, "scan_ids": ["missing-scan"]}}
        ).status_code
        == 422
    )
    if kind == "path":
        assert (
            client.post(
                base, json={**body, "content": {**content, "steps": []}}
            ).status_code
            == 422
        )
        assert (
            client.post(
                base,
                json={
                    **body,
                    "content": {
                        **content,
                        "steps": [{"node_id": foreign["id"], "action": "x"}],
                    },
                },
            ).status_code
            == 422
        )
    assert client.delete(f"/projects/{pid}/nodes/{local['id']}").status_code == 200
    assert (
        client.put(kp, json=body).status_code == 200
    )  # Preserve known missing references.
    fresh = create_app(TOKEN, tmp_path, dev=True)
    with TestClient(
        fresh, base_url="http://127.0.0.1", headers={"Authorization": "Bearer " + TOKEN}
    ) as restarted:
        rows = restarted.get(base, params={"kind": kind}).json()
        assert rows[0]["content"]["node_ids"] == [local["id"]]
        assert rows[0]["content"]["scan_ids"] == ["evidence"]
        assert restarted.delete(kp).status_code == 200
        assert restarted.get(base, params={"kind": kind}).json() == []


def test_migration_upgrades_phase2_without_data_loss(tmp_path):
    engine, _ = database(tmp_path / "dragontrip.sqlite3")
    cfg = Config(str(Path("backend/alembic.ini").resolve()))
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "0002")
        conn.exec_driver_sql(
            "INSERT INTO projects(id,name,description) VALUES ('old','Existing','Keep')"
        )
        conn.exec_driver_sql(
            "INSERT INTO nodes(id,project_id,kind,label,attrs,x,y) VALUES ('old-node','old','custom','Legacy','{\"source\":\"manual\",\"state\":\"hypothesis\"}',311,455)"
        )
    engine.dispose()
    fresh = create_app(TOKEN, tmp_path)
    with TestClient(
        fresh, base_url="http://127.0.0.1", headers={"Authorization": "Bearer " + TOKEN}
    ) as c:
        data = c.get("/projects/old").json()
        assert data["nodes"][0]["x"] == 311 and data["nodes"][0]["label"] == "Legacy"
        assert c.get("/projects/old/knowledge?kind=note").json() == []


def test_vault_encryption_lock_edit_reveal_and_restart(client, app, tmp_path):
    pid, other = project(client), project(client, "Other")
    local, foreign = node(client, pid), node(client, other)
    base = f"/projects/{pid}/credentials"
    assert client.get(base).status_code == 423
    password = "test-master-password-123"
    assert client.post("/vault/setup", json={"password": password}).status_code == 200
    assert client.post("/vault/setup", json={"password": password}).status_code == 409
    secret = "private-secret-for-test"
    value = {
        "title": "Private admin",
        "username": "private-user",
        "secret": secret,
        "notes": "Private context",
        "node_ids": [local["id"]],
    }
    result = client.post(base, json=value)
    assert result.status_code == 201, result.text
    credential = result.json()
    cp = base + "/" + credential["id"]
    assert secret not in result.text and secret not in client.get(base).text
    assert client.get(cp).json()["secret"] == secret
    assert (
        client.get(f"/projects/{other}/credentials/{credential['id']}").status_code
        == 404
    )
    assert (
        client.post(base, json={**value, "node_ids": [foreign["id"]]}).status_code
        == 422
    )
    with app.state.sessions() as db:
        row = db.get(Credential, credential["id"])
        ciphertext = row.ciphertext
        for private in [
            secret,
            value["title"],
            value["username"],
            value["notes"],
            password,
        ]:
            assert private not in row.ciphertext
            assert private not in db.get(Configuration, "vault").value
    assert (
        client.put(
            cp,
            json={
                "title": "Renamed",
                "username": "new-user",
                "node_ids": [local["id"]],
            },
        ).status_code
        == 200
    )
    assert client.get(cp).json()["secret"] == secret
    with app.state.sessions() as db:
        assert db.get(Credential, credential["id"]).ciphertext != ciphertext
    details = client.get(f"/projects/{pid}").text
    assert (
        secret not in details
        and "Private admin" not in details
        and "private-user" not in details
    )
    assert client.post("/vault/lock").status_code == 200
    assert client.get(cp).status_code == 423
    assert client.delete(cp).status_code == 423
    assert client.post("/vault/unlock", json={"password": password}).status_code == 200
    app.state.vault.used -= 601
    assert not client.get("/vault").json()["unlocked"]
    assert app.state.vault.key is None
    fresh = create_app(TOKEN, tmp_path)
    with TestClient(
        fresh, base_url="http://127.0.0.1", headers={"Authorization": "Bearer " + TOKEN}
    ) as c:
        assert not c.get("/vault").json()["unlocked"]
        assert c.post("/vault/unlock", json={"password": password}).status_code == 200
        assert c.get(cp).json()["secret"] == secret
        assert c.delete(cp).status_code == 200


def test_vault_wrong_password_and_ciphertext_tampering(client, app):
    pid = project(client)
    assert (
        client.post(
            "/vault/setup", json={"password": "correct-password-123"}
        ).status_code
        == 200
    )
    base = f"/projects/{pid}/credentials"
    credential = client.post(base, json={"title": "Test", "secret": "value"}).json()
    cid = credential["id"]
    assert client.post("/vault/lock").status_code == 200
    assert (
        client.post(
            "/vault/unlock", json={"password": "incorrect-password"}
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/vault/unlock", json={"password": "correct-password-123"}
        ).status_code
        == 429
    )
    app.state.vault.retry_after = 0
    assert (
        client.post(
            "/vault/unlock", json={"password": "correct-password-123"}
        ).status_code
        == 200
    )
    with app.state.sessions() as db:
        row = db.get(Credential, cid)
        import base64

        raw = bytearray(base64.b64decode(row.ciphertext))
        raw[-1] ^= 1
        row.ciphertext = base64.b64encode(raw).decode()
        db.commit()
    assert client.get(base + "/" + cid).status_code == 409


def test_vault_ciphertext_is_bound_to_record_identity(client, app):
    pid = project(client)
    assert (
        client.post(
            "/vault/setup", json={"password": "binding-test-password"}
        ).status_code
        == 200
    )
    base = f"/projects/{pid}/credentials"
    first = client.post(base, json={"title": "First", "secret": "one"}).json()
    second = client.post(base, json={"title": "Second", "secret": "two"}).json()
    with app.state.sessions() as db:
        db.get(Credential, second["id"]).ciphertext = db.get(
            Credential, first["id"]
        ).ciphertext
        db.commit()
    assert client.get(base + "/" + second["id"]).status_code == 409


def test_vault_purges_idle_key_without_an_api_request(client, app):
    import time

    assert (
        client.post(
            "/vault/setup", json={"password": "expiry-test-password"}
        ).status_code
        == 200
    )
    app.state.vault.used -= 601
    deadline = time.monotonic() + 2
    while app.state.vault.key is not None and time.monotonic() < deadline:
        time.sleep(0.05)
    assert app.state.vault.key is None
