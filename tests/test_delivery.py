import io
import json
import zipfile
from pathlib import Path

from PIL import Image


def make_project(client):
    return client.post("/projects", json={"name": "Delivery lab"}).json()["id"]


def finding(client, pid, **content):
    result = client.post(
        f"/projects/{pid}/knowledge",
        json={
            "kind": "finding",
            "title": "Review finding",
            "content": {"status": "confirmed", "severity": "high", **content},
        },
    )
    assert result.status_code == 201, result.text
    return result.json()


def revision(number):
    return f"{number:013d}-" + "a" * 32


def test_drafts_recover_without_changing_saved_records_and_reject_late_writes(client):
    pid, other = make_project(client), make_project(client)
    row = finding(client, pid)
    route = f"/projects/{pid}/drafts/finding:{row['id']}"
    value = {"title": "Unsaved work", "content": {"body": "Recovery sentinel"}}
    assert (
        client.put(route, json={"revision": revision(1), "value": value}).status_code
        == 200
    )
    assert client.get(route).json()["value"] == value
    assert (
        client.get(f"/projects/{pid}/knowledge/{row['id']}").json()["title"]
        == "Review finding"
    )
    assert (
        client.get(f"/projects/{other}/drafts/finding:{row['id']}").status_code == 404
    )
    assert (
        client.put(route, json={"revision": revision(2), "value": None}).status_code
        == 200
    )
    assert (
        client.put(route, json={"revision": revision(1), "value": value}).status_code
        == 409
    )
    assert client.get(route).json()["value"] is None
    assert (
        client.put(
            f"/projects/{pid}/drafts/vault",
            json={"revision": revision(3), "value": value},
        ).status_code
        == 422
    )
    assert (
        client.put(
            f"/projects/{pid}/drafts/report",
            json={"revision": revision(3), "value": {"body": "x" * 262144}},
        ).status_code
        == 413
    )


def test_drafts_stay_in_database_across_app_restart(tmp_path):
    from fastapi.testclient import TestClient
    from dragontrip.app import create_app

    token = "d" * 64
    with TestClient(
        create_app(token, tmp_path, dev=True),
        base_url="http://127.0.0.1",
        headers={"Authorization": "Bearer " + token},
    ) as client:
        pid = make_project(client)
        route = f"/projects/{pid}/drafts/note:new"
        assert (
            client.put(
                route, json={"revision": revision(1), "value": {"title": "Recovered"}}
            ).status_code
            == 200
        )
    with TestClient(
        create_app(token, tmp_path, dev=True),
        base_url="http://127.0.0.1",
        headers={"Authorization": "Bearer " + token},
    ) as client:
        assert client.get(route).json()["value"]["title"] == "Recovered"


def test_retests_are_append_only_and_portable_while_drafts_are_private(client):
    pid, other = make_project(client), make_project(client)
    row = finding(client, pid)
    route = f"/projects/{pid}/knowledge/{row['id']}"
    updated = client.post(
        route + "/retests",
        json={
            "result": "fixed",
            "note": "Verified corrected behavior",
            "expected_updated": row["updated"],
        },
    )
    assert updated.status_code == 200, updated.text
    updated = updated.json()
    assert updated["content"]["status"] == "resolved"
    assert len(updated["content"]["retests"]) == 1
    assert (
        client.post(
            route + "/retests",
            json={
                "result": "still_present",
                "note": "Stale tab",
                "expected_updated": row["updated"],
            },
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"/projects/{other}/knowledge/{row['id']}/retests",
            json={
                "result": "fixed",
                "note": "Wrong project",
                "expected_updated": updated["updated"],
            },
        ).status_code
        == 404
    )
    assert (
        client.put(route, json={**row, "expected_updated": row["updated"]}).status_code
        == 409
    )
    changed = {**updated, "content": {**updated["content"], "retests": []}}
    assert client.put(route, json=changed).status_code == 409
    assert client.put(route, json=updated).status_code == 200
    assert client.delete(route).status_code == 409
    client.put(
        f"/projects/{pid}/drafts/report",
        json={"revision": revision(1), "value": {"summary": "PRIVATE_DRAFT_SENTINEL"}},
    )
    archive = client.post(f"/projects/{pid}/archive", json={})
    assert archive.status_code == 200
    with zipfile.ZipFile(io.BytesIO(archive.content)) as bundle:
        manifest = json.loads(bundle.read("manifest.json"))
        assert manifest["version"] == 5
        assert "PRIVATE_DRAFT_SENTINEL" not in json.dumps(manifest)
    old_manifest = {**manifest, "version": 3}
    old_archive = io.BytesIO()
    with zipfile.ZipFile(old_archive, "w") as bundle:
        bundle.writestr("manifest.json", json.dumps(old_manifest))
    assert (
        client.post(
            "/imports",
            files={"file": ("old.dtproj", old_archive.getvalue(), "application/zip")},
        ).status_code
        == 422
    )
    restored = client.post(
        "/imports",
        files={"file": ("project.dtproj", archive.content, "application/zip")},
    )
    assert restored.status_code == 201, restored.text
    copy = client.get(
        f"/projects/{restored.json()['id']}/knowledge?kind=finding"
    ).json()[0]
    assert copy["content"]["retests"] == updated["content"]["retests"]


