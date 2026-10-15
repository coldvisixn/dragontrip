import asyncio
import hmac
import ipaddress
import json
import os
import signal
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from alembic import command
from alembic.config import Config
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, desc
from sqlalchemy.orm import defer

from .db import database, data_dir, Project, Node, Edge, Scan, Activity, serialize, uid, record, now
from .tasks import TaskManager
from . import nmap


class ProjectInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=4000)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value):
        if not value.strip():
            raise ValueError("Project name cannot be blank")
        return value.strip()


class ScanInput(BaseModel):
    target: str
    authorized: Literal[True]

    @field_validator("target")
    @classmethod
    def target_valid(cls, value):
        return nmap.ipv4(value)


class NodeInput(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    x: float = Field(default=200, ge=-1000000, le=1000000, allow_inf_nan=False)
    y: float = Field(default=200, ge=-1000000, le=1000000, allow_inf_nan=False)


class Position(BaseModel):
    x: float = Field(ge=-1000000, le=1000000, allow_inf_nan=False)
    y: float = Field(ge=-1000000, le=1000000, allow_inf_nan=False)


class EdgeInput(BaseModel):
    source: str
    target: str


def create_app(token: str, root: Path | None = None, dev=False):
    if len(token) < 32:
        raise ValueError("Local authentication token must be at least 32 characters")
    root = root or data_dir()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    engine, sessions = database(root / "dragontrip.sqlite3")
    config = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    manager = TaskManager(sessions, root / "artifacts")
    origins = {"tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"}
    if dev:
        origins.add("http://localhost:1420")

    @asynccontextmanager
    async def lifespan(app):
        async def watch_parent():
            parent = os.environ.get("DRAGONTRIP_PARENT_PID")
            if not parent:
                return
            while True:
                await asyncio.sleep(2)
                if os.getppid() != int(parent):
                    os.kill(os.getpid(), signal.SIGTERM)
                    return
        watchdog = asyncio.create_task(watch_parent())
        yield
        watchdog.cancel()
        await asyncio.gather(watchdog, return_exceptions=True)
        await manager.close()
        engine.dispose()

    app = FastAPI(title="Dragontrip local API", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.sessions, app.state.manager = sessions, manager

    @app.middleware("http")
    async def guard(request: Request, call_next):
        host = request.headers.get("host", "").split(":")[0]
        if host != "127.0.0.1":
            return Response(status_code=403)
        origin = request.headers.get("origin")
        if origin and origin not in origins:
            return Response(status_code=403)
        cors = {"Access-Control-Allow-Origin": origin, "Vary": "Origin"} if origin else {}
        if request.method == "OPTIONS":
            if origin not in origins:
                return Response(status_code=403)
            return Response(headers={**cors, "Access-Control-Allow-Headers": "Authorization, Content-Type",
                                     "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"})
        if not hmac.compare_digest(request.headers.get("authorization", ""), f"Bearer {token}"):
            return Response(status_code=401, headers=cors)
        if int(request.headers.get("content-length", "0")) > 32768:
            return Response(status_code=413, headers=cors)
        response = await call_next(request)
        response.headers.update(cors)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    def project(db, pid):
        item = db.get(Project, pid)
        if item is None:
            raise HTTPException(404, "Project not found")
        return item

    @app.get("/health")
    def health():
        return {"status": "ready"}

    @app.get("/tools")
    async def tools():
        info = nmap.discover()
        if info["installed"]:
            try:
                proc = await asyncio.create_subprocess_exec(info["path"], "--version", stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
                try:
                    out, _ = await asyncio.wait_for(proc.communicate(), 3)
                    info["version"] = out.decode(errors="replace").splitlines()[0][:200]
                finally:
                    if proc.returncode is None:
                        proc.kill()
                        await proc.wait()
            except (OSError, asyncio.TimeoutError):
                info["version"] = "Version check unavailable"
        return [info]

    @app.get("/projects")
    def projects():
        with sessions() as db:
            return [serialize(p) for p in db.scalars(select(Project).order_by(desc(Project.updated)))]

    @app.post("/projects", status_code=201)
    def new_project(body: ProjectInput):
        with sessions() as db:
            p = Project(**body.model_dump())
            db.add(p)
            db.flush()
            record(db, p.id, "Project created")
            db.commit()
            return serialize(p)

    @app.get("/projects/{pid}")
    def detail(pid: str):
        with sessions() as db:
            p = project(db, pid)
            def rows(model):
                return [serialize(v) for v in db.scalars(select(model).where(model.project_id == pid))]
            # Exclude terminal tails in SQL, not only when serializing the response.
            scans = [serialize(s, exclude={"output"}) for s in db.scalars(
                select(Scan).where(Scan.project_id == pid).options(defer(Scan.output)))]
            return {"project": serialize(p), "nodes": rows(Node), "edges": rows(Edge),
                    "scans": sorted(scans, key=lambda s: s["started"], reverse=True),
                    "events": [serialize(v) for v in db.scalars(select(Activity).where(Activity.project_id == pid).order_by(desc(Activity.created)).limit(100))]}

    @app.post("/projects/{pid}/nodes", status_code=201)
    def add_node(pid: str, body: NodeInput):
        with sessions() as db:
            project(db, pid)
            node = Node(id=uid(), project_id=pid, kind="custom", attrs='{"source":"manual","state":"hypothesis"}', **body.model_dump())
            db.add(node)
            record(db, pid, f"Custom node added: {body.label}")
            db.commit()
            return serialize(node)

    @app.put("/projects/{pid}/nodes/{nid}/position")
    def position(pid: str, nid: str, body: Position):
        with sessions() as db:
            node = db.get(Node, nid)
            if node is None or node.project_id != pid:
                raise HTTPException(404)
            node.x, node.y = body.x, body.y
            project(db, pid).updated = now()
            db.commit()
            return {"saved": True}

    @app.delete("/projects/{pid}/nodes/{nid}")
    def delete_node(pid: str, nid: str):
        with sessions() as db:
            node = db.get(Node, nid)
            if node is None or node.project_id != pid:
                raise HTTPException(404)
            if node.kind != "custom":
                raise HTTPException(403, "Only manual objects can be deleted")
            db.query(Edge).filter((Edge.source == nid) | (Edge.target == nid)).delete(synchronize_session=False)
            db.delete(node)
            record(db, pid, "Custom node deleted")
            db.commit()
            return {"deleted": True}

    @app.post("/projects/{pid}/edges", status_code=201)
    def add_edge(pid: str, body: EdgeInput):
        with sessions() as db:
            project(db, pid)
            for nid in (body.source, body.target):
                node = db.get(Node, nid)
                if node is None or node.project_id != pid:
                    raise HTTPException(422, "Both nodes must belong to this project")
            if body.source == body.target:
                raise HTTPException(422, "Choose two different objects")
            eid = f"manual:{pid}:{body.source}:{body.target}"
            edge = db.get(Edge, eid)
            if edge is None:
                edge = Edge(id=eid, project_id=pid, **body.model_dump())
                db.add(edge)
                record(db, pid, "Hypothetical relationship added")
                db.commit()
            return serialize(edge)

    @app.delete("/projects/{pid}/edges/{eid}")
    def delete_edge(pid: str, eid: str):
        with sessions() as db:
            edge = db.get(Edge, eid)
            if edge is None or edge.project_id != pid:
                raise HTTPException(404)
            if edge.evidence:
                raise HTTPException(403, "Evidence relationships cannot be deleted")
            db.delete(edge)
            record(db, pid, "Manual relationship deleted")
            db.commit()
            return {"deleted": True}

    @app.post("/projects/{pid}/scans", status_code=201)
    async def scan(pid: str, body: ScanInput):
        if manager.tasks:
            raise HTTPException(409, "A scan is already running; wait or cancel it")
        tool = nmap.discover()
        if not tool["installed"]:
            raise HTTPException(409, "Nmap is not installed. Install the system nmap package.")
        with sessions() as db:
            project(db, pid)
            scan = Scan(id=uid(), project_id=pid, target=body.target)
            scan.command = json.dumps(nmap.arguments(tool["path"], body.target, manager.artifacts / f"{scan.id}.xml"))
            db.add(scan)
            record(db, pid, f"Scan started: {body.target}")
            db.commit()
            result = serialize(scan)
        manager.tasks[scan.id] = asyncio.create_task(manager.run(scan.id))
        return result

    @app.get("/scans/{sid}")
    def get_scan(sid: str):
        with sessions() as db:
            scan = db.get(Scan, sid)
            if scan is None:
                raise HTTPException(404)
            return serialize(scan)

    @app.post("/scans/{sid}/cancel")
    async def cancel(sid: str):
        await manager.cancel(sid)
        return {"cancelled": True}

    @app.get("/scans/{sid}/artifact")
    def artifact(sid: str):
        with sessions() as db:
            scan = db.get(Scan, sid)
            if not scan or scan.status != "completed":
                raise HTTPException(404)
            path = manager.artifacts / f"{scan.id}.xml"
            return Response(path.read_bytes(), media_type="application/xml")

    return app
