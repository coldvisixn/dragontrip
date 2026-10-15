import json
import asyncio
import sys
import os
import subprocess
from pathlib import Path
import pytest
from defusedxml.common import DefusedXmlException

from dragontrip.db import Scan, Node
from dragontrip.graph import ingest
from dragontrip.nmap import ipv4, parse, arguments


@pytest.mark.parametrize("restore_original", [False, True])
def test_frozen_external_tool_uses_system_libraries(monkeypatch, tmp_path, restore_original):
    from dragontrip.nmap import external_environment
    original = os.environ.get("LD_LIBRARY_PATH", "")
    # A real dynamic-loader failure if the frozen library directory leaks.
    (tmp_path / "libm.so.6").write_text("private incompatible library")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setenv("LD_LIBRARY_PATH", str(tmp_path))
    if restore_original:
        monkeypatch.setenv("LD_LIBRARY_PATH_ORIG", original)
    else:
        monkeypatch.delenv("LD_LIBRARY_PATH_ORIG", raising=False)
    contaminated = subprocess.run([sys.executable, "-c", "print('should not start')"],
                                  env=os.environ.copy(), capture_output=True, text=True)
    assert contaminated.returncode != 0 and "libm.so.6" in contaminated.stderr
    result = subprocess.run([sys.executable, "-c", "print('external tool started')"],
                            env=external_environment(), capture_output=True, text=True, check=True)
    assert result.stdout.strip() == "external tool started"
    assert os.environ["LD_LIBRARY_PATH"] == str(tmp_path)

XML = """<?xml version="1.0"?>
<!DOCTYPE nmaprun>
<nmaprun><host><status state="up"/><address addr="127.0.0.1" addrtype="ipv4"/>
<ports><port protocol="tcp" portid="8080"><state state="open"/>
<service name="http" product="Lab &amp; server" version="1.2"/></port>
<port protocol="tcp" portid="22"><state state="closed"/></port></ports></host>
<runstats><finished exit="success"/></runstats></nmaprun>"""

@pytest.mark.parametrize("value", ["127.0.0.1;id", "-sV", "10.0.0.0/24", "::1", "999.1.1.1", "example.com", "127.0.0.1\n"])
def test_invalid_targets(value):
    with pytest.raises(ValueError):
        ipv4(value)


def test_parser(tmp_path):
    p = tmp_path / "scan.xml"
    p.write_text(XML)
    hosts = parse(p, "127.0.0.1")
    assert hosts[0]["state"] == "up"
    assert hosts[0]["services"][0]["product"] == "Lab & server"
    assert len(hosts[0]["services"]) == 1
    assert parse(p, "192.0.2.1") == []
    assert arguments("/usr/bin/nmap", "127.0.0.1", p)[-1] == "127.0.0.1"
    p.write_text('<nmaprun><host>')
    with pytest.raises(Exception):
        parse(p, "127.0.0.1")
    p.write_text('<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><nmaprun>&xxe;</nmaprun>')
    with pytest.raises(DefusedXmlException):
        parse(p, "127.0.0.1")


def test_api_guard(client):
    assert client.get("/projects", headers={"Authorization": ""}).status_code == 401
    assert client.get("/projects", headers={"Origin": "https://evil.example"}).status_code == 403
    assert client.get("/projects", headers={"Host": "evil.example"}).status_code == 403
    assert client.options("/projects", headers={"Origin": "http://localhost:1420"}).status_code == 200
    assert client.post("/projects", json={"name": " "}).status_code == 422
    assert client.post("/projects/x/scans", json={"target":"127.0.0.1","authorized":False}).status_code == 422


def test_ingest_persistence_and_manual_objects(client, app, tmp_path):
    p = client.post("/projects", json={"name":"HTB Lab","description":"Allowed localhost"}).json()
    pid = p["id"]
    custom = client.post(f"/projects/{pid}/nodes", json={"label":"Investigate"}).json()
    xml = tmp_path / "fixture.xml"
    xml.write_text(XML)
    with app.state.sessions() as db:
        scan = Scan(id="fixture-scan",project_id=pid,target="127.0.0.1",status="completed")
        db.add(scan)
        db.flush()
        ingest(db, scan, parse(xml, "127.0.0.1"))
        db.commit()
    first = client.get(f"/projects/{pid}").json()
    host = next(n for n in first["nodes"] if n["kind"]=="host")
    service = next(n for n in first["nodes"] if n["kind"]=="service")
    assert service["attrs"]["port"] == 8080
    assert service["attrs"]["scan_id"] == "fixture-scan"
    assert first["edges"][0]["evidence"] == "fixture-scan"
    assert client.put(f"/projects/{pid}/nodes/{host['id']}/position", json={"x":777,"y":456}).status_code == 200
    edge = client.post(f"/projects/{pid}/edges", json={"source":host["id"],"target":custom["id"]}).json()
    assert edge["evidence"] is None
    with app.state.sessions() as db:
        ingest(db, db.get(Scan,"fixture-scan"), parse(xml, "127.0.0.1"))
        db.commit()
    # New app instance, same SQLite file and migration path.
    from dragontrip.app import create_app
    from fastapi.testclient import TestClient
    reopened = create_app("a"*64,tmp_path)
    with TestClient(reopened,base_url="http://127.0.0.1",headers={"Authorization":"Bearer "+"a"*64}) as c:
        d=c.get(f"/projects/{pid}").json()
        assert len(d["nodes"])==3
        assert len(d["edges"])==2
        assert next(n for n in d["nodes"] if n["id"]==host["id"])["x"]==777
        assert c.delete(f"/projects/{pid}/nodes/{host['id']}").status_code==403
        second=c.post("/projects",json={"name":"Other"}).json()["id"]
        assert c.post(f"/projects/{second}/edges",json={"source":host["id"],"target":custom["id"]}).status_code==422
        assert c.delete(f"/projects/{pid}/nodes/{custom['id']}").status_code==200
        assert len(c.get(f"/projects/{pid}").json()["edges"])==1


