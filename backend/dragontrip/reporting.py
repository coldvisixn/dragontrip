"""Project progress and explicit, credential-free investigation reports."""

import json
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, func, cast, LargeBinary
from sqlalchemy.orm import defer

from .db import Node, Scan, Knowledge, Attachment, now
from .downloads import export_file


class ReportOptions(BaseModel):
    title: str = Field(default="Investigation report", min_length=1, max_length=160)
    summary: str = Field(default="", max_length=12000)
    finding_status: Literal["all", "active", "confirmed"] = "active"
    minimum_severity: Literal["info", "low", "medium", "high", "critical"] = "info"
    include_notes: bool = False
    include_paths: bool = True
    include_tasks: bool = True
    include_inventory: bool = True
    include_scans: bool = True

    @field_validator("title")
    @classmethod
    def not_blank(cls, value):
        if not value.strip():
            raise ValueError("Report title cannot be blank")
        return value.strip()


SEVERITIES = ["info", "low", "medium", "high", "critical"]


def text(value):
    # Escape metadata so labels cannot inject table rows/headings into the report.
    return (
        str(value)
        .replace("\n", " ")
        .replace("\r", " ")
        .replace("\\", "\\\\")
        .replace("|", "\\|")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("`", "\\`")
        .replace("[", "\\[")
        .replace("]", "\\]")
        .replace("*", "\\*")
        .replace("#", "\\#")
    )


