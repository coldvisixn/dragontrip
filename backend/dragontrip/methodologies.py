"""Four-state manual methodologies and explicitly advanced recon sequences."""

import json
import re
from fastapi import HTTPException
from pydantic import BaseModel, Field
from typing import Literal
from .db import Knowledge, Node, Scan, ScopeRule, now, record, serialize, uid
from .scope import classify
from .import_formats import digest
from . import recon

TEMPLATES = {
    "web": {
        "title": "Web application review",
        "checks": [
            ("surface", "Map pages, endpoints and input parameters"),
            ("auth", "Review authentication and session handling"),
            ("access", "Review access control across roles and objects"),
            ("input", "Review input handling and output encoding"),
            ("headers", "Review security headers, cookies and transport"),
            ("logic", "Review application logic and state changes"),
            ("evidence", "Link evidence and record follow-up actions"),
        ],
    },
    "network": {
        "title": "Network service review",
        "checks": [
            ("exposure", "Confirm service exposure and expected purpose"),
            ("identity", "Identify protocol, product and version"),
            ("transport", "Review transport security and certificates"),
            ("authentication", "Review authentication requirements"),
            ("configuration", "Review service configuration and unnecessary features"),
            ("evidence", "Capture evidence and record follow-up actions"),
        ],
    },
}


