import asyncio
import json
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from dragontrip.app import create_app
from dragontrip.db import Project, Scan, Node
from dragontrip import recon
from dragontrip.graph import ingest_web


@pytest.mark.parametrize(
    "value",
    [
        "http://example.com/",
        "http://127.0.0.1@evil.com/",
        "file:///etc/passwd",
        "http://127.0.0.1/?x=1",
        "http://127.0.0.1/#test",
        "http://127.0.0.1:99999/",
        "http://127.0.0.1/\n",
    ],
)
def test_web_scope_rejects_ambiguous_targets(value):
    with pytest.raises(ValueError):
        recon.target(value, "httpx")


def test_profiles_and_configuration_persist(client, tmp_path):
    assert len(client.get("/profiles").json()) == 6
    custom = {
        "name": "Local HTTP",
        "tool": "nmap",
        "ports": "8080",
        "rate": 20,
        "timeout": 30,
    }
    created = client.post("/profiles", json=custom)
    assert created.status_code == 201
    assert (
        client.post(
            "/profiles", json={**custom, "ports": "80;touch /tmp/unsafe"}
        ).status_code
        == 422
    )
    assert (
        client.post("/profiles", json={**custom, "ports": "65536"}).status_code == 422
    )
    assert (
        client.post(
            "/profiles", json={**custom, "tool": "ffuf", "rate": 51}
        ).status_code
        == 422
    )
    assert client.put("/queue", json={"concurrency": 4}).status_code == 422
    assert client.put("/queue", json={"concurrency": 2}).status_code == 200
    other = create_app("a" * 64, tmp_path, dev=True)
    with TestClient(
        other,
        base_url="http://127.0.0.1",
        headers={"Authorization": "Bearer " + "a" * 64},
    ) as reopened:
        assert reopened.get("/queue").json()["concurrency"] == 2
        assert any(
            p["id"] == created.json()["id"] for p in reopened.get("/profiles").json()
        )


def test_confirmation_and_missing_tool(client):
    project = client.post("/projects", json={"name": "Recon"}).json()["id"]
    assert (
        client.post(
            f"/projects/{project}/scans",
            json={"target": "127.0.0.1", "authorized": True, "profile": "full"},
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"/projects/{project}/scans",
            json={"target": "http://127.0.0.1/", "authorized": True, "profile": "ffuf"},
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"/projects/{project}/scans",
            json={"target": "127.0.0.1", "authorized": True, "profile": "missing"},
        ).status_code
        == 422
    )


def test_web_results_deduplicate_and_preserve_manual_position(app, tmp_path):
    with app.state.sessions() as db:
        p = Project(name="Web")
        db.add(p)
        db.flush()
        scan = Scan(
            id="web-1", project_id=p.id, tool="httpx", target="http://127.0.0.1:8080/"
        )
        db.add(scan)
        db.flush()
        result = [
            {
                "url": scan.target,
                "status": 200,
                "title": "Local",
                "evidence": {"tech": ["Python"]},
            }
        ]
        ingest_web(db, scan, result)
        db.commit()
        node = db.query(Node).filter_by(kind="url").one()
        node.x = 789
        db.commit()
        ingest_web(db, scan, result)
        db.commit()
        assert db.query(Node).count() == 2
        assert db.query(Node).filter_by(kind="url").one().x == 789
        assert len(json.loads(node.attrs)["observations"]) == 1
        empty = Project(name="Empty")
        db.add(empty)
        db.flush()
        scan.project_id = empty.id
        ingest_web(db, scan, [])
        db.commit()
        assert db.query(Node).filter_by(project_id=empty.id).count() == 0


def test_structured_parsers_keep_only_confirmed_same_origin_results(tmp_path):
    path = tmp_path / "results.json"
    path.write_text(
        json.dumps(
            {
                "results": [
                    {"url": "http://127.0.0.1:8080/admin", "status": 403},
                    {"url": "http://192.0.2.1/", "status": 200},
                ]
            }
        )
    )
    rows = recon.parse(path, "ffuf", "http://127.0.0.1:8080/")
    assert len(rows) == 1 and rows[0]["status"] == 403
    path.write_text(json.dumps([{"target": "http://127.0.0.1/", "http_status": 0}]))
    assert recon.parse(path, "whatweb", "http://127.0.0.1/") == []
    path.write_text("{invalid json")
    with pytest.raises(ValueError):
        recon.parse(path, "ffuf", "http://127.0.0.1/")


