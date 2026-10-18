"""Project timeline/search, user preferences and graph view persistence."""

import json
import os
from pathlib import Path
from typing import Literal
from fastapi import HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, desc, func, or_
from . import recon
from .db import Node, Scan, Knowledge, Activity, Attachment, GraphView, serialize


class Preferences(BaseModel):
    theme: Literal["dark", "light", "system"] = "dark"
    accent: Literal["purple", "cyan", "green"] = "purple"
    density: Literal["comfortable", "compact"] = "comfortable"
    reduced_motion: bool = False
    graph_detail: Literal["auto", "full", "compact"] = "auto"
    performance_profile: Literal["low", "medium", "high"] = "medium"


class ViewInput(BaseModel):
    x: float = Field(ge=-10000000, le=10000000, allow_inf_nan=False)
    y: float = Field(ge=-10000000, le=10000000, allow_inf_nan=False)
    zoom: float = Field(ge=0.05, le=2, allow_inf_nan=False)


class ToolPaths(BaseModel):
    paths: dict[Literal["nmap", "whatweb", "httpx", "ffuf"], str] = Field(
        default_factory=dict
    )


def register_product(app, sessions, project, configuration, save_configuration):
    @app.get("/settings")
    def settings():
        return {
            "appearance": Preferences(**configuration("appearance", {})).model_dump(),
            "tools": configuration("tool_paths", {}),
        }

    @app.put("/settings/appearance")
    def appearance(body: Preferences):
        save_configuration("appearance", body.model_dump())
        return body.model_dump()

    @app.put("/settings/tools")
    async def tools(body: ToolPaths):
        paths = {}
        for key, path in body.paths.items():
            if not path:
                continue
            if (
                len(path) > 500
                or not Path(path).is_absolute()
                or not Path(path).is_file()
                or not os.access(path, os.X_OK)
            ):
                raise HTTPException(
                    422, "Tool locations must be absolute paths to executable files"
                )
            paths[key] = path
        results = await recon.discover(overrides=paths)
        for result in results:
            if result["id"] in paths and not result["installed"]:
                raise HTTPException(
                    422,
                    result["name"]
                    + ": "
                    + result.get("version", "Version check failed"),
                )
        save_configuration("tool_paths", paths)
        return {"paths": paths, "tools": results}

    @app.get("/projects/{pid}/view")
    def view(pid: str):
        with sessions() as db:
            project(db, pid)
            row = db.get(GraphView, pid)
            return json.loads(row.value) if row else None

    @app.put("/projects/{pid}/view")
    def save_view(pid: str, body: ViewInput):
        with sessions() as db:
            project(db, pid)
            row = db.get(GraphView, pid)
            if row is None:
                row = GraphView(project_id=pid)
                db.add(row)
            row.value = body.model_dump_json()
            db.commit()
            return body.model_dump()

    @app.get("/projects/{pid}/timeline")
    def timeline(
        pid: str,
        q: str = Query(default="", max_length=100),
        offset: int = Query(default=0, ge=0),
        limit: int = Query(default=50, ge=1, le=100),
    ):
        with sessions() as db:
            project(db, pid)
            filters = [Activity.project_id == pid]
            if q.strip():
                filters.append(Activity.message.icontains(q.strip(), autoescape=True))
            total = db.scalar(
                select(func.count()).select_from(Activity).where(*filters)
            )
            rows = db.scalars(
                select(Activity)
                .where(*filters)
                .order_by(desc(Activity.created), Activity.id)
                .offset(offset)
                .limit(limit)
            )
            return {"total": total, "items": [serialize(row) for row in rows]}

    @app.get("/projects/{pid}/search")
    def search(
        pid: str,
        q: str = Query(min_length=1, max_length=100),
        category: Literal[
            "all", "objects", "knowledge", "scans", "evidence", "events"
        ] = "all",
        offset: int = Query(default=0, ge=0),
        limit: int = Query(default=30, ge=1, le=100),
    ):
        with sessions() as db:
            project(db, pid)
            # SQL selects only searchable text/metadata: never vault contents or XML buffers.
            sources = [
                (
                    "objects",
                    Node,
                    Node.label,
                    "object",
                    Node.kind,
                    [
                        Node.label,
                        func.json_remove(
                            Node.attrs, "$.evidence_xml", "$.evidence_json"
                        ),
                    ],
                ),
                (
                    "knowledge",
                    Knowledge,
                    Knowledge.title,
                    "knowledge",
                    Knowledge.kind,
                    [Knowledge.title, Knowledge.content],
                ),
                (
                    "scans",
                    Scan,
                    Scan.target,
                    "scan",
                    Scan.status,
                    [Scan.target, Scan.tool, Scan.profile],
                ),
                (
                    "evidence",
                    Attachment,
                    Attachment.filename,
                    "attachment",
                    Attachment.media_type,
                    [Attachment.filename],
                ),
                (
                    "events",
                    Activity,
                    Activity.message,
                    "event",
                    Activity.created,
                    [Activity.message],
                ),
            ]
            result, total = [], 0
            for group, model, title, kind, subtype, searchable in sources:
                if category != "all" and category != group:
                    continue
                filters = [
                    model.project_id == pid,
                    or_(
                        *(
                            column.icontains(q.strip(), autoescape=True)
                            for column in searchable
                        )
                    ),
                ]
                count = db.scalar(
                    select(func.count()).select_from(model).where(*filters)
                )
                start = max(0, offset - total)
                remaining = max(0, limit - len(result))
                if remaining and start < count:
                    for row in db.execute(
                        select(model.id, title.label("title"), subtype.label("subtype"))
                        .where(*filters)
                        .order_by(model.id)
                        .offset(start)
                        .limit(remaining)
                    ):
                        result.append(
                            {
                                "id": row.id,
                                "title": row.title,
                                "kind": kind,
                                "subtype": row.subtype,
                            }
                        )
                total += count
            return {"total": total, "items": result}