def test_report_html_bundle_selection_integrity_and_stale_preview(
    client, tmp_path, monkeypatch
):
    monkeypatch.setenv("XDG_DOWNLOAD_DIR", str(tmp_path / "downloads"))
    pid, other = make_project(client), make_project(client)
    row = finding(
        client,
        pid,
        body="<script>alert(1)</script>\n\n![remote](https://example.invalid/tracker.png)\n\n[bad](javascript:alert(1))",
    )
    finding(client, pid, status="draft", body="DRAFT_FINDING_SENTINEL")
    stream = io.BytesIO()
    Image.new("RGB", (2, 2), (120, 50, 200)).save(stream, format="PNG")
    proof = client.post(
        f"/projects/{pid}/attachments",
        files={"file": ("proof.png", stream.getvalue(), "image/png")},
    ).json()
    hidden = client.post(
        f"/projects/{pid}/attachments",
        files={"file": ("private.txt", b"UNSELECTED_FILE_SENTINEL", "text/plain")},
    ).json()
    base = f"/projects/{pid}/report"
    options = {"format": "bundle", "attachment_ids": [proof["id"]]}
    preview = client.post(base + "/preview", json=options).json()
    assert preview["finding_count"] == 1
    assert "DRAFT_FINDING_SENTINEL" not in preview["markdown"]
    response = client.post(
        base + "/export", json={**options, "expected_preview": preview["preview_token"]}
    )
    assert response.status_code == 200, response.text
    with zipfile.ZipFile(response.json()["path"]) as bundle:
        assert set(bundle.namelist()) == {
            "report.md",
            "report.html",
            "README.txt",
            f"evidence/{proof['id']}.png",
        }
        output = bundle.read("report.html").decode()
        assert "data:image/png;base64," in output
        assert "<script>" not in output
        assert 'src="https://' not in output
        assert 'href="javascript:' not in output
        assert "UNSELECTED_FILE_SENTINEL" not in output
        assert f'href="#evidence-{proof["id"]}"' in output
        assert bundle.read(f"evidence/{proof['id']}.png") == stream.getvalue()
    assert (
        client.post(f"/projects/{other}/report/preview", json=options).status_code
        == 422
    )
    assert (
        client.post(
            base + "/export", json={**options, "format": "markdown"}
        ).status_code
        == 422
    )
    stale = {**row, "title": "Changed after preview"}
    assert (
        client.put(f"/projects/{pid}/knowledge/{row['id']}", json=stale).status_code
        == 200
    )
    assert (
        client.post(
            base + "/export",
            json={**options, "expected_preview": preview["preview_token"]},
        ).status_code
        == 409
    )
    direct = client.post(base + "/export", json={"format": "html"}).json()
    assert Path(direct["path"]).suffix == ".html"
    assert "data:image/png;base64," not in Path(direct["path"]).read_text()
    with (tmp_path / "attachments" / hidden["id"]).open("wb") as destination:
        destination.write(b"changed")
    assert (
        client.post(
            base + "/preview", json={"attachment_ids": [hidden["id"]]}
        ).status_code
        == 409
    )


def test_project_details_can_be_renamed_without_recreating_data(client):
    pid = make_project(client)
    row = finding(client, pid)
    changed = client.put(
        f"/projects/{pid}",
        json={"name": "Renamed assessment", "description": "Updated scope context"},
    )
    assert changed.status_code == 200
    assert changed.json()["id"] == pid
    assert client.get(f"/projects/{pid}/knowledge/{row['id']}").status_code == 200
    assert client.put(f"/projects/{pid}", json={"name": " "}).status_code == 422


def test_demo_is_explicit_fictional_and_separate(client):
    real = make_project(client)
    demo = client.post("/examples").json()
    assert demo["id"] != real
    detail = client.get(f"/projects/{demo['id']}").json()
    assert not detail["scans"]
    assert "192.0.2.10" in {n["label"] for n in detail["nodes"]}
    assert client.get(f"/projects/{real}").json()["nodes"] == []
    assert client.get(f"/projects/{demo['id']}/scope").json() == []
    row = client.get(f"/projects/{demo['id']}/knowledge?kind=finding").json()[0]
    assert row["content"]["status"] == "draft"
    assert "no vulnerability" in row["content"]["body"]