def test_queue_fifo_concurrency_and_queued_cancellation(app):
    async def scenario():
        manager = app.state.manager
        order, gates = [], {key: asyncio.Event() for key in ("one", "two", "three")}
        original = manager.run

        async def work(key):
            order.append(key)
            await gates[key].wait()

        manager.run = work
        with app.state.sessions() as db:
            p = Project(name="Queue")
            db.add(p)
            db.flush()
            for key in gates:
                db.add(Scan(id=key, project_id=p.id, target="127.0.0.1"))
            db.commit()
        for key in gates:
            manager.enqueue(key)
        await asyncio.sleep(0.02)
        assert order == ["one"]
        await manager.cancel("two")
        await manager.configure(2)
        await asyncio.sleep(0.02)
        assert order == ["one", "three"]
        gates["one"].set()
        gates["three"].set()
        await asyncio.gather(*list(manager.tasks.values()))
        with app.state.sessions() as db:
            assert db.get(Scan, "two").status == "cancelled"
        assert not manager.running and not manager.waiting
        manager.run = original

    asyncio.run(scenario())


def test_profile_arguments_are_bounded(tmp_path):
    for profile in recon.DEFAULTS:
        target = "127.0.0.1" if profile["tool"] == "nmap" else "http://127.0.0.1:8080/"
        args = recon.arguments(
            "/tool", profile, target, tmp_path / "out", tmp_path / "words"
        )
        assert args[0] == "/tool"
        assert target in args or target + "FUZZ" in args
        assert not any("shell" in arg for arg in args)


def test_history_is_paginated_filtered_and_console_free(client, app):
    pid = client.post("/projects", json={"name": "History"}).json()["id"]
    with app.state.sessions() as db:
        for i in range(120):
            db.add(
                Scan(
                    id=f"history-{i:03}",
                    project_id=pid,
                    target="127.0.0.1",
                    status="completed",
                    tool="whatweb" if i % 2 else "nmap",
                    output="private large console tail",
                    queued_at=f"2026-10-15T12:{i:03}",
                )
            )
        db.commit()
    first = client.get(f"/projects/{pid}/scan-history?tool=whatweb&limit=10").json()
    assert first["total"] == 60 and len(first["items"]) == 10
    assert all("output" not in item for item in first["items"])
    second = client.get(
        f"/projects/{pid}/scan-history?tool=whatweb&limit=10&offset=10"
    ).json()
    assert not {s["id"] for s in first["items"]} & {s["id"] for s in second["items"]}
    assert client.get(f"/projects/{pid}/scan-history?q=no-match").json()["total"] == 0
    assert len(client.get(f"/projects/{pid}").json()["scans"]) == 100
    assert client.get(f"/projects/{pid}/scan-history?limit=10000").status_code == 422


def test_partial_nmap_scan_does_not_invalidate_unscanned_ports(app):
    from dragontrip.graph import ingest

    with app.state.sessions() as db:
        p = Project(name="Partial")
        db.add(p)
        db.flush()
        scan = Scan(id="partial", project_id=p.id, target="127.0.0.1")
        db.add(scan)
        db.flush()
        initial = [
            {
                "ip": "127.0.0.1",
                "state": "up",
                "services": [
                    {"port": 22, "protocol": "tcp", "name": "ssh", "state": "open"},
                    {"port": 8080, "protocol": "tcp", "name": "http", "state": "open"},
                ],
            }
        ]
        ingest(db, scan, initial)
        db.commit()
        ingest(
            db,
            scan,
            [
                {
                    "ip": "127.0.0.1",
                    "state": "up",
                    "scanned_ports": "8080",
                    "services": [],
                }
            ],
        )
        db.commit()
        nodes = {
            json.loads(n.attrs)["port"]: json.loads(n.attrs)
            for n in db.query(Node).filter_by(kind="service")
        }
        assert nodes[22]["state"] == "open"
        assert nodes[8080]["state"] == "not observed in latest scan"


