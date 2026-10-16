from dragontrip.db import Scan, now


def project(client):
    return client.post("/projects", json={"name": "Methodology lab"}).json()["id"]


def workflow(client, pid, target="http://127.0.0.1:8080/"):
    r = client.post(
        f"/projects/{pid}/knowledge",
        json={
            "kind": "workflow",
            "title": "Web recon",
            "content": {
                "status": "open",
                "actions": [
                    {"profile": "whatweb", "target": target, "words": []},
                    {"profile": "httpx", "target": target, "words": []},
                ],
            },
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_methodology_four_states_and_archive_roundtrip(client):
    pid = project(client)
    node = client.post(
        f"/projects/{pid}/web-objects",
        json={"url": "http://app.htb/", "application_only": True},
    ).json()
    base = f"/projects/{pid}/methodologies"
    row = client.post(base, json={"template": "web", "node_id": node["id"]}).json()
    assert len(row["content"]["checks"]) == 7
    assert all(c["state"] == "not_tested" for c in row["content"]["checks"])
    assert (
        client.post(base, json={"template": "web", "node_id": node["id"]}).json()["id"]
        == row["id"]
    )
    other = project(client)
    assert (
        client.post(
            f"/projects/{other}/methodologies",
            json={"template": "web", "node_id": node["id"]},
        ).status_code
        == 422
    )
    for state in ["in_progress", "tested", "not_applicable"]:
        row["content"]["checks"][0].update(
            state=state, note="Explicit review with evidence"
        )
        result = client.put(
            f'/projects/{pid}/knowledge/{row["id"]}',
            json={
                "kind": "checklist",
                "title": row["title"],
                "content": row["content"],
            },
        )
        assert result.status_code == 200, result.text
        assert result.json()["content"]["checks"][0]["state"] == state
    row["content"]["checks"][1]["state"] = "done"
    assert (
        client.put(
            f'/projects/{pid}/knowledge/{row["id"]}',
            json={
                "kind": "checklist",
                "title": row["title"],
                "content": row["content"],
            },
        ).status_code
        == 422
    )
    archive = client.post(f"/projects/{pid}/archive", json={})
    imported = client.post(
        "/imports", files={"file": ("checks.dtproj", archive.content)}
    ).json()["id"]
    checks = client.get(f"/projects/{imported}/knowledge?kind=checklist").json()
    assert checks[0]["content"]["checks"][0]["state"] == "not_applicable"
    assert checks[0]["content"]["node_ids"][0].startswith(imported + ":")
    same = client.post(
        f"/projects/{imported}/methodologies",
        json={"template": "web", "node_id": checks[0]["content"]["node_ids"][0]},
    )
    assert same.json()["id"] == checks[0]["id"]


def test_workflow_preview_scope_and_staleness(client):
    pid = project(client)
    w = workflow(client, pid)
    preview = client.post(f'/projects/{pid}/workflows/{w["id"]}/preview').json()
    assert not preview["ready"] and all(
        a["scope"] == "unknown" for a in preview["actions"]
    )
    assert client.get(f"/projects/{pid}/scan-history").json()["total"] == 0
    client.put(f"/projects/{pid}/scope", json={"rules": [{"value": "127.0.0.1"}]})
    assert (
        client.post(
            f'/projects/{pid}/workflows/{w["id"]}/runs',
            json={"preview_token": preview["preview_token"]},
        ).status_code
        == 409
    )
    preview = client.post(f'/projects/{pid}/workflows/{w["id"]}/preview').json()
    assert preview["ready"]
    run = client.post(
        f'/projects/{pid}/workflows/{w["id"]}/runs',
        json={"preview_token": preview["preview_token"]},
    )
    assert run.status_code == 201, run.text
    rid = run.json()["id"]
    assert client.get(f"/projects/{pid}/scan-history").json()["total"] == 0
    client.put(
        f"/projects/{pid}/scope",
        json={"rules": [{"value": "127.0.0.1", "mode": "exclude"}]},
    )
    plan = client.get(f"/projects/{pid}/workflow-runs/{rid}/preview").json()
    assert not plan["ready"]
    assert (
        client.post(
            f"/projects/{pid}/workflow-runs/{rid}/next",
            json={"preview_token": plan["preview_token"], "authorized": True},
        ).status_code
        == 422
    )


def test_workflow_runs_sequentially_and_retains_snapshot(client, app, monkeypatch):
    from dragontrip import recon

    async def discover(only=None, overrides=None):
        return [
            {
                "name": "fixture",
                "installed": True,
                "path": "/not-run",
                "version": "fixture",
            }
        ]

    monkeypatch.setattr(recon, "discover", discover)
    # Queue boundary is tested here; actual tools are covered by the browser/live acceptance.
    monkeypatch.setattr(app.state.manager, "enqueue", lambda sid: None)
    pid = project(client)
    client.put(f"/projects/{pid}/scope", json={"rules": [{"value": "127.0.0.1"}]})
    w = workflow(client, pid)
    plan = client.post(f'/projects/{pid}/workflows/{w["id"]}/preview').json()
    rid = client.post(
        f'/projects/{pid}/workflows/{w["id"]}/runs',
        json={"preview_token": plan["preview_token"]},
    ).json()["id"]
    plan = client.get(f"/projects/{pid}/workflow-runs/{rid}/preview").json()
    denied = client.post(
        f"/projects/{pid}/workflow-runs/{rid}/next",
        json={"preview_token": plan["preview_token"], "authorized": False},
    )
    assert denied.status_code == 422
    first = client.post(
        f"/projects/{pid}/workflow-runs/{rid}/next",
        json={"preview_token": plan["preview_token"], "authorized": True},
    )
    assert first.status_code == 201, first.text
    assert first.json()["tool"] == "whatweb"
    assert (
        client.post(
            f"/projects/{pid}/workflow-runs/{rid}/next",
            json={"preview_token": plan["preview_token"], "authorized": True},
        ).status_code
        == 409
    )
    plan = client.get(f"/projects/{pid}/workflow-runs/{rid}/preview").json()
    assert (
        client.post(
            f"/projects/{pid}/workflow-runs/{rid}/next",
            json={"preview_token": plan["preview_token"], "authorized": True},
        ).status_code
        == 409
    )
    with app.state.sessions() as db:
        scan = db.get(Scan, first.json()["id"])
        scan.status, scan.ended = "completed", now()
        db.commit()
    # Changing the saved template must not change the run's frozen action order.
    content = {**w["content"], "actions": list(reversed(w["content"]["actions"]))}
    assert (
        client.put(
            f'/projects/{pid}/knowledge/{w["id"]}',
            json={"kind": "workflow", "title": "Changed", "content": content},
        ).status_code
        == 200
    )
    plan = client.get(f"/projects/{pid}/workflow-runs/{rid}/preview").json()
    second = client.post(
        f"/projects/{pid}/workflow-runs/{rid}/next",
        json={"preview_token": plan["preview_token"], "authorized": True},
    )
    assert second.status_code == 201 and second.json()["tool"] == "httpx"
    assert (
        client.put(
            f"/projects/{pid}/knowledge/{rid}",
            json={
                "kind": "workflow_run",
                "title": "Tampered",
                "content": plan["run"]["content"],
            },
        ).status_code
        == 403
    )
    assert client.post(f"/projects/{pid}/workflow-runs/{rid}/stop").status_code == 200
    plan = client.get(f"/projects/{pid}/workflow-runs/{rid}/preview").json()
    assert (
        client.post(
            f"/projects/{pid}/workflow-runs/{rid}/next",
            json={"preview_token": plan["preview_token"], "authorized": True},
        ).status_code
        == 409
    )
    # Portable runs remap both scan IDs and the saved workflow reference.
    with app.state.sessions() as db:
        db.get(Scan, second.json()["id"]).status = "cancelled"
        db.commit()
    archive = client.post(f"/projects/{pid}/archive", json={})
    assert archive.status_code == 200, archive.text
    result = client.post("/imports", files={"file": ("work.dtproj", archive.content)})
    assert result.status_code == 201, result.text
    imported = result.json()["id"]
    run = client.get(f"/projects/{imported}/knowledge?kind=workflow_run").json()[0]
    assert len(run["content"]["scan_ids"]) == 2
    assert (
        client.get(
            f'/projects/{imported}/knowledge/{run["content"]["workflow_id"]}'
        ).status_code
        == 200
    )


def test_workflow_scope_rechecked_after_tool_discovery(client, app, monkeypatch):
    from dragontrip import recon
    from dragontrip.db import ScopeRule

    async def discover(only=None, overrides=None):
        with app.state.sessions() as db:
            db.query(ScopeRule).delete()
            db.commit()
        return [{"name": "fixture", "installed": True, "path": "/not-run"}]

    monkeypatch.setattr(recon, "discover", discover)
    monkeypatch.setattr(app.state.manager, "enqueue", lambda sid: None)
    pid = project(client)
    client.put(f"/projects/{pid}/scope", json={"rules": [{"value": "127.0.0.1"}]})
    w = workflow(client, pid)
    plan = client.post(f'/projects/{pid}/workflows/{w["id"]}/preview').json()
    run = client.post(
        f'/projects/{pid}/workflows/{w["id"]}/runs',
        json={"preview_token": plan["preview_token"]},
    ).json()
    plan = client.get(f'/projects/{pid}/workflow-runs/{run["id"]}/preview').json()
    result = client.post(
        f'/projects/{pid}/workflow-runs/{run["id"]}/next',
        json={"preview_token": plan["preview_token"], "authorized": True},
    )
    assert result.status_code == 422
    assert client.get(f"/projects/{pid}/scan-history").json()["total"] == 0


def test_queue_revalidates_scope_before_starting_process(app, client, monkeypatch):
    import asyncio

    launched = []

    async def forbidden(*args, **kwargs):
        launched.append(args)
        raise AssertionError("Excluded queued work must not start a process")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", forbidden)
    pid = project(client)
    with app.state.sessions() as db:
        db.add(
            Scan(
                id="scope-queue-test",
                project_id=pid,
                target="127.0.0.1",
                tool="whatweb",
                status="queued",
                options='{"scope_required":true}',
                command='["/not-run"]',
            )
        )
        db.commit()
    asyncio.run(app.state.manager.run("scope-queue-test"))
    assert not launched
    with app.state.sessions() as db:
        scan = db.get(Scan, "scope-queue-test")
        assert scan.status == "failed" and "scope changed" in scan.error
