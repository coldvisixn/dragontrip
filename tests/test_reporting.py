import io
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dragontrip.db import Credential, Scan


def project(client):
    return client.post(
        "/projects", json={"name": "Reporting lab", "description": "Authorized review"}
    ).json()["id"]


def create(client, pid, kind, title, **content):
    response = client.post(
        f"/projects/{pid}/knowledge",
        json={"kind": kind, "title": title, "content": content},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_task_lifecycle_scoping_search_and_archive(client):
    pid, other = project(client), project(client)
    node = client.post(
        f"/projects/{pid}/nodes", json={"label": "Review target", "kind": "custom"}
    ).json()
    node_id = node.get("id")
    assert node_id, node
    due = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    task = create(
        client,
        pid,
        "task",
        "Verify remediation",
        status="todo",
        due_date=due,
        assignee="Analyst",
        priority="urgent",
        node_ids=[node_id],
    )
    assert client.get(f'/projects/{other}/knowledge/{task["id"]}').status_code == 404
    assert (
        client.post(
            f"/projects/{other}/knowledge",
            json={
                "kind": "task",
                "title": "Foreign link",
                "content": {"status": "todo", "node_ids": [node_id]},
            },
        ).status_code
        == 422
    )
    overview = client.get(f"/projects/{pid}/overview").json()
    assert overview["overdue"] == 1
    assert overview["tasks"] == {"todo": 1}
    search = client.get(f"/projects/{pid}/search?q=Analyst").json()
    assert search["items"][0]["subtype"] == "task"
    task["content"]["status"] = "in_progress"
    assert (
        client.put(f'/projects/{pid}/knowledge/{task["id"]}', json=task).status_code
        == 200
    )
    assert (
        len(
            client.get(f"/projects/{pid}/knowledge?kind=task&status=in_progress").json()
        )
        == 1
    )
    archive = client.post(f"/projects/{pid}/archive", json={})
    assert archive.status_code == 200, archive.text
    imported = client.post(
        "/imports",
        files={"file": ("plan.dtproj", io.BytesIO(archive.content), "application/zip")},
    )
    assert imported.status_code == 201, imported.text
    imported_pid = imported.json()["id"]
    restored = client.get(f"/projects/{imported_pid}/knowledge?kind=task").json()[0]
    assert restored["content"]["due_date"] == due
    assert restored["content"]["assignee"] == "Analyst"
    assert restored["content"]["node_ids"] != [node_id]
    task["content"]["status"] = "done"
    assert (
        client.put(f'/projects/{pid}/knowledge/{task["id"]}', json=task).status_code
        == 200
    )
    assert client.get(f"/projects/{pid}/overview").json()["overdue"] == 0
    assert client.delete(f'/projects/{pid}/knowledge/{task["id"]}').status_code == 200


def test_record_status_and_task_validation(client):
    pid = project(client)
    for kind, content in [
        ("task", {"status": "confirmed"}),
        ("finding", {"status": "todo"}),
        ("task", {"status": "todo", "priority": "invalid"}),
        ("task", {"status": "todo", "due_date": "not-a-date"}),
        ("task", {"status": "todo", "steps": [{"node_id": "x", "action": "x"}]}),
    ]:
        assert (
            client.post(
                f"/projects/{pid}/knowledge",
                json={"kind": kind, "title": "Invalid record", "content": content},
            ).status_code
            == 422
        )


def test_report_filters_sections_and_no_secret_buffers(client, app):
    pid, other = project(client), project(client)
    create(
        client,
        pid,
        "finding",
        "High confirmed",
        status="confirmed",
        severity="high",
        body="Impact demonstrated.",
        remediation="Apply patch.",
    )
    create(
        client,
        pid,
        "finding",
        "Critical resolved",
        status="resolved",
        severity="critical",
    )
    create(client, pid, "finding", "Low open", status="open", severity="low")
    create(client, pid, "finding", "High draft", severity="high")
    create(
        client,
        other,
        "finding",
        "Foreign finding",
        status="confirmed",
        severity="critical",
    )
    create(client, pid, "note", "Private note", body="OPTIONAL_NOTE")
    create(client, pid, "task", "Follow up", status="blocked", assignee="Reviewer")
    with app.state.sessions() as db:
        db.add(Credential(project_id=pid, ciphertext="VAULT_SENTINEL"))
        db.add(
            Scan(
                project_id=pid,
                target="127.0.0.1",
                status="completed",
                output="RAW_OUTPUT_SENTINEL",
            )
        )
        db.commit()
    base = f"/projects/{pid}"
    result = client.post(
        base + "/report/preview",
        json={"minimum_severity": "medium", "finding_status": "confirmed"},
    ).json()
    assert result["finding_count"] == 1
    text = result["markdown"]
    for expected in [
        "High confirmed",
        "Impact demonstrated.",
        "Apply patch.",
        "Follow up",
        "Reviewer",
        "127.0.0.1",
    ]:
        assert expected in text
    for excluded in [
        "Critical resolved",
        "Low open",
        "High draft",
        "Foreign finding",
        "OPTIONAL_NOTE",
        "VAULT_SENTINEL",
        "RAW_OUTPUT_SENTINEL",
    ]:
        assert excluded not in text
    all_records = client.post(
        base + "/report/preview",
        json={
            "finding_status": "all",
            "include_notes": True,
            "include_tasks": False,
            "include_scans": False,
        },
    ).json()
    assert all_records["finding_count"] == 4
    assert "OPTIONAL_NOTE" in all_records["markdown"]
    assert "## Work plan" not in all_records["markdown"]
    assert "## Scan history" not in all_records["markdown"]
    overview = client.get(base + "/overview").json()
    assert overview["active_risks"] == {"high": 2, "low": 1}
    assert overview["scans"] == {"completed": 1}


def test_report_exports_are_private_and_do_not_overwrite(client, tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_DOWNLOAD_DIR", str(tmp_path / "downloads"))
    pid = project(client)
    route = f"/projects/{pid}/report/export"
    first = client.post(route, json={"title": "Review"}).json()
    second = client.post(route, json={"title": "Review"}).json()
    assert first["path"] != second["path"]
    path = Path(first["path"])
    assert path.read_text().startswith("# Review")
    assert path.stat().st_mode & 0o777 == 0o600
    assert len(first["sha256"]) == 64
    assert client.post("/projects/missing/report/preview", json={}).status_code == 404
    assert client.post(route, json={"minimum_severity": "invalid"}).status_code == 422


def test_report_linked_evidence_paths_and_missing_objects(client):
    pid = project(client)
    node = client.post(
        f"/projects/{pid}/nodes", json={"label": "Target | alias"}
    ).json()
    evidence = client.post(
        f"/projects/{pid}/attachments",
        files={"file": ("proof.txt", b"RAW_ATTACHMENT_SENTINEL", "text/plain")},
    ).json()
    create(
        client,
        pid,
        "finding",
        "Linked observation",
        status="confirmed",
        attachment_ids=[evidence["id"]],
        node_ids=[node["id"]],
    )
    create(
        client,
        pid,
        "path",
        "Review path",
        steps=[
            {
                "node_id": node["id"],
                "action": "Review configuration",
                "status": "planned",
            }
        ],
    )
    report = client.post(f"/projects/{pid}/report/preview", json={}).json()["markdown"]
    assert "proof.txt" in report
    assert evidence["sha256"] in report
    assert "RAW_ATTACHMENT_SENTINEL" not in report
    assert "Review configuration" in report
    assert "Target \\| alias" in report
    assert client.delete(f"/projects/{pid}/nodes/{node['id']}").status_code == 200
    report = client.post(
        f"/projects/{pid}/report/preview", json={"include_inventory": False}
    ).json()["markdown"]
    assert "Deleted object" in report
    assert "## Object inventory" not in report
    assert (
        client.post(
            f"/projects/{pid}/report/preview", json={"title": "   "}
        ).status_code
        == 422
    )
