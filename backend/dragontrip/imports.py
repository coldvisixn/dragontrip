"""Two-step offline import, stable graph entities, immutable source observations."""

import hashlib
import json
from fastapi import File, Form, HTTPException, UploadFile, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from .db import (
    Node,
    Edge,
    Knowledge,
    Attachment,
    ScopeRule,
    ImportRun,
    Observation,
    serialize,
    uid,
    record,
)
from .entities import nid, upsert_objects
from .scope import classify
from .import_formats import parse_source, digest, web_record, MAX_SOURCE
from .evidence import validate_file, MAX_PROJECT_EVIDENCE


def finding_key(fmt, row):
    finding = row.get("finding")
    if not finding:
        return None
    return (
        "finding:"
        + digest(
            [
                fmt,
                row["key"],
                finding.get("type"),
                finding.get("name"),
                finding.get("location"),
                finding.get("serial", ""),
            ]
        )[:32]
    )


def build_plan(db, pid, fmt, records, sha, include_unknown):
    rules = list(db.query(ScopeRule).filter_by(project_id=pid).order_by(ScopeRule.id))
    existing = set(db.scalars(select(Node.id).where(Node.project_id == pid)))
    findings = set(
        db.scalars(
            select(Knowledge.id).where(
                Knowledge.project_id == pid, Knowledge.kind == "finding"
            )
        )
    )
    duplicate = db.query(ImportRun).filter_by(project_id=pid, sha256=sha).first()
    rows = []
    objects, issue_keys = {}, set()
    selected = []
    for row in records:
        state = classify(rules, row["scope_target"], row.get("ip", ""))
        accept = state == "included" or (state == "unknown" and include_unknown)
        fk = finding_key(fmt, row)
        rows.append(
            {
                "locator": row["locator"],
                "label": row["objects"][-1]["label"],
                "kind": row["objects"][-1]["kind"],
                "scope": state,
                "selected": accept,
                "match": "existing" if nid(pid, row["key"]) in existing else "new",
                "finding": row.get("finding", {}).get("name"),
                "finding_match": (
                    ("existing" if nid(pid, fk) in findings else "new") if fk else None
                ),
            }
        )
        if accept:
            selected.append(row)
            objects.update({o["key"]: o for o in row["objects"]})
            if fk:
                issue_keys.add(nid(pid, fk))
    new = sum(nid(pid, key) not in existing for key in objects)
    summary = {
        "records": len(records),
        "selected": len(selected),
        "objects": len(objects),
        "new_objects": new,
        "matched_objects": len(objects) - new,
        "applications": sum(o["kind"] == "application" for o in objects.values()),
        "endpoints": sum(o["kind"] == "endpoint" for o in objects.values()),
        "findings": len(issue_keys),
        "new_findings": len(issue_keys - findings),
        "excluded": sum(r["scope"] == "excluded" for r in rows),
        "unknown": sum(r["scope"] == "unknown" for r in rows),
    }
    # Preview becomes stale if scope, membership, or source-import status changes.
    token = digest(
        [
            sha,
            include_unknown,
            [(r.mode, r.value) for r in rules],
            sorted(existing),
            sorted(findings),
            duplicate.id if duplicate else None,
        ]
    )
    return {
        "format": fmt,
        "sha256": sha,
        "preview_token": token,
        "duplicate_run_id": duplicate.id if duplicate else None,
        "summary": summary,
        "items": rows,
    }, selected


