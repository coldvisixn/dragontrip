"""Manual investigation data. No tool execution or mutation of scan evidence."""

import json
import threading
from datetime import date
from typing import Literal
from fastapi import HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select, desc, func
from .db import Knowledge, Node, Scan, Attachment, now, record, serialize

Kind = Literal[
    "note", "finding", "path", "task", "checklist", "workflow", "workflow_run"
]
TASK_STATUSES = {"todo", "in_progress", "blocked", "done", "cancelled"}
RECORD_STATUSES = {"draft", "open", "confirmed", "resolved", "dismissed"}


class Step(BaseModel):
    node_id: str = Field(min_length=1, max_length=300)
    action: str = Field(min_length=1, max_length=500)
    status: Literal["planned", "validated", "blocked"] = "planned"

    @field_validator("action")
    @classmethod
    def not_blank(cls, value):
        if not value.strip():
            raise ValueError("Action cannot be blank")
        return value.strip()


class CheckItem(BaseModel):
    key: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=300)
    state: Literal["not_tested", "in_progress", "tested", "not_applicable"] = (
        "not_tested"
    )
    note: str = Field(default="", max_length=2000)


class WorkflowAction(BaseModel):
    profile: str = Field(min_length=1, max_length=300)
    target: str = Field(min_length=1, max_length=1000)
    service_node: str | None = Field(default=None, max_length=300)
    words: list[str] = Field(default_factory=list, max_length=500)


class RetestEntry(BaseModel):
    at: str = Field(max_length=100)
    result: Literal["fixed", "still_present", "inconclusive"]
    note: str = Field(min_length=1, max_length=2000)


class RetestInput(BaseModel):
    result: Literal["fixed", "still_present", "inconclusive"]
    note: str = Field(min_length=1, max_length=2000)
    expected_updated: str = Field(min_length=1, max_length=100)

    @field_validator("note")
    @classmethod
    def not_blank(cls, value):
        if not value.strip():
            raise ValueError("Describe the retest and supporting evidence")
        return value.strip()


class Content(BaseModel):
    retests: list[RetestEntry] = Field(default_factory=list, max_length=50)
    checks: list[CheckItem] = Field(default_factory=list, max_length=100)
    actions: list[WorkflowAction] = Field(default_factory=list, max_length=8)
    workflow_id: str | None = Field(default=None, max_length=300)
    body: str = Field(default="", max_length=12000)
    node_ids: list[str] = Field(default_factory=list, max_length=50)
    scan_ids: list[str] = Field(default_factory=list, max_length=20)
    attachment_ids: list[str] = Field(default_factory=list, max_length=30)
    severity: Literal["info", "low", "medium", "high", "critical"] = "info"
    status: Literal[
        "draft",
        "open",
        "confirmed",
        "resolved",
        "dismissed",
        "todo",
        "in_progress",
        "blocked",
        "done",
        "cancelled",
    ] = "draft"
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    assignee: str = Field(default="", max_length=100)
    due_date: date | None = None
    remediation: str = Field(default="", max_length=6000)
    steps: list[Step] = Field(default_factory=list, max_length=50)


class KnowledgeInput(BaseModel):
    kind: Kind
    expected_updated: str | None = Field(default=None, max_length=100)
    title: str = Field(min_length=1, max_length=160)
    content: Content = Field(default_factory=Content)

    @field_validator("title")
    @classmethod
    def not_blank(cls, value):
        if not value.strip():
            raise ValueError("Title cannot be blank")
        return value.strip()

    @model_validator(mode="after")
    def path_steps(self):
        if self.kind != "finding" and self.content.retests:
            raise ValueError("Retest history belongs to findings")
        allowed = TASK_STATUSES if self.kind == "task" else RECORD_STATUSES
        if self.content.status not in allowed:
            raise ValueError("Status is not valid for this record type")
        if self.kind == "path" and not self.content.steps:
            raise ValueError("Add at least one path step")
        if self.kind != "path" and self.content.steps:
            raise ValueError("Steps are only available for paths")
        if self.kind == "checklist" and (
            not self.content.checks
            or len({c.key for c in self.content.checks}) != len(self.content.checks)
        ):
            raise ValueError("Methodology checks need unique keys")
        if self.kind in {"workflow", "workflow_run"} and not self.content.actions:
            raise ValueError("Add at least one workflow action")
        return self


