"""Recoverable, project-scoped editor drafts. Kept out of reports and archives."""

import json
import re
import threading

from fastapi import HTTPException
from pydantic import BaseModel, Field

from .db import Configuration, Knowledge


class DraftInput(BaseModel):
    revision: str = Field(pattern=r"^\d{13}-[a-f0-9]{32}$")
    value: dict | None


def register_drafts(app, sessions, project):
    lock = threading.RLock()

    def identifier(db, pid, key):
        project(db, pid)
        if key != "report":
            match = re.fullmatch(r"(note|finding|path):(new|[a-f0-9-]{36})", key)
            if not match:
                raise HTTPException(422, "Invalid draft key")
            if match[2] != "new":
                row = db.get(Knowledge, match[2])
                if row is None or row.project_id != pid or row.kind != match[1]:
                    raise HTTPException(404, "Draft record not found")
        return f"draft:{pid}:{key}"

    @app.get("/projects/{pid}/drafts/{key}")
    def read(pid: str, key: str):
        with sessions() as db:
            row = db.get(Configuration, identifier(db, pid, key))
            return json.loads(row.value) if row else {"value": None, "revision": ""}

    @app.put("/projects/{pid}/drafts/{key}")
    def write(pid: str, key: str, body: DraftInput):
        payload = body.model_dump_json()
        if len(payload.encode()) > 256 * 1024:
            raise HTTPException(413, "Draft exceeds 256 KiB")
        with lock, sessions() as db:
            rid = identifier(db, pid, key)
            row = db.get(Configuration, rid)
            if row:
                previous = json.loads(row.value)
                if previous["revision"] > body.revision:
                    raise HTTPException(
                        409, "A newer draft exists. Reopen the editor to recover it."
                    )
                if (
                    previous["revision"] == body.revision
                    and previous != body.model_dump()
                ):
                    raise HTTPException(409, "Draft revision already used")
                row.value = payload
            else:
                db.add(Configuration(id=rid, value=payload))
            # A null value is a tombstone: delayed autosaves cannot resurrect a cleared draft.
            db.commit()
            return body.model_dump()