def register_imports(app, sessions, project, root):
    lock = app.state.research_lock

    async def source(file):
        data = await file.read(MAX_SOURCE + 1)
        await file.close()
        try:
            fmt, rows, warnings = parse_source(data)
            return data, fmt, rows, warnings
        except Exception as exc:
            # Parser errors are user input failures, never an opaque 500 with partial objects.
            raise HTTPException(422, f"Cannot import export: {str(exc)[:300]}")

    @app.post("/projects/{pid}/tool-import/preview")
    async def preview(
        pid: str, file: UploadFile = File(), include_unknown: bool = Form(default=False)
    ):
        data, fmt, rows, warnings = await source(file)
        with sessions() as db:
            project(db, pid)
            result, _ = build_plan(
                db, pid, fmt, rows, hashlib.sha256(data).hexdigest(), include_unknown
            )
        return {**result, "warnings": warnings}

    @app.post("/projects/{pid}/tool-import/apply")
    async def apply(
        pid: str,
        file: UploadFile = File(),
        preview_token: str = Form(),
        include_unknown: bool = Form(default=False),
    ):
        data, fmt, rows, warnings = await source(file)
        sha = hashlib.sha256(data).hexdigest()
        filename, media_type = validate_file(
            data,
            file.filename or "export.txt",
            "application/xml" if fmt != "nuclei-jsonl" else "text/plain",
        )
        with lock, sessions() as db:
            project(db, pid)
            plan, selected = build_plan(db, pid, fmt, rows, sha, include_unknown)
            if plan["preview_token"] != preview_token:
                raise HTTPException(
                    409, "Preview is stale. Preview the file again before importing"
                )
            if plan["duplicate_run_id"]:
                return {
                    "duplicate": True,
                    "run_id": plan["duplicate_run_id"],
                    "summary": plan["summary"],
                }
            if rows and not selected:
                raise HTTPException(
                    422,
                    "No selected records. Configure scope or explicitly include unknown targets",
                )
            if db.query(ImportRun).filter_by(project_id=pid).count() >= 500:
                raise HTTPException(409, "Project import limit: 500 sources")
            attachments = list(db.query(Attachment).filter_by(project_id=pid))
            if (
                len(attachments) >= 500
                or sum(a.size for a in attachments) + len(data) > MAX_PROJECT_EVIDENCE
            ):
                raise HTTPException(409, "Project evidence limit: 500 files / 128 MiB")
            if (
                db.query(Node).filter_by(project_id=pid).count()
                + plan["summary"]["new_objects"]
                > 10000
            ):
                raise HTTPException(
                    409, "Project object limit: 10000; split this engagement"
                )
            old_count, old_size = (
                db.query(
                    func.count(Observation.id),
                    func.coalesce(func.sum(func.length(Observation.data)), 0),
                )
                .filter(Observation.project_id == pid)
                .one()
            )
            payload_size = sum(
                len(
                    json.dumps(
                        {
                            **r["data"],
                            **({"finding": r["finding"]} if r.get("finding") else {}),
                        }
                    ).encode()
                )
                for r in selected
            )
            if (
                old_count + len(selected) > 50000
                or old_size + payload_size > 24 * 1024 * 1024
            ):
                raise HTTPException(
                    409,
                    "Observation budget: 50000 records / 24 MiB metadata; split this engagement",
                )
            if (
                db.query(Knowledge).filter_by(project_id=pid).count()
                + plan["summary"]["new_findings"]
                > 5000
            ):
                raise HTTPException(409, "Knowledge archive budget: 5000 records")
            attachment = Attachment(
                id=uid(),
                project_id=pid,
                filename=filename,
                media_type=media_type,
                size=len(data),
                sha256=sha,
            )
            run = ImportRun(
                id=uid(),
                project_id=pid,
                format=fmt,
                sha256=sha,
                attachment_id=attachment.id,
                summary=json.dumps(
                    {
                        **plan["summary"],
                        "warnings": warnings,
                        "include_unknown": include_unknown,
                    }
                ),
            )
            path = root / "attachments" / attachment.id
            try:
                with path.open("xb") as output:
                    path.chmod(0o600)
                    output.write(data)
                db.add(attachment)
                db.flush()
                db.add(run)
                db.flush()
                upsert_objects(db, pid, selected, fmt, run.id)
                for row in selected:
                    key = finding_key(fmt, row)
                    fid = nid(pid, key) if key else None
                    if fid and db.get(Knowledge, fid) is None:
                        finding = row["finding"]
                        db.add(
                            Knowledge(
                                id=fid,
                                project_id=pid,
                                kind="finding",
                                title=(finding["name"].strip() or "Imported finding")[
                                    :160
                                ],
                                content=json.dumps(
                                    {
                                        "body": finding["body"],
                                        "severity": finding["severity"],
                                        "status": "open",
                                        "remediation": finding["remediation"],
                                        "node_ids": [nid(pid, row["key"])],
                                        "attachment_ids": [],
                                        "scan_ids": [],
                                        "steps": [],
                                    }
                                ),
                            )
                        )
                        db.flush()
                    payload = {
                        **row["data"],
                        **({"finding": row["finding"]} if key else {}),
                    }
                    db.add(
                        Observation(
                            project_id=pid,
                            run_id=run.id,
                            node_id=nid(pid, row["key"]),
                            finding_id=fid,
                            locator=row["locator"],
                            fingerprint=digest(payload),
                            data=json.dumps(payload),
                        )
                    )
                record(
                    db,
                    pid,
                    f"Imported {fmt}: {len(selected)} observations from {filename} (SHA-256 {sha[:12]})",
                )
                db.commit()
            except BaseException:
                path.unlink(missing_ok=True)
                raise
            return {"duplicate": False, "run_id": run.id, "summary": plan["summary"]}

    @app.get("/projects/{pid}/tool-imports")
    def runs(pid: str):
        with sessions() as db:
            project(db, pid)
            return [
                {
                    **serialize(r),
                    "summary": json.loads(r.summary),
                    "filename": db.get(Attachment, r.attachment_id).filename,
                }
                for r in db.query(ImportRun)
                .filter_by(project_id=pid)
                .order_by(ImportRun.created.desc(), ImportRun.id)
                .limit(500)
            ]

    @app.get("/projects/{pid}/observations")
    def observations(
        pid: str,
        node_id: str = "",
        finding_id: str = "",
        run_id: str = "",
        offset: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=100),
    ):
        with sessions() as db:
            project(db, pid)
            query = db.query(Observation).filter_by(project_id=pid)
            for field, value in [
                ("node_id", node_id),
                ("finding_id", finding_id),
                ("run_id", run_id),
            ]:
                if value:
                    query = query.filter(getattr(Observation, field) == value)
            return {
                "total": query.count(),
                "items": [
                    {
                        **serialize(o),
                        "data": json.loads(o.data),
                        "attachment_id": db.get(ImportRun, o.run_id).attachment_id,
                        "created": db.get(ImportRun, o.run_id).created,
                    }
                    for o in query.join(ImportRun, ImportRun.id == Observation.run_id)
                    .order_by(
                        ImportRun.created.desc(), Observation.locator, Observation.id
                    )
                    .offset(offset)
                    .limit(limit)
                ],
            }

    @app.get("/projects/{pid}/tool-imports/{rid}/compare/{previous}")
    def compare(pid: str, rid: str, previous: str):
        with sessions() as db:
            for value in (rid, previous):
                run = db.get(ImportRun, value)
                if run is None or run.project_id != pid:
                    raise HTTPException(404, "Import not found")
            if db.get(ImportRun, rid).format != db.get(ImportRun, previous).format:
                raise HTTPException(422, "Choose two imports of the same format")

            def snapshot(value):
                result = {}
                for o in db.query(Observation).filter_by(run_id=value):
                    result.setdefault(o.node_id, set()).add(o.fingerprint)
                return result

            current, old = snapshot(rid), snapshot(previous)
            result = {"added": [], "changed": [], "reobserved": [], "not_observed": []}
            for key in current.keys() | old.keys():
                state = (
                    "added"
                    if key not in old
                    else (
                        "not_observed"
                        if key not in current
                        else "reobserved" if current[key] == old[key] else "changed"
                    )
                )
                node = db.get(Node, key)
                result[state].append({"id": key, "label": node.label})
            return {
                **result,
                "warning": "Not observed means absent from this export only. Scope selection and export coverage may differ. No finding status is changed.",
            }

    @app.get("/projects/{pid}/web-findings")
    def linked_findings(pid: str, node_id: str):
        with sessions() as db:
            project(db, pid)
            return [
                serialize(k)
                for k in db.query(Knowledge).filter_by(project_id=pid, kind="finding")
                if node_id in json.loads(k.content).get("node_ids", [])
            ][:100]

    class ManualWeb(BaseModel):
        url: str = Field(min_length=1, max_length=4096)
        method: str = Field(default="GET", min_length=1, max_length=32)
        ip: str = Field(default="", max_length=100)
        application_only: bool = False

    @app.post("/projects/{pid}/web-objects", status_code=201)
    def manual_web(pid: str, body: ManualWeb):
        try:
            row = web_record(body.url, body.method, ip=body.ip)
        except (ValueError, UnicodeError) as exc:
            raise HTTPException(422, str(exc))
        if body.application_only:
            row["objects"].pop()
            row["key"] = row["objects"][-1]["key"]
        with lock, sessions() as db:
            project(db, pid)
            upsert_objects(db, pid, [row], "manual")
            record(db, pid, "Manual web object added (no request sent)")
            db.commit()
            return serialize(db.get(Node, nid(pid, row["key"])))