def register_methodologies(
    app, sessions, project, profiles, scan_handler, scan_input, manager
):
    lock = app.state.research_lock

    def entry(db, pid, kid, kind):
        row = db.get(Knowledge, kid)
        if row is None or row.project_id != pid or row.kind != kind:
            raise HTTPException(404, "Research record not found")
        return row

    @app.get("/methodology-templates")
    def templates():
        return [{"id": key, **value} for key, value in TEMPLATES.items()]

    class ApplyTemplate(BaseModel):
        template: Literal["web", "network"]
        node_id: str = Field(min_length=1, max_length=300)

    @app.post("/projects/{pid}/methodologies", status_code=201)
    def apply_template(pid: str, body: ApplyTemplate):
        with lock, sessions() as db:
            project(db, pid)
            node = db.get(Node, body.node_id)
            if node is None or node.project_id != pid:
                raise HTTPException(422, "Choose an object in this project")
            identifier = (
                pid
                + ":methodology:"
                + digest(
                    [
                        body.template,
                        (
                            body.node_id[len(pid) :]
                            if body.node_id.startswith(pid + ":")
                            else body.node_id
                        ),
                    ]
                )[:32]
            )
            existing = db.get(Knowledge, identifier)
            if existing:
                return serialize(existing)
            template = TEMPLATES[body.template]
            row = Knowledge(
                id=identifier,
                project_id=pid,
                kind="checklist",
                title=f"{template['title']} · {node.label}"[:160],
                content=json.dumps(
                    {
                        "status": "open",
                        "node_ids": [node.id],
                        "checks": [
                            {
                                "key": key,
                                "title": title,
                                "state": "not_tested",
                                "note": "",
                            }
                            for key, title in template["checks"]
                        ],
                        "scan_ids": [],
                        "attachment_ids": [],
                        "body": "",
                        "steps": [],
                    }
                ),
            )
            db.add(row)
            record(db, pid, "Methodology added: all checks are not tested")
            db.commit()
            return serialize(row)

    def plan(db, pid, workflow, run=None):
        content = json.loads(workflow.content)
        actions = content.get("actions", [])
        if not actions:
            raise HTTPException(422, "Add at least one workflow action")
        available = {p["id"]: p for p in profiles()}
        rules = list(
            db.query(ScopeRule).filter_by(project_id=pid).order_by(ScopeRule.id)
        )
        result = []
        for action in actions:
            profile = available.get(action["profile"])
            item = {**action, "error": "", "scope": "unknown", "parameters": profile}
            try:
                if not profile:
                    raise ValueError(
                        "Saved profile is unavailable; select an existing profile"
                    )
                normalized = recon.validate_profile(profile)
                target = recon.target(action["target"], profile["tool"])
                item.update(target=target, scope=classify(rules, target))
                if item["scope"] != "included":
                    raise ValueError(
                        "Workflow targets require explicit project scope inclusion"
                    )
                if profile["tool"] == "ffuf" and (
                    not action.get("words")
                    or any(
                        not re.fullmatch(r"[a-zA-Z0-9_.\-/]{1,100}", w)
                        or ".." in w
                        or w.startswith("/")
                        for w in action["words"]
                    )
                ):
                    raise ValueError(
                        "Supply 1–500 relative wordlist entries without traversal or URLs"
                    )
                if action.get("service_node"):
                    node = db.get(Node, action["service_node"])
                    attrs = json.loads(node.attrs) if node else {}
                    if (
                        not node
                        or node.project_id != pid
                        or node.kind != "service"
                        or attrs.get("host") != target
                        or attrs.get("state") != "open"
                        or attrs.get("protocol") != "tcp"
                        or action["profile"] != "service"
                    ):
                        raise ValueError(
                            "Selected service is no longer valid for this target"
                        )
                item["parameters"] = {**profile, **normalized}
            except ValueError as exc:
                item["error"] = str(exc)
            result.append(item)
        state = json.loads(run.content) if run else None
        token = digest(
            [
                workflow.id,
                workflow.content,
                result,
                [(r.mode, r.value) for r in rules],
                state,
            ]
        )
        return {
            "preview_token": token,
            "actions": result,
            "ready": all(not a["error"] for a in result),
            "notice": "Each step requires an explicit launch. Following steps wait for successful completion; findings never mark a methodology check as tested.",
        }

    @app.post("/projects/{pid}/workflows/{wid}/preview")
    def preview(pid: str, wid: str):
        with sessions() as db:
            project(db, pid)
            return plan(db, pid, entry(db, pid, wid, "workflow"))

    class Start(BaseModel):
        preview_token: str = Field(max_length=100)

    @app.post("/projects/{pid}/workflows/{wid}/runs", status_code=201)
    def start(pid: str, wid: str, body: Start):
        with lock, sessions() as db:
            workflow = entry(db, pid, wid, "workflow")
            preview = plan(db, pid, workflow)
            if body.preview_token != preview["preview_token"]:
                raise HTTPException(409, "Workflow preview is stale")
            if not preview["ready"]:
                raise HTTPException(422, "Resolve preview errors before creating a run")
            # Snapshot the ordered actions; edits to the saved workflow affect future runs only.
            row = Knowledge(
                id=uid(),
                project_id=pid,
                kind="workflow_run",
                title=workflow.title,
                content=json.dumps(
                    {
                        "workflow_id": workflow.id,
                        "actions": json.loads(workflow.content)["actions"],
                        "status": "open",
                        "scan_ids": [],
                        "node_ids": [],
                        "body": "",
                        "steps": [],
                    }
                ),
            )
            db.add(row)
            record(db, pid, "Guided workflow run created; no task started")
            db.commit()
            return serialize(row)

    def snapshot(run):
        return Knowledge(
            id=run.id,
            project_id=run.project_id,
            kind="workflow",
            title=run.title,
            content=run.content,
        )

    @app.get("/projects/{pid}/workflow-runs/{rid}/preview")
    def run_preview(pid: str, rid: str):
        with sessions() as db:
            run = entry(db, pid, rid, "workflow_run")
            content = json.loads(run.content)
            scans = [
                serialize(db.get(Scan, sid), exclude={"output"})
                for sid in content.get("scan_ids", [])
                if db.get(Scan, sid)
            ]
            return {
                **plan(db, pid, snapshot(run), run),
                "run": serialize(run),
                "scans": scans,
            }

    class Launch(BaseModel):
        preview_token: str = Field(max_length=100)
        authorized: Literal[True]
        confirmed: bool = False

    @app.post("/projects/{pid}/workflow-runs/{rid}/next", status_code=201)
    async def launch_next(pid: str, rid: str, body: Launch):
        # All launches share the existing queue, target validation and process cancellation.
        # An async lock prevents double-clicks while tool discovery awaits.
        async with app.state.workflow_launch_lock:
            with sessions() as db:
                run = entry(db, pid, rid, "workflow_run")
                content = json.loads(run.content)
                preview = plan(db, pid, snapshot(run), run)
                if body.preview_token != preview["preview_token"]:
                    raise HTTPException(
                        409, "Run preview is stale; refresh before launching"
                    )
                if content["status"] != "open":
                    raise HTTPException(409, "Run is stopped")
                previous = [db.get(Scan, sid) for sid in content.get("scan_ids", [])]
                if any(not s or s.status != "completed" for s in previous):
                    raise HTTPException(
                        409,
                        "Previous steps must complete successfully; cancel or create a new run after failure",
                    )
                index = len(previous)
                if index >= len(content["actions"]):
                    raise HTTPException(
                        409, "All workflow steps have already been launched"
                    )
                if not preview["ready"]:
                    raise HTTPException(
                        422, "Scope/profile changed; resolve preview errors"
                    )
                action = content["actions"][index]
            result = await scan_handler(
                pid,
                scan_input(
                    **action,
                    authorized=True,
                    confirmed=body.confirmed,
                    scope_required=True,
                ),
            )
            with sessions() as db:
                run = entry(db, pid, rid, "workflow_run")
                content = json.loads(run.content)
                content.setdefault("scan_ids", []).append(result["id"])
                run.content, run.updated = json.dumps(content), now()
                record(db, pid, f"Workflow step {index+1} queued: {run.title}")
                db.commit()
            return result

    @app.post("/projects/{pid}/workflow-runs/{rid}/stop")
    async def stop(pid: str, rid: str):
        async with app.state.workflow_launch_lock:
            with sessions() as db:
                run = entry(db, pid, rid, "workflow_run")
                content = json.loads(run.content)
                content["status"] = "dismissed"
                run.content, run.updated = json.dumps(content), now()
                db.commit()
                scans = list(content.get("scan_ids", []))
            for sid in scans:
                await manager.cancel(sid)
            return {"stopped": True}
