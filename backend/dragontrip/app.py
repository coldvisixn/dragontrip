import asyncio
import hmac
import json
import os
import signal
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from alembic import command
from alembic.config import Config
from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, desc, func
from sqlalchemy.orm import defer

from .db import (
    database,
    data_dir,
    Project,
    Node,
    Edge,
    Scan,
    Activity,
    Configuration,
    serialize,
    uid,
    record,
    now,
)
from .tasks import TaskManager
from . import recon
from .graph import Placement
from .workspace import register_workspace
from .vault import register_vault
from .evidence import register_evidence
from .product import register_product
from .reporting import register_reporting
from .archives import register_archives
from .scope import register_scope, classify
from .imports import register_imports
from .db import ScopeRule
from .methodologies import register_methodologies


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
    target: str = Field(max_length=1000)
    authorized: Literal[True]
    scope_required: bool = False
    profile: str = "quick"
    confirmed: bool = False
    service_node: str | None = Field(default=None, max_length=300)
    words: list[str] = Field(default_factory=list, max_length=500)


class ProfileInput(BaseModel):
    name: str
    tool: Literal["nmap", "whatweb", "httpx", "ffuf"]
    ports: str = ""
    scripts: list[str] = Field(default_factory=list, max_length=4)
    rate: int = Field(default=50, ge=1, le=1000)
    timeout: int = Field(default=240, ge=10, le=900)


class QueueInput(BaseModel):
    concurrency: int = Field(ge=1, le=3)


