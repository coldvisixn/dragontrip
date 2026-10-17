"""Durable local research, source provenance and operator-controlled sequences."""

import io
import json
import time
import zipfile
from fastapi.testclient import TestClient
from dragontrip.app import create_app
from dragontrip.db import Knowledge, Scan, now
from conftest import TOKEN
from test_imports import BURP, apply, project, scope
from test_methodologies import workflow


def test_conflict_copy_idempotence_and_workspace_tombstones(client, tmp_path):
    pid = project(client)
    base = f"/projects/{pid}"
    body = {"kind": "note", "title": "Hypothesis", "content": {"body": "original"}}
    row = client.post(base + "/knowledge", json=body).json()
    path = base + "/knowledge/" + row["id"]
    changed = client.put(
        path,
        json={
            **body,
            "expected_updated": row["updated"],
            "content": {"body": "new saved text"},
        },
    ).json()
    assert changed["updated"] != row["updated"]
    conflict = client.put(
        path,
        json={
            **body,
            "expected_updated": row["updated"],
            "content": {"body": "my unsaved text"},
        },
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["current"] == changed
    # Retrying a successful PUT after a lost response reports success without clobbering data.
    retry = client.put(
        path,
        json={
            **body,
            "expected_updated": row["updated"],
            "content": {"body": "new saved text"},
        },
    )
    assert retry.status_code == 200 and retry.json()["updated"] == changed["updated"]
    copy = {
        **body,
        "request_id": "recover-my-text",
        "content": {"body": "my unsaved text"},
    }
    first = client.post(base + "/knowledge", json=copy).json()
    assert client.post(base + "/knowledge", json=copy).json()["id"] == first["id"]
    draft = base + "/workspace/draft:one"
    assert (
        client.put(draft, json={"revision": 10, "value": {"data": copy}}).status_code
        == 200
    )
    client.put(draft, json={"revision": 12, "closed": True, "value": {"data": copy}})
    for revision in [9, 11, 99]:
        assert client.put(
            draft, json={"revision": revision, "value": {"data": {"title": "late"}}}
        ).json()["closed"]
    other = project(client)
    assert client.get(f"/projects/{other}/workspace").json() == {}
    assert client.get(f"/projects/{other}/knowledge/{first['id']}").status_code == 404
    restarted = create_app(TOKEN, tmp_path, dev=True)
    with TestClient(
        restarted,
        base_url="http://127.0.0.1",
        headers={"Authorization": "Bearer " + TOKEN},
    ) as second:
        retained = second.get(base + "/workspace").json()["draft:one"]
        assert retained["value"]["data"]["content"]["body"] == "my unsaved text"
        assert retained["closed"]


def test_observation_record_task_links_reimport_and_archive(client):
    pid = project(client)
    base = f"/projects/{pid}"
    scope(client, pid)
    apply(client, pid, BURP)
    observation = client.get(base + "/observations").json()["items"][0]
    source = base + "/sources/observation/" + observation["id"] + "/records"
    note = client.post(source, json={"kind": "note"}).json()
    finding = client.post(source, json={"kind": "finding"}).json()
    assert finding["content"]["status"] == "draft"
    assert note["content"]["source"]["observation_id"] == observation["id"]
    assert note["content"]["attachment_ids"] == [observation["attachment_id"]]
    task = client.post(
        base + "/sources/record/" + note["id"] + "/records", json={"kind": "task"}
    ).json()
    assert task["content"]["record_ids"] == [note["id"]]
    assert task["content"]["status"] == "todo"
    assert task["content"]["node_ids"] == note["content"]["node_ids"]
    assert client.post(source, json={"kind": "note"}).json()["id"] == note["id"]
    apply(client, pid, BURP)
    # A differently encoded export of identical observations does not duplicate authored records.
    apply(client, pid, BURP + b"\n")
    observations = client.get(base + "/observations").json()["items"]
    same = [o for o in observations if o["node_id"] == observation["node_id"]]
    for o in same:
        assert (
            client.post(
                base + "/sources/observation/" + o["id"] + "/records",
                json={"kind": "note"},
            ).json()["id"]
            == note["id"]
        )
    other_observation = next(
        o for o in observations if o["node_id"] != observation["node_id"]
    )
    endpoint_note = client.post(
        base + "/sources/node/" + other_observation["node_id"] + "/records",
        json={"kind": "note"},
    ).json()
    assert (
        endpoint_note["content"]["source"]["import_id"] == other_observation["run_id"]
    )
    assert endpoint_note["content"]["attachment_ids"] == [
        other_observation["attachment_id"]
    ]
    assert endpoint_note["content"]["observation_ids"] == [other_observation["id"]]
    # Keep a dirty editor and a selected object in portable recovery data.
    client.put(
        base + "/workspace/selected_node",
        json={"revision": 1, "value": {"data": note["content"]["node_ids"][0]}},
    )
    client.put(
        base + "/workspace/draft:portable",
        json={
            "revision": 2,
            "value": {
                "data": {
                    "record_id": note["id"],
                    "content": note["content"],
                    "title": "unsaved reasoning",
                }
            },
        },
    )
    checks = client.post(
        base + "/methodologies",
        json={"template": "web", "node_id": note["content"]["node_ids"][0]},
    ).json()
    client.put(
        base + "/workspace/methodology_work",
        json={"revision": 3, "value": {"data": checks}},
    )
    client.put(
        base + "/workspace/methodology_node",
        json={"revision": 4, "value": {"data": checks["content"]["node_ids"][0]}},
    )
    archive = client.post(base + "/archive", json={})
    assert archive.status_code == 200, archive.text
    with zipfile.ZipFile(io.BytesIO(archive.content)) as z:
        assert json.loads(z.read("manifest.json"))["version"] == 5
    result = client.post("/imports", files={"file": ("lab.dtproj", archive.content)})
    assert result.status_code == 201, result.text
    imported = result.json()["id"]
    state = client.get(f"/projects/{imported}/workspace").json()
    imported_checks = state["methodology_work"]["value"]["data"]
    assert imported_checks["id"] != checks["id"]
    assert (
        client.get(
            f"/projects/{imported}/knowledge/{imported_checks['id']}"
        ).status_code
        == 200
    )
    assert (
        imported_checks["content"]["node_ids"][0]
        == state["methodology_node"]["value"]["data"]
    )
    draft = state["draft:portable"]["value"]["data"]
    assert draft["record_id"] != note["id"]
    assert draft["content"]["node_ids"][0] == state["selected_node"]["value"]["data"]
    obs_id = draft["content"]["source"]["observation_id"]
    records = client.get(
        f"/projects/{imported}/sources/observation/{obs_id}/records"
    ).json()
    assert draft["record_id"] in [r["id"] for r in records]
    assert (
        client.post(
            f"/projects/{imported}/sources/observation/{obs_id}/records",
            json={"kind": "note"},
        ).json()["id"]
        == draft["record_id"]
    )


def setup_run(client, app, monkeypatch):
    from dragontrip import recon

    async def discover(only=None, overrides=None):
        return [
            {
                "name": "fixture",
                "installed": True,
                "path": "/not-run",
                "version": "test",
            }
        ]

    monkeypatch.setattr(recon, "discover", discover)
    monkeypatch.setattr(app.state.manager, "enqueue", lambda sid: None)
    pid = project(client)
    scope(client, pid, included=("127.0.0.1",))
    w = workflow(client, pid)
    preview = client.post(f"/projects/{pid}/workflows/{w['id']}/preview").json()
    run = client.post(
        f"/projects/{pid}/workflows/{w['id']}/runs",
        json={"preview_token": preview["preview_token"]},
    ).json()
    return pid, run["id"]


def wait_run(client, base, predicate):
    for _ in range(100):
        data = client.get(base + "/preview").json()
        if predicate(data):
            return data
        time.sleep(0.02)
    raise AssertionError(data)


def test_sequence_pause_retry_cancel_and_history(client, app, monkeypatch):
    pid, rid = setup_run(client, app, monkeypatch)
    base = f"/projects/{pid}/workflow-runs/{rid}"
    preview = client.get(base + "/preview").json()
    assert (
        client.post(
            base + "/automatic",
            json={"preview_token": preview["preview_token"], "authorized": True},
        ).status_code
        == 200
    )
    first = wait_run(client, base, lambda p: len(p["scans"]) == 1)
    assert first["scans"][0]["status"] == "queued"
    assert client.post(base + "/pause").status_code == 200
    with app.state.sessions() as db:
        row = db.get(Scan, first["scans"][0]["id"])
        row.status, row.error = "failed", "Check could not complete"
        db.commit()
    preview = client.get(base + "/preview").json()
    assert preview["run"]["content"]["execution"] == "paused"
    retry = client.post(
        base + "/next",
        json={
            "preview_token": preview["preview_token"],
            "authorized": True,
            "retry": True,
        },
    )
    assert retry.status_code == 201, retry.text
    after = client.get(base + "/preview").json()
    assert len(after["history"]) == 2 and len(after["scans"]) == 1
    with app.state.sessions() as db:
        scan = db.get(Scan, retry.json()["id"])
        scan.status, scan.ended = "completed", now()
        assert json.loads(scan.options)["workflow_step"] == 1
        db.commit()
    preview = client.get(base + "/preview").json()
    assert (
        client.post(
            base + "/automatic",
            json={"preview_token": preview["preview_token"], "authorized": True},
        ).status_code
        == 200
    )
    wait_run(client, base, lambda p: len(p["scans"]) == 2)
    assert client.post(base + "/stop").status_code == 200
    stopped = client.get(base + "/preview").json()
    assert stopped["run"]["content"]["execution"] == "cancelled"
    assert len(stopped["history"]) == 3


def test_sequence_stops_on_scope_change_and_never_resumes_after_restart(
    client, app, monkeypatch, tmp_path
):
    pid, rid = setup_run(client, app, monkeypatch)
    base = f"/projects/{pid}/workflow-runs/{rid}"
    preview = client.get(base + "/preview").json()
    client.post(
        base + "/automatic",
        json={"preview_token": preview["preview_token"], "authorized": True},
    )
    first = wait_run(client, base, lambda p: len(p["scans"]) == 1)
    scope(client, pid, included=(), excluded=("127.0.0.1",))
    with app.state.sessions() as db:
        db.get(Scan, first["scans"][0]["id"]).status = "completed"
        db.commit()
    stopped = wait_run(
        client, base, lambda p: p["run"]["content"].get("execution") == "paused"
    )
    assert "changed" in stopped["run"]["content"]["stop_reason"]
    assert len(stopped["scans"]) == 1
    with app.state.sessions() as db:
        row = db.get(Knowledge, rid)
        content = json.loads(row.content)
        content["execution"] = (
            "running"  # A crashed process had operator authorization.
        )
        row.content = json.dumps(content)
        db.commit()
    restarted = create_app(TOKEN, tmp_path, dev=True)
    with TestClient(
        restarted,
        base_url="http://127.0.0.1",
        headers={"Authorization": "Bearer " + TOKEN},
    ) as second:
        restored = second.get(base + "/preview").json()
        assert restored["run"]["content"]["execution"] == "paused"
        assert len(restored["scans"]) == 1


def test_whole_sequence_completion_and_confirmation_preflight(client, app, monkeypatch):
    pid, rid = setup_run(client, app, monkeypatch)
    base = f"/projects/{pid}/workflow-runs/{rid}"

    def complete(sid):
        with app.state.sessions() as db:
            scan = db.get(Scan, sid)
            scan.status, scan.ended = "completed", now()
            db.commit()

    monkeypatch.setattr(app.state.manager, "enqueue", complete)
    preview = client.get(base + "/preview").json()
    assert (
        client.post(
            base + "/automatic",
            json={"preview_token": preview["preview_token"], "authorized": True},
        ).status_code
        == 200
    )
    finished = wait_run(
        client, base, lambda p: p["run"]["content"].get("execution") == "completed"
    )
    assert len(finished["scans"]) == 2
    assert all(s["status"] == "completed" for s in finished["scans"])
    # Authorization for a low-traffic step does not approve a later Full Scan.
    with app.state.sessions() as db:
        run = db.get(Knowledge, rid)
        content = json.loads(run.content)
        content.update(
            actions=[
                {"profile": "whatweb", "target": "http://127.0.0.1:8080/", "words": []},
                {"profile": "full", "target": "127.0.0.1", "words": []},
            ],
            scan_ids=[],
            step_scan_ids=[],
            execution="paused",
        )
        run.content = json.dumps(content)
        db.commit()
    preview = client.get(base + "/preview").json()
    response = client.post(
        base + "/automatic",
        json={"preview_token": preview["preview_token"], "authorized": True},
    )
    assert response.status_code == 422
    assert len(client.get(base + "/preview").json()["scans"]) == 0


def test_08_drafts_migrate_on_restart_without_resurrection_or_cross_project_leaks(client, tmp_path):
    pid = project(client)
    other = project(client)
    key = f"/projects/{pid}/drafts/note:new"
    legacy = {
        "revision": "1780000000000-" + "a" * 32,
        "value": {"title": "Unfinished 0.8 reasoning", "content": {"body": "only saved draft"}},
    }
    assert client.put(key, json=legacy).status_code == 200
    def restart():
        return TestClient(create_app(TOKEN, tmp_path, dev=True), base_url="http://127.0.0.1", headers={"Authorization": "Bearer " + TOKEN})
    with restart() as upgraded:
        cells = upgraded.get(f"/projects/{pid}/workspace").json()
        draft = cells["draft:legacy-note-new"]
        assert draft["value"]["data"]["content"]["body"] == "only saved draft"
        assert cells["knowledge:note"]["value"]["data"]["editing"]
        assert upgraded.get(f"/projects/{other}/workspace").json() == {}
        assert upgraded.get(key).json() == legacy
        upgraded.put(f"/projects/{pid}/workspace/draft:legacy-note-new", json={**draft, "closed": True, "revision": draft["revision"] + 1})
    with restart() as again:
        assert again.get(f"/projects/{pid}/workspace").json()["draft:legacy-note-new"]["closed"]