def test_process_output_and_cancellation(app, tmp_path):
    async def scenario():
        manager=app.state.manager
        with app.state.sessions() as db:
            from dragontrip.db import Project
            p=Project(name="Process tests")
            db.add(p);db.flush()
            success=Scan(id="process-output",project_id=p.id,target="127.0.0.1",
                         command=json.dumps([sys.executable,"-c","import sys;print('actual tool output');sys.exit(2)"]))
            cancel=Scan(id="process-cancel",project_id=p.id,target="127.0.0.1",
                        command=json.dumps([sys.executable,"-c","import time;print('started',flush=True);time.sleep(60)"]))
            db.add_all([success,cancel]);db.commit()
        await manager.run("process-output")
        with app.state.sessions() as db:
            s=db.get(Scan,"process-output")
            assert s.status=="failed"
            assert "actual tool output" in s.output
            assert s.exit_code=="2"
        manager.tasks["process-cancel"]=asyncio.create_task(manager.run("process-cancel"))
        for _ in range(100):
            if "process-cancel" in manager.processes:
                break
            await asyncio.sleep(.01)
        proc=manager.processes["process-cancel"]
        await manager.cancel("process-cancel")
        assert proc.returncode is not None
        with app.state.sessions() as db:
            assert db.get(Scan,"process-cancel").status=="cancelled"
    asyncio.run(scenario())


def test_interrupted_scans_recovered(app):
    from dragontrip.db import Project
    from dragontrip.tasks import TaskManager
    with app.state.sessions() as db:
        p=Project(name="Recovery");db.add(p);db.flush()
        db.add(Scan(id="old",project_id=p.id,target="127.0.0.1",status="running"))
        db.commit()
    TaskManager(app.state.sessions,app.state.manager.artifacts)
    with app.state.sessions() as db:
        assert db.get(Scan,"old").status=="interrupted"


def test_missing_nmap_and_explicit_scope(client, monkeypatch):
    from dragontrip import nmap
    pid=client.post("/projects",json={"name":"Scope"}).json()["id"]
    monkeypatch.setattr(nmap,"discover",lambda:{"installed":False,"path":None})
    assert client.post(f"/projects/{pid}/scans",json={"target":"127.0.0.1","authorized":True}).status_code==409
    for target in ("127.0.0.1; whoami","127.0.0.0/24","example.com"):
        assert client.post(f"/projects/{pid}/scans",json={"target":target,"authorized":True}).status_code==422


def test_cancel_before_coroutine_start(app):
    async def scenario():
        from dragontrip.db import Project
        with app.state.sessions() as db:
            p=Project(name="Queued cancellation");db.add(p);db.flush()
            db.add(Scan(id="queued",project_id=p.id,target="127.0.0.1",command="[]"))
            db.commit()
        manager=app.state.manager
        manager.tasks["queued"]=asyncio.create_task(manager.run("queued"))
        await manager.cancel("queued")
        assert not manager.tasks
        with app.state.sessions() as db:
            assert db.get(Scan,"queued").status=="cancelled"
    asyncio.run(scenario())


def test_process_launch_failure(app):
    async def scenario():
        from dragontrip.db import Project
        with app.state.sessions() as db:
            p=Project(name="Launch failure");db.add(p);db.flush()
            db.add(Scan(id="missing-binary",project_id=p.id,target="127.0.0.1",command=json.dumps(["/nonexistent/dragontrip-tool"])))
            db.commit()
        await app.state.manager.run("missing-binary")
        with app.state.sessions() as db:
            scan=db.get(Scan,"missing-binary")
            assert scan.status=="failed"
            assert scan.error
    asyncio.run(scenario())


def test_rescan_preserves_historical_evidence(client, app, tmp_path):
    pid=client.post("/projects",json={"name":"Rescan"}).json()["id"]
    path=tmp_path/"input.xml";path.write_text(XML)
    with app.state.sessions() as db:
        first=Scan(id="first",project_id=pid,target="127.0.0.1",status="completed")
        second=Scan(id="second",project_id=pid,target="127.0.0.1",status="completed")
        db.add_all([first,second]);db.flush()
        ingest(db,first,parse(path,"127.0.0.1"));db.commit()
        ingest(db,second,[{"ip":"127.0.0.1","state":"up","services":[],"evidence_xml":"<host/>"}]);db.commit()
    detail=client.get(f"/projects/{pid}").json()
    service=next(n for n in detail["nodes"] if n["kind"]=="service")
    assert service["attrs"]["state"]=="not observed in latest scan"
    assert service["attrs"]["scan_id"]=="first"
    assert detail["edges"][0]["evidence"]=="first"