def test_whatweb_and_httpx_canonicalize_the_same_url(tmp_path):
    path = tmp_path / "web.json"
    path.write_text('[{"target":"http://127.0.0.1:80","http_status":200}]')
    whatweb = recon.parse(path, "whatweb", "http://127.0.0.1/")
    path.write_text('{"url":"http://127.0.0.1/","status_code":200}\n')
    httpx = recon.parse(path, "httpx", "http://127.0.0.1/")
    assert whatweb[0]["url"] == httpx[0]["url"] == "http://127.0.0.1/"


def test_upgrade_preserves_phase1_projects_and_positions(tmp_path):
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import text
    from dragontrip.db import database

    root = tmp_path / "legacy"
    root.mkdir()
    engine, _ = database(root / "dragontrip.sqlite3")
    config = Config(str(Path(__file__).parents[1] / "backend/alembic.ini"))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "0001")
        connection.execute(
            text(
                "INSERT INTO projects (id,name,description,created,updated) VALUES ('legacy','Existing lab','','2026-01-01','2026-01-01')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO nodes (id,project_id,kind,label,attrs,x,y) VALUES ('manual','legacy','custom','Keep me','{}',321,654)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO scans (id,project_id,target,status,command,started,output,error) VALUES ('oldscan','legacy','127.0.0.1','completed','[]','2026-01-01','','')"
            )
        )
    engine.dispose()
    upgraded = create_app("a" * 64, root, dev=True)
    with TestClient(
        upgraded,
        base_url="http://127.0.0.1",
        headers={"Authorization": "Bearer " + "a" * 64},
    ) as c:
        data = c.get("/projects/legacy").json()
        assert data["nodes"][0]["x"] == 321 and data["nodes"][0]["y"] == 654
        assert data["scans"][0]["tool"] == "nmap"
        assert data["scans"][0]["queued_at"] == "2026-01-01"
        assert len(c.get("/profiles").json()) == 6


def test_only_diagnostic_nse_profiles_are_accepted(client):
    profile = {
        "name": "SSH keys",
        "tool": "nmap",
        "ports": "22",
        "rate": 20,
        "timeout": 60,
        "scripts": ["ssh-hostkey"],
    }
    assert client.post("/profiles", json=profile).status_code == 201
    for scripts in (
        ["vuln"],
        ["brute"],
        ["/tmp/anything.nse"],
        ["ssh-hostkey --script-args=x"],
    ):
        assert (
            client.post("/profiles", json={**profile, "scripts": scripts}).status_code
            == 422
        )
    pid = client.post("/projects", json={"name": "Confirmed diagnostics"}).json()["id"]
    assert (
        client.post(
            f"/projects/{pid}/scans",
            json={"target": "127.0.0.1", "authorized": True, "profile": "service"},
        ).status_code
        == 422
    )


def test_new_web_nodes_do_not_overlap_existing_services_or_manual_nodes(app):
    from dragontrip.graph import ingest

    with app.state.sessions() as db:
        p = Project(name="Placement")
        db.add(p)
        db.flush()
        scan = Scan(id="place", project_id=p.id, target="127.0.0.1")
        db.add(scan)
        db.flush()
        ingest(
            db,
            scan,
            [
                {
                    "ip": "127.0.0.1",
                    "state": "up",
                    "services": [
                        {
                            "port": 8080,
                            "protocol": "tcp",
                            "name": "http",
                            "state": "open",
                        }
                    ],
                }
            ],
        )
        manual = Node(
            id="my-position",
            project_id=p.id,
            kind="custom",
            label="Keep position",
            x=490,
            y=165,
            attrs="{}",
        )
        db.add(manual)
        db.flush()
        before = {node.id: (node.x, node.y) for node in db.query(Node)}
        scan.tool = "whatweb"
        scan.target = "http://127.0.0.1:8080/"
        ingest_web(
            db,
            scan,
            [{"url": scan.target, "status": 200, "title": "Web", "evidence": {}}],
        )
        db.commit()
        nodes = list(db.query(Node))
        for left in nodes:
            for right in nodes:
                if left.id != right.id:
                    assert abs(left.x - right.x) >= 250 or abs(left.y - right.y) >= 115
        assert all(
            (db.get(Node, nid).x, db.get(Node, nid).y) == position
            for nid, position in before.items()
        )
