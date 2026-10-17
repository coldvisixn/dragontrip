"""Manual investigation data. No tool execution or mutation of scan evidence."""

import json
import re
from datetime import datetime, timezone
from datetime import date
from typing import Literal
from fastapi import HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select, desc, func
from .db import (
    Knowledge,
    Node,
    Scan,
    Attachment,
    Configuration,
    Observation,
    ImportRun,
    now,
    record,
    serialize,
    uid,
)

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


class Source(BaseModel):
    observation_id: str | None = Field(default=None, max_length=300)
    fingerprint: str | None = Field(default=None, max_length=100)
    node_id: str | None = Field(default=None, max_length=300)
    scan_id: str | None = Field(default=None, max_length=300)
    record_id: str | None = Field(default=None, max_length=300)
    import_id: str | None = Field(default=None, max_length=300)


class Content(BaseModel):
    retests: list[RetestEntry] = Field(default_factory=list, max_length=50)
    step_scan_ids: list[str] = Field(default_factory=list, max_length=8)
    execution: str = Field(default="", max_length=30)
    stop_reason: str = Field(default="", max_length=4000)
    source: Source | None = None
    record_ids: list[str] = Field(default_factory=list, max_length=50)
    observation_ids: list[str] = Field(default_factory=list, max_length=50)

    checks: list[CheckItem] = Field(default_factory=list, max_length=100)
    actions: list[WorkflowAction] = Field(default_factory=list, max_length=8)
    workflow_id: str | None = Field(default=None, max_length=300)
    body: str = Field(default="", max_length=12000)
    node_ids: list[str] = Field(default_factory=list, max_length=50)
    scan_ids: list[str] = Field(default_factory=list, max_length=200)
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
    expected_updated: str | None = Field(default=None, max_length=100)
    request_id: str | None = Field(default=None, pattern=r"^[a-zA-Z0-9-]{1,100}$")
    kind: Kind
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


def migrate_legacy_drafts(sessions):
    """Retain 0.8 WebView/SQLite drafts without changing or deleting their source rows."""
    with sessions() as db:
        legacy = list(
            db.scalars(
                select(Configuration).where(
                    Configuration.id.startswith("draft:", autoescape=True)
                )
            )
        )
        newest = {}
        for row in legacy:
            match = re.fullmatch(
                r"draft:([^:]+):(note|finding|path):(new|[a-f0-9-]{36})", row.id
            )
            if not match:
                continue
            pid, kind, record_id = match.groups()
            saved = json.loads(row.value)
            value = saved.get("value")
            if not value:
                continue
            draft_id = f"legacy-{kind}-{record_id}"
            key = f"workspace:{pid}:draft:{draft_id}"
            if db.get(Configuration, key):
                continue
            timestamp = int(saved["revision"].split("-")[0])
            data = {
                **value,
                "kind": kind,
                "record_id": None if record_id == "new" else record_id,
                "expected_updated": value.get("expectedUpdated"),
                "request_id": draft_id,
                "changed": datetime.fromtimestamp(
                    timestamp / 1000, timezone.utc
                ).isoformat(),
            }
            db.add(
                Configuration(
                    id=key,
                    value=json.dumps(
                        {
                            "revision": timestamp,
                            "closed": False,
                            "value": {"data": data},
                        }
                    ),
                )
            )
            marker = (pid, kind)
            if marker not in newest or timestamp > newest[marker][0]:
                newest[marker] = (timestamp, draft_id, data["record_id"])
        for (pid, kind), (timestamp, draft_id, record_id) in newest.items():
            key = f"workspace:{pid}:knowledge:{kind}"
            if not db.get(Configuration, key):
                db.add(
                    Configuration(
                        id=key,
                        value=json.dumps(
                            {
                                "revision": timestamp,
                                "closed": False,
                                "value": {
                                    "data": {
                                        "editing": True,
                                        "record_id": record_id or "",
                                        "draft_id": draft_id,
                                        "query": "",
                                        "filter": "all",
                                    }
                                },
                            }
                        ),
                    )
                )
        db.commit()