def register_workspace(app, sessions, project):
    lock = threading.RLock()

    def validate_links(db, pid, content, previous=None):
        # An existing deleted reference can be retained during editing, but not added anew.
        previous = previous or {}
        old_nodes = set(previous.get("node_ids", [])) | {
            s["node_id"] for s in previous.get("steps", [])
        }
        old_scans = set(previous.get("scan_ids", []))
        nodes = (
            set(content.node_ids)
            | {step.node_id for step in content.steps}
            | {a.service_node for a in content.actions if a.service_node}
        )
        for model, ids, old in [
            (Node, nodes, old_nodes),
            (Scan, set(content.scan_ids), old_scans),
            (
                Attachment,
                set(content.attachment_ids),
                set(previous.get("attachment_ids", [])),
            ),
        ]:
            for rid in ids:
                row = db.get(model, rid)
                if row is None and rid in old:
                    continue
                if row is None or row.project_id != pid:
                    raise HTTPException(422, "References must belong to this project")

    @app.get("/projects/{pid}/knowledge")
    def knowledge(
        pid: str,
        kind: Kind,
        q: str = Query(default="", max_length=100),
        status: Literal[
            "all",
            "draft",
            "open",
            "confirmed",
            "resolved",
            "dismissed",
            "todo",
            "in_progress",
            "blocked",
            "done",
            "cancelled",
        ] = "all",
        offset: int = Query(default=0, ge=0),
        limit: int = Query(default=100, ge=1, le=100),
    ):
        with sessions() as db:
            project(db, pid)
            query = select(Knowledge).where(
                Knowledge.project_id == pid, Knowledge.kind == kind
            )
            if q.strip():
                query = query.where(
                    Knowledge.title.icontains(q.strip(), autoescape=True)
                    | Knowledge.content.icontains(q.strip(), autoescape=True)
                )
            if status != "all":
                query = query.where(
                    func.coalesce(
                        func.json_extract(Knowledge.content, "$.status"), "draft"
                    )
                    == status
                )
            return [
                serialize(v)
                for v in db.scalars(
                    query.order_by(desc(Knowledge.updated), Knowledge.id)
                    .offset(offset)
                    .limit(limit)
                )
            ]

    @app.post("/projects/{pid}/knowledge", status_code=201)
    def add_knowledge(pid: str, body: KnowledgeInput):
        with sessions() as db:
            project(db, pid)
            if body.kind == "workflow_run":
                raise HTTPException(
                    403, "Workflow runs are managed through their launch controls"
                )
            if body.content.retests:
                raise HTTPException(422, "Use the retest controls to append history")
            validate_links(db, pid, body.content)
            row = Knowledge(
                project_id=pid,
                kind=body.kind,
                title=body.title,
                content=body.content.model_dump_json(),
            )
            db.add(row)
            record(db, pid, f"{body.kind.capitalize()} created")
            db.commit()
            return serialize(row)

    @app.get("/projects/{pid}/knowledge/{kid}")
    def get_knowledge(pid: str, kid: str):
        with sessions() as db:
            row = db.get(Knowledge, kid)
            if row is None or row.project_id != pid:
                raise HTTPException(404, "Record not found")
            return serialize(row)

    @app.put("/projects/{pid}/knowledge/{kid}")
    def edit_knowledge(pid: str, kid: str, body: KnowledgeInput):
        with lock, sessions() as db:
            row = db.get(Knowledge, kid)
            if row is None or row.project_id != pid:
                raise HTTPException(404, "Record not found")
            if row.kind == "workflow_run":
                raise HTTPException(403, "Workflow run history is read-only")
            if row.kind != body.kind:
                raise HTTPException(422, "Record type cannot be changed")
            if body.expected_updated and body.expected_updated != row.updated:
                raise HTTPException(
                    409, "Record changed since editing began. Reopen it before saving."
                )
            previous = json.loads(row.content)
            if [r.model_dump() for r in body.content.retests] != previous.get(
                "retests", []
            ):
                raise HTTPException(
                    409, "Retest history is append-only; reopen the finding"
                )
            validate_links(db, pid, body.content, previous)
            row.title, row.content, row.updated = (
                body.title,
                body.content.model_dump_json(),
                now(),
            )
            record(db, pid, f"{body.kind.capitalize()} updated")
            db.commit()
            return serialize(row)

    @app.post("/projects/{pid}/knowledge/{kid}/retests")
    def retest(pid: str, kid: str, body: RetestInput):
        with lock, sessions() as db:
            row = db.get(Knowledge, kid)
            if row is None or row.project_id != pid or row.kind != "finding":
                raise HTTPException(404, "Finding not found")
            if row.updated != body.expected_updated:
                raise HTTPException(
                    409, "Finding changed. Reload it before recording a retest."
                )
            content = json.loads(row.content)
            history = content.get("retests", [])
            if len(history) >= 50:
                raise HTTPException(409, "A finding supports up to 50 retests")
            history.append({"at": now(), "result": body.result, "note": body.note})
            content["retests"] = history
            if body.result == "fixed":
                content["status"] = "resolved"
            elif body.result == "still_present":
                content["status"] = "confirmed"
            row.content, row.updated = json.dumps(content), now()
            record(db, pid, "Finding retest recorded")
            db.commit()
            return serialize(row)

    @app.delete("/projects/{pid}/knowledge/{kid}")
    def delete_knowledge(pid: str, kid: str):
        with sessions() as db:
            row = db.get(Knowledge, kid)
            if row is None or row.project_id != pid:
                raise HTTPException(404, "Record not found")
            if row.kind == "workflow_run":
                raise HTTPException(409, "Workflow run history is retained")
            if json.loads(row.content).get("retests"):
                raise HTTPException(
                    409, "Retest history is retained; dismiss this finding instead"
                )
            from .db import Observation

            if db.query(Observation).filter_by(finding_id=kid).first():
                raise HTTPException(
                    409,
                    "Imported findings retain evidence history; dismiss the finding instead",
                )
            record(db, pid, f"{row.kind.capitalize()} deleted")
            db.delete(row)
            db.commit()
            return {"deleted": True}