def register_reporting(app, sessions, project):
    @app.get("/projects/{pid}/overview")
    def overview(pid: str):
        with sessions() as db:
            project(db, pid)

            def counts(model, column):
                return dict(
                    db.execute(
                        select(column, func.count())
                        .where(model.project_id == pid)
                        .group_by(column)
                    ).all()
                )

            statuses = func.json_extract(Knowledge.content, "$.status")
            task_counts = dict(
                db.execute(
                    select(statuses, func.count())
                    .where(Knowledge.project_id == pid, Knowledge.kind == "task")
                    .group_by(statuses)
                ).all()
            )
            today = datetime.now(timezone.utc).date().isoformat()
            due = func.json_extract(Knowledge.content, "$.due_date")
            overdue = db.scalar(
                select(func.count())
                .select_from(Knowledge)
                .where(
                    Knowledge.project_id == pid,
                    Knowledge.kind == "task",
                    statuses.notin_(["done", "cancelled"]),
                    due < today,
                )
            )
            severity = func.json_extract(Knowledge.content, "$.severity")
            risks = dict(
                db.execute(
                    select(severity, func.count())
                    .where(
                        Knowledge.project_id == pid,
                        Knowledge.kind == "finding",
                        statuses.notin_(["resolved", "dismissed"]),
                    )
                    .group_by(severity)
                ).all()
            )
            return {
                "objects": counts(Node, Node.kind),
                "scans": counts(Scan, Scan.status),
                "records": counts(Knowledge, Knowledge.kind),
                "tasks": task_counts,
                "overdue": overdue,
                "active_risks": risks,
                "attachments": db.scalar(
                    select(func.count())
                    .select_from(Attachment)
                    .where(Attachment.project_id == pid)
                ),
                "as_of": now(),
                "due_date_timezone": "UTC",
            }

    def render(pid, options):
        with sessions() as db:
            p = project(db, pid)

            def rows(model):
                count = db.scalar(
                    select(func.count())
                    .select_from(model)
                    .where(model.project_id == pid)
                )
                if count > 10000:
                    raise HTTPException(
                        413, "Report supports up to 10,000 records per section"
                    )
                query = select(model).where(model.project_id == pid).order_by(model.id)
                if model is Scan:
                    query = query.options(
                        defer(Scan.output), defer(Scan.command), defer(Scan.options)
                    )
                elif model is Node:
                    query = query.options(defer(Node.attrs))
                elif model is Knowledge:
                    size = db.scalar(
                        select(
                            func.coalesce(
                                func.sum(
                                    func.length(cast(Knowledge.content, LargeBinary))
                                ),
                                0,
                            )
                        ).where(Knowledge.project_id == pid)
                    )
                    if size > 8 * 1024 * 1024:
                        raise HTTPException(
                            413, "Report knowledge content exceeds 8 MiB"
                        )
                return list(db.scalars(query))

            nodes = rows(Node)
            scans = rows(Scan) if options.include_scans else []
            knowledge = [(r, json.loads(r.content)) for r in rows(Knowledge)]
            labels = {node.id: node.label for node in nodes}
            attachments = {r.id: r for r in rows(Attachment)}
            findings = [
                (r, c)
                for r, c in knowledge
                if r.kind == "finding"
                and SEVERITIES.index(c.get("severity", "info"))
                >= SEVERITIES.index(options.minimum_severity)
                and (
                    options.finding_status == "all"
                    or (
                        c.get("status") == "confirmed"
                        if options.finding_status == "confirmed"
                        else c.get("status") not in {"resolved", "dismissed"}
                    )
                )
            ]
            findings.sort(
                key=lambda item: (
                    -SEVERITIES.index(item[1].get("severity", "info")),
                    item[0].title.casefold(),
                    item[0].id,
                )
            )
            lines = [
                f"# {text(options.title)}",
                "",
                f"Project: **{text(p.name)}**",
                "",
                f"Generated: {now()}",
                "",
                p.description or "",
                "",
                "## Executive summary",
                "",
                options.summary or "No executive summary supplied.",
                "",
                "## Findings summary",
                "",
                f"{len(findings)} findings selected. Status filter: {options.finding_status}; minimum severity: {options.minimum_severity}.",
                "",
            ]
            totals = Counter(c.get("severity", "info") for _, c in findings)
            lines += ["| Severity | Count |", "| --- | ---: |"] + [
                f"| {v} | {totals[v]} |" for v in reversed(SEVERITIES)
            ]
            lines += ["", "## Findings", ""]

            def links(content):
                result = []
                if content.get("node_ids"):
                    result += [
                        "Affected objects: "
                        + ", ".join(
                            text(labels.get(n, "Deleted object (" + n + ")"))
                            for n in content["node_ids"]
                        ),
                        "",
                    ]
                for aid in content.get("attachment_ids", []):
                    a = attachments.get(aid)
                    result += [
                        (
                            f"Evidence: {text(a.filename)} · SHA-256 `{a.sha256}`"
                            if a
                            else "Evidence: deleted attachment"
                        ),
                        "",
                    ]
                if content.get("scan_ids"):
                    result += [
                        "Source scan IDs: "
                        + ", ".join(text(s) for s in content["scan_ids"]),
                        "",
                    ]
                return result

            for row, c in findings:
                lines += [
                    f"### {text(row.title)}",
                    "",
                    f"Severity: **{c.get('severity', 'info')}** · Status: {text(c.get('status', 'draft'))}",
                    "",
                    c.get("body", "") or "No description.",
                    "",
                    "#### Remediation",
                    "",
                    c.get("remediation", "") or "Not specified.",
                    "",
                ] + links(c)
            if not findings:
                lines += ["No findings match these report filters.", ""]
            for kind, enabled, heading in [
                ("note", options.include_notes, "Notes"),
                ("path", options.include_paths, "Investigation paths"),
                ("task", options.include_tasks, "Work plan"),
            ]:
                if not enabled:
                    continue
                lines += ["## " + heading, ""]
                for row, c in knowledge:
                    if row.kind != kind:
                        continue
                    lines += [
                        "### " + text(row.title),
                        "",
                        "Status: " + text(c.get("status", "draft")),
                        "",
                    ]
                    if kind == "task":
                        lines += [
                            f"Priority: {text(c.get('priority', 'medium'))} · Owner: {text(c.get('assignee') or 'Unassigned')} · Due: {text(c.get('due_date') or 'No date')}",
                            "",
                        ]
                    lines += [c.get("body", ""), ""] + links(c)
                    for i, step in enumerate(c.get("steps", []), 1):
                        lines += [
                            f"{i}. [{text(step['status'])}] {text(labels.get(step['node_id'], 'Deleted object'))}: {text(step['action'])}"
                        ]
                    lines += [""]
            if options.include_inventory:
                lines += (
                    ["## Object inventory", "", "| Type | Object |", "| --- | --- |"]
                    + [f"| {text(n.kind)} | {text(n.label)} |" for n in nodes]
                    + [""]
                )
            if options.include_scans:
                lines += (
                    [
                        "## Scan history",
                        "",
                        "| Tool | Target | Status | Started |",
                        "| --- | --- | --- | --- |",
                    ]
                    + [
                        f"| {text(s.tool)} | {text(s.target)} | {text(s.status)} | {text(s.started)} |"
                        for s in scans
                    ]
                    + [""]
                )
            return {"markdown": "\n".join(lines), "finding_count": len(findings)}

    @app.post("/projects/{pid}/report/preview")
    def preview(pid: str, options: ReportOptions):
        return render(pid, options)

    @app.post("/projects/{pid}/report/export")
    def export(pid: str, options: ReportOptions):
        report = render(pid, options)
        with tempfile.TemporaryDirectory(prefix="dragontrip-report-") as directory:
            source = Path(directory) / "report.md"
            source.write_text(report["markdown"], encoding="utf-8")
            return export_file(source, f"dragontrip-report-{pid}.md")