def register_workspace(app, sessions, project):
    lock = app.state.research_lock
    migrate_legacy_drafts(sessions)

    class Cell(BaseModel):
        revision: int = Field(ge=0)
        value: dict | None = None
        closed: bool = False

    def cell_key(pid, key):
        if (
            len(key) > 300
            or not key
            or any(
                c
                not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:._-"
                for c in key
            )
        ):
            raise HTTPException(422, "Invalid workspace key")
        return f"workspace:{pid}:{key}"

    @app.get("/projects/{pid}/workspace")
    def cells(pid: str):
        with sessions() as db:
            project(db, pid)
            prefix = f"workspace:{pid}:"
            return {
                r.id[len(prefix) :]: json.loads(r.value)
                for r in db.scalars(
                    select(Configuration).where(
                        Configuration.id.startswith(prefix, autoescape=True)
                    )
                )
            }

    @app.put("/projects/{pid}/workspace/{key}")
    def save_cell(pid: str, key: str, body: Cell):
        if len(body.model_dump_json()) > 200000:
            raise HTTPException(422, "Workspace item is too large; download your text")
        with lock, sessions() as db:
            project(db, pid)
            identifier = cell_key(pid, key)
            row = db.get(Configuration, identifier)
            old = json.loads(row.value) if row else None
            # Closing a draft is permanent. A delayed autosave cannot resurrect it.
            if old and (old.get("closed") or old["revision"] >= body.revision):
                return old
            if row is None:
                row = Configuration(id=identifier)
                db.add(row)
            row.value = body.model_dump_json()
            db.commit()
            return body.model_dump()

    def validate_links(db, pid, content, previous=None):
        # An existing deleted reference can be retained during editing, but not added anew.
        previous = previous or {}
        old_nodes = set(previous.get("node_ids", [])) | {
            s["node_id"] for s in previous.get("steps", [])
        }
        old_scans = set(previous.get("scan_ids", []))
        source = content.source.model_dump(exclude_none=True) if content.source else {}
        for model, field in [
            (Node, "node_id"),
            (Scan, "scan_id"),
            (Observation, "observation_id"),
            (ImportRun, "import_id"),
            (Knowledge, "record_id"),
        ]:
            ids = [source[field]] if source.get(field) else []
            if model is Observation:
                ids += content.observation_ids
            if model is Knowledge:
                ids += content.record_ids
            for rid in ids:
                row = db.get(model, rid)
                old_source = previous.get("source") or {}
                if row is None and (
                    rid == old_source.get(field)
                    or rid in previous.get("record_ids", [])
                    or rid in previous.get("observation_ids", [])
                ):
                    continue
                if row is None or row.project_id != pid:
                    raise HTTPException(422, "Source must belong to this project")
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

    def source_context(db, pid, kind, identifier):
        models = {
            "observation": Observation,
            "node": Node,
            "scan": Scan,
            "record": Knowledge,
        }
        if kind not in models:
            raise HTTPException(422, "Unknown source type")
        row = db.get(models[kind], identifier)
        if row is None or row.project_id != pid:
            raise HTTPException(404, "Source was deleted or is unavailable")
        return row

    def linked_records(db, pid, kind, source):
        result = []
        for row in db.scalars(
            select(Knowledge).where(
                Knowledge.project_id == pid,
                Knowledge.kind.in_(["note", "finding", "task", "path"]),
            )
        ):
            content = json.loads(row.content)
            ref = content.get("source") or {}
            linked = (
                (
                    kind == "observation"
                    and (
                        source.id in content.get("observation_ids", [])
                        or row.id == source.finding_id
                        or ref.get("fingerprint") == source.fingerprint
                        and ref.get("node_id") == source.node_id
                    )
                )
                or (kind == "node" and source.id in content.get("node_ids", []))
                or (kind == "scan" and source.id in content.get("scan_ids", []))
                or (kind == "record" and source.id in content.get("record_ids", []))
            )
            if linked:
                result.append(serialize(row))
        return result

    @app.get("/projects/{pid}/sources/{kind}/{identifier}/records")
    def source_records(pid: str, kind: str, identifier: str):
        with sessions() as db:
            source = source_context(db, pid, kind, identifier)
            return linked_records(db, pid, kind, source)

    class CreateFromSource(BaseModel):
        kind: Literal["note", "finding", "task"]

    @app.post("/projects/{pid}/sources/{kind}/{identifier}/records", status_code=201)
    def create_from_source(
        pid: str, kind: str, identifier: str, body: CreateFromSource
    ):
        with lock, sessions() as db:
            source = source_context(db, pid, kind, identifier)
            existing = linked_records(db, pid, kind, source)
            # Repeated clicks/imports open the existing record of this type.
            for row in existing:
                if row["kind"] == body.kind:
                    return row
            content = Content(status="todo" if body.kind == "task" else "draft")
            ref = {kind + "_id": identifier}
            label = (
                getattr(source, "label", None)
                or getattr(source, "title", None)
                or getattr(source, "target", None)
            )
            if kind == "observation":
                ref.update(
                    node_id=source.node_id,
                    import_id=source.run_id,
                    fingerprint=source.fingerprint,
                )
                content.observation_ids = [source.id]
                content.node_ids = [source.node_id]
                run = db.get(ImportRun, source.run_id)
                content.attachment_ids = [run.attachment_id]
                node = db.get(Node, source.node_id)
                label = node.label if node else source.locator
                content.body = f"Observation: {source.locator}\n\nHypothesis: \n\nNext check: \n\nResult: "
            elif kind == "node":
                content.node_ids = [source.id]
                observed = db.scalar(
                    select(Observation)
                    .join(ImportRun, ImportRun.id == Observation.run_id)
                    .where(
                        Observation.project_id == pid, Observation.node_id == source.id
                    )
                    .order_by(ImportRun.created.desc(), Observation.id)
                    .limit(1)
                )
                if observed:
                    origin = db.get(ImportRun, observed.run_id)
                    content.observation_ids = [observed.id]
                    content.attachment_ids = [origin.attachment_id]
                    ref.update(
                        observation_id=observed.id,
                        import_id=origin.id,
                        fingerprint=observed.fingerprint,
                    )
                attrs = json.loads(source.attrs)
                scan_id = attrs.get("scan_id")
                if scan_id and db.get(Scan, scan_id):
                    content.scan_ids = [scan_id]
                    ref["scan_id"] = scan_id
            elif kind == "scan":
                content.scan_ids = [source.id]
                content.node_ids = [
                    n.id
                    for n in db.scalars(select(Node).where(Node.project_id == pid))
                    if json.loads(n.attrs).get("scan_id") == source.id
                ][:50]
            elif kind == "record":
                parent = json.loads(source.content)
                content.record_ids = [source.id]
                for field in [
                    "node_ids",
                    "scan_ids",
                    "attachment_ids",
                    "observation_ids",
                ]:
                    setattr(content, field, parent.get(field, []))
                content.body = (
                    f"Hypothesis: {source.title}\n\n{parent.get('body', '')}\n\nCheck: \n\nResult (including unsuccessful checks): "
                )[:12000]
            content.source = Source(**ref)
            if not content.body:
                content.body = (
                    f"Observed: {label}\n\nHypothesis: \n\nNext check: \n\nResult: "
                )
            row = Knowledge(
                project_id=pid,
                kind=body.kind,
                title=(("Check · " if body.kind == "task" else "") + str(label))[:160],
                content=content.model_dump_json(),
            )
            db.add(row)
            record(db, pid, f"{body.kind.capitalize()} drafted from {kind}")
            db.commit()
            return serialize(row)

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
        with lock, sessions() as db:
            project(db, pid)
            identifier = f"{pid}:entry:{body.request_id}" if body.request_id else uid()
            existing = db.get(Knowledge, identifier)
            if existing:
                return serialize(existing)
            if body.kind == "workflow_run":
                raise HTTPException(
                    403, "Workflow runs are managed through their launch controls"
                )
            if body.content.retests:
                raise HTTPException(422, "Use the retest controls to append history")
            validate_links(db, pid, body.content)
            row = Knowledge(
                id=identifier,
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
                # A lost success response may be retried without producing a false conflict.
                if row.title == body.title and json.loads(
                    row.content
                ) == body.content.model_dump(mode="json"):
                    return serialize(row)
                raise HTTPException(
                    409,
                    {"message": "The saved record changed", "current": serialize(row)},
                )
            previous = json.loads(row.content)
            if [r.model_dump() for r in body.content.retests] != previous.get(
                "retests", []
            ):
                raise HTTPException(
                    409,
                    {
                        "message": "Retest history changed; merge with the saved record",
                        "current": serialize(row),
                    },
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
        with lock, sessions() as db:
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