class NodeContent(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    category: Literal["note", "asset", "hypothesis", "task", "reference"] = "hypothesis"
    description: str = Field(default="", max_length=8000)
    status: Literal["idea", "investigating", "confirmed", "dismissed", "done"] = "idea"
    tags: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("label")
    @classmethod
    def not_blank(cls, value):
        if not value.strip():
            raise ValueError("Label cannot be blank")
        return value.strip()

    @field_validator("tags")
    @classmethod
    def valid_tags(cls, values):
        if any(not value.strip() or len(value.strip()) > 30 for value in values):
            raise ValueError("Tags must contain 1–30 characters")
        return list(dict.fromkeys(value.strip() for value in values))

    def attrs(self):
        return {
            "source": "manual",
            "state": "hypothesis",
            **self.model_dump(include={"category", "description", "status", "tags"}),
        }


class NodeInput(NodeContent):
    x: float = Field(default=200, ge=-1000000, le=1000000, allow_inf_nan=False)
    y: float = Field(default=200, ge=-1000000, le=1000000, allow_inf_nan=False)


class Position(BaseModel):
    x: float = Field(ge=-1000000, le=1000000, allow_inf_nan=False)
    y: float = Field(ge=-1000000, le=1000000, allow_inf_nan=False)


class EdgeInput(BaseModel):
    source: str
    target: str


class EdgeContent(BaseModel):
    kind: str = Field(min_length=1, max_length=80)

    @field_validator("kind")
    @classmethod
    def not_blank(cls, value):
        if not value.strip():
            raise ValueError("Relationship label cannot be blank")
        return value.strip()


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
    profile_lock = threading.Lock()

    def configuration(key, default):
        with sessions() as db:
            row = db.get(Configuration, key)
            return json.loads(row.value) if row else default

    def save_configuration(key, value):
        with sessions() as db:
            row = db.get(Configuration, key)
            if row is None:
                row = Configuration(id=key)
                db.add(row)
            row.value = json.dumps(value)
            db.commit()

    def profiles():
        return recon.DEFAULTS + configuration("profiles", [])

    async def discover_tools(only=None):
        paths = configuration("tool_paths", {})
        return (
            await recon.discover(only, overrides=paths)
            if paths
            else await recon.discover(only)
        )

    manager = TaskManager(sessions, root / "artifacts")
    manager.concurrency = configuration("concurrency", 1)
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

        async def expire_vault():
            while True:
                await asyncio.sleep(1)
                with app.state.vault.lock:
                    try:
                        app.state.vault.require(touch=False)
                    except HTTPException:
                        pass

        vault_timer = asyncio.create_task(expire_vault())
        yield
        watchdog.cancel()
        vault_timer.cancel()
        await asyncio.gather(watchdog, vault_timer, return_exceptions=True)
        await manager.close()
        app.state.vault.clear()
        engine.dispose()

    app = FastAPI(
        title="Dragontrip local API",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    app.state.sessions, app.state.manager = sessions, manager
    app.state.research_lock = threading.RLock()
    app.state.workflow_launch_lock = asyncio.Lock()

    @app.middleware("http")
    async def guard(request: Request, call_next):
        host = request.headers.get("host", "").split(":")[0]
        if host != "127.0.0.1":
            return Response(status_code=403)
        origin = request.headers.get("origin")
        if origin and origin not in origins:
            return Response(status_code=403)
        cors = (
            {"Access-Control-Allow-Origin": origin, "Vary": "Origin"} if origin else {}
        )
        if request.method == "OPTIONS":
            if origin not in origins:
                return Response(status_code=403)
            return Response(
                headers={
                    **cors,
                    "Access-Control-Allow-Headers": "Authorization, Content-Type",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                }
            )
        if not hmac.compare_digest(
            request.headers.get("authorization", ""), f"Bearer {token}"
        ):
            return Response(status_code=401, headers=cors)
        upload = request.method == "POST" and (
            request.url.path.endswith("/attachments")
            or request.url.path == "/imports"
            or "/tool-import/" in request.url.path
        )
        limit = (
            140 * 1024 * 1024
            if request.url.path == "/imports"
            else 11 * 1024 * 1024 if upload else 256 * 1024
        )
        try:
            length = int(request.headers.get("content-length", "0"))
        except ValueError:
            return Response(status_code=400, headers=cors)
        if length < 0:
            return Response(status_code=400, headers=cors)
        if upload and "content-length" not in request.headers:
            return Response(status_code=411, headers=cors)
        if length > limit:
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

    register_scope(app, sessions, project)
    register_imports(app, sessions, project, root)
    register_workspace(app, sessions, project)
    register_reporting(app, sessions, project)
    register_vault(app, sessions, project)
    register_evidence(app, sessions, project, root)
    register_product(app, sessions, project, configuration, save_configuration)
    register_archives(app, sessions, project, root)

    @app.get("/health")
    def health():
        return {"status": "ready"}

    @app.get("/tools")
    async def tools():
        return await discover_tools()

    @app.get("/profiles")
    def get_profiles():
        return profiles()

    @app.post("/profiles", status_code=201)
    def add_profile(body: ProfileInput):
        try:
            value = recon.validate_profile(body.model_dump())
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        value["id"] = uid()
        with profile_lock:
            current = configuration("profiles", [])
            if len(current) >= 30:
                raise HTTPException(409, "Maximum 30 custom profiles")
            save_configuration("profiles", current + [value])
        return value

    @app.delete("/profiles/{profile_id}")
    def delete_profile(profile_id: str):
        with profile_lock:
            save_configuration(
                "profiles",
                [p for p in configuration("profiles", []) if p["id"] != profile_id],
            )
        return {"deleted": True}

    @app.get("/queue")
    def queue():
        with sessions() as db:
            return {
                "concurrency": manager.concurrency,
                "tasks": [
                    serialize(v, exclude={"output"})
                    for v in db.scalars(
                        select(Scan)
                        .where(Scan.status.in_(["queued", "running"]))
                        .order_by(Scan.queued_at)
                    )
                ],
            }

    @app.put("/queue")
    async def set_queue(body: QueueInput):
        save_configuration("concurrency", body.concurrency)
        await manager.configure(body.concurrency)
        return {"concurrency": manager.concurrency}

    @app.get("/projects")
    def projects():
        with sessions() as db:
            return [
                serialize(p)
                for p in db.scalars(select(Project).order_by(desc(Project.updated)))
            ]

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
    def detail(pid: str, compact: bool = False):
        with sessions() as db:
            p = project(db, pid)

            def rows(model):
                if compact and model is Node:
                    query = select(
                        Node.id,
                        Node.project_id,
                        Node.kind,
                        Node.label,
                        Node.x,
                        Node.y,
                        func.json_remove(
                            Node.attrs,
                            "$.evidence_xml",
                            "$.evidence_json",
                            "$.observations",
                        ).label("attrs"),
                    ).where(Node.project_id == pid)
                    return [
                        {**dict(row._mapping), "attrs": json.loads(row.attrs)}
                        for row in db.execute(query)
                    ]
                return [
                    serialize(v)
                    for v in db.scalars(select(model).where(model.project_id == pid))
                ]

            # Exclude terminal tails in SQL, not only when serializing the response.
            recent = (
                select(Scan.id)
                .where(Scan.project_id == pid)
                .order_by(desc(Scan.queued_at))
                .limit(100)
            )
            scans = [
                serialize(s, exclude={"output"})
                for s in db.scalars(
                    select(Scan)
                    .where(
                        Scan.project_id == pid,
                        (Scan.id.in_(recent)) | Scan.status.in_(["queued", "running"]),
                    )
                    .options(defer(Scan.output))
                )
            ]
            return {
                "project": serialize(p),
                "nodes": rows(Node),
                "edges": rows(Edge),
                "scans": sorted(scans, key=lambda s: s["queued_at"], reverse=True),
                "events": [
                    serialize(v)
                    for v in db.scalars(
                        select(Activity)
                        .where(Activity.project_id == pid)
                        .order_by(desc(Activity.created))
                        .limit(100)
                    )
                ],
            }

    @app.get("/projects/{pid}/nodes/{nid}")
    def get_node(pid: str, nid: str):
        with sessions() as db:
            row = db.get(Node, nid)
            if row is None or row.project_id != pid:
                raise HTTPException(404, "Object not found")
            return serialize(row)

    @app.get("/projects/{pid}/scan-history")
    def scan_history(
        pid: str,
        q: str = Query(default="", max_length=100),
        status: str = Query(default="all", max_length=30),
        tool: str = Query(default="all", max_length=30),
        offset: int = Query(default=0, ge=0),
        limit: int = Query(default=50, ge=1, le=100),
    ):
        with sessions() as db:
            project(db, pid)
            filters = [Scan.project_id == pid]
            if status != "all":
                filters.append(Scan.status == status)
            if tool != "all":
                filters.append(Scan.tool == tool)
            if q:
                filters.append(
                    Scan.target.contains(q, autoescape=True)
                    | Scan.tool.contains(q, autoescape=True)
                    | Scan.profile.contains(q, autoescape=True)
                    | Scan.options.contains(q, autoescape=True)
                )
            total = db.scalar(select(func.count()).select_from(Scan).where(*filters))
            rows = db.scalars(
                select(Scan)
                .where(*filters)
                .options(defer(Scan.output))
                .order_by(desc(Scan.queued_at), desc(Scan.id))
                .offset(offset)
                .limit(limit)
            )
            return {
                "total": total,
                "items": [serialize(row, exclude={"output"}) for row in rows],
            }

    @app.post("/projects/{pid}/nodes", status_code=201)
    def add_node(pid: str, body: NodeInput):
        with sessions() as db:
            project(db, pid)
            node = Node(
                id=uid(),
                project_id=pid,
                kind="custom",
                label=body.label,
                attrs=json.dumps(body.attrs()),
                **Placement(db, pid).reserve(body.x, body.y),
            )
            db.add(node)
            record(db, pid, f"Custom node added: {body.label}")
            db.commit()
            return serialize(node)

    @app.put("/projects/{pid}/nodes/{nid}")
    def edit_node(pid: str, nid: str, body: NodeContent):
        with sessions() as db:
            node = db.get(Node, nid)
            if node is None or node.project_id != pid:
                raise HTTPException(404, "Object not found")
            if node.kind != "custom":
                raise HTTPException(
                    403, "Observed objects are read-only; attach a note instead"
                )
            node.label, node.attrs = body.label, json.dumps(body.attrs())
            record(db, pid, "Custom node updated")
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
            db.query(Edge).filter((Edge.source == nid) | (Edge.target == nid)).delete(
                synchronize_session=False
            )
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

    @app.put("/projects/{pid}/edges/{eid}")
    def edit_edge(pid: str, eid: str, body: EdgeContent):
        with sessions() as db:
            edge = db.get(Edge, eid)
            if edge is None or edge.project_id != pid:
                raise HTTPException(404, "Relationship not found")
            if edge.evidence:
                raise HTTPException(403, "Observed relationships are read-only")
            edge.kind = body.kind
            record(db, pid, "Manual relationship updated")
            db.commit()
            return serialize(edge)

    @app.post("/projects/{pid}/scans", status_code=201)
    async def scan(pid: str, body: ScanInput):
        if len(manager.tasks) >= 32:
            raise HTTPException(409, "Queue is full (32 tasks)")
        profile = next((p for p in profiles() if p["id"] == body.profile), None)
        if profile is None:
            raise HTTPException(422, "Unknown scan profile")
        try:
            profile = {**profile, **recon.validate_profile(profile)}
            destination = recon.target(body.target, profile["tool"])
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        with sessions() as db:
            project(db, pid)
            rules = list(db.query(ScopeRule).filter_by(project_id=pid))
            if (body.scope_required and not rules) or (
                rules and classify(rules, destination) != "included"
            ):
                raise HTTPException(422, "Target is outside explicit project scope")
        if body.service_node and profile["id"] == "service":
            with sessions() as db:
                node = db.get(Node, body.service_node)
                attrs = json.loads(node.attrs) if node else {}
                if (
                    not node
                    or node.project_id != pid
                    or node.kind != "service"
                    or attrs.get("host") != destination
                    or attrs.get("state") != "open"
                    or attrs.get("protocol") != "tcp"
                ):
                    raise HTTPException(
                        422, "Select an observed TCP service in this project"
                    )
                profile = {**profile, "ports": str(attrs["port"])}
        intrusive = (
            bool(profile.get("scripts"))
            or profile["tool"] == "ffuf"
            or profile["id"] == "full"
            or profile["rate"] > (100 if profile["tool"] == "nmap" else 10)
        )
        if profile["tool"] == "nmap" and profile["ports"]:
            count = sum(
                int(v.split("-")[-1]) - int(v.split("-")[0]) + 1
                for v in profile["ports"].split(",")
            )
            intrusive = intrusive or count > 1000
        if intrusive and not body.confirmed:
            raise HTTPException(422, "Confirm the higher-traffic scan explicitly")
        tool = (await discover_tools(profile["tool"]))[0]
        if not tool["installed"]:
            raise HTTPException(
                409,
                f"{tool['name']} is unavailable. Check Tools for installation details.",
            )
        if len(manager.tasks) >= 32:
            raise HTTPException(409, "Queue is full (32 tasks)")
        if profile["tool"] == "ffuf":
            import re

            if not body.words or any(
                not re.fullmatch(r"[a-zA-Z0-9_.\-/]{1,100}", word)
                or ".." in word
                or word.startswith("/")
                for word in body.words
            ):
                raise HTTPException(
                    422, "Supply 1–500 relative wordlist entries (no traversal or URLs)"
                )
        with sessions() as db:
            project(db, pid)
            current_scope = list(db.query(ScopeRule).filter_by(project_id=pid))
            if (body.scope_required and not current_scope) or (
                current_scope and classify(current_scope, destination) != "included"
            ):
                raise HTTPException(422, "Target is outside current project scope")
            scan = Scan(
                id=uid(),
                project_id=pid,
                target=destination,
                tool=profile["tool"],
                profile=profile["id"],
                options=json.dumps(
                    {
                        **profile,
                        "scope_required": body.scope_required or bool(current_scope),
                    }
                ),
            )
            extension = "xml" if scan.tool == "nmap" else "json"
            words = manager.artifacts / f"{scan.id}.words"
            if scan.tool == "ffuf":
                words.write_text("\n".join(body.words) + "\n")
                words.chmod(0o600)
            scan.command = json.dumps(
                recon.arguments(
                    tool["path"],
                    profile,
                    destination,
                    manager.artifacts / f"{scan.id}.{extension}",
                    words,
                )
            )
            db.add(scan)
            record(db, pid, f"Queued {profile['name']}: {destination}")
            db.commit()
            result = serialize(scan)
        manager.enqueue(scan.id)
        return result

    @app.get("/projects/{pid}/recommendations")
    def recommendations(pid: str):
        with sessions() as db:
            project(db, pid)
            result = []
            for node in db.scalars(
                select(Node).where(Node.project_id == pid, Node.kind == "service")
            ):
                attrs = json.loads(node.attrs)
                if attrs.get("state") != "open":
                    continue
                if attrs.get("protocol") == "tcp":
                    result.append(
                        {
                            "node_id": node.id,
                            "target": attrs["host"],
                            "profile": "service",
                            "reason": f"Enumerate observed TCP port {attrs['port']}",
                            "requires_confirmation": True,
                        }
                    )
                name = str(attrs.get("name", ""))
                if "http" in name or attrs.get("port") in [80, 443, 8000, 8080, 8443]:
                    scheme = (
                        "https"
                        if "https" in name
                        or attrs.get("port") in [443, 8443]
                        or "ssl" in name
                        else "http"
                    )
                    url = f"{scheme}://{attrs['host']}:{attrs['port']}/"
                    for profile_id, reason in [
                        ("whatweb", "Identify web technologies"),
                        ("httpx", "Inspect HTTP status, title and server"),
                        ("ffuf", "Discover paths with an explicit wordlist"),
                    ]:
                        result.append(
                            {
                                "node_id": node.id,
                                "target": url,
                                "profile": profile_id,
                                "reason": reason,
                                "requires_confirmation": profile_id == "ffuf",
                            }
                        )
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
            extension = "xml" if scan.tool == "nmap" else "json"
            path = manager.artifacts / f"{scan.id}.{extension}"
            if not path.is_file():
                raise HTTPException(404, "Evidence file is missing")
            return Response(
                path.read_bytes(),
                media_type=(
                    "application/xml" if extension == "xml" else "application/json"
                ),
            )

    register_methodologies(app, sessions, project, profiles, scan, ScanInput, manager)
    return app
