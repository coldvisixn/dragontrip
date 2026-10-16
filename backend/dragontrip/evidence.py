"""Bounded, project-scoped evidence. Originals are retained with SHA-256 digests."""

import hashlib
import io
import re
from pathlib import Path
from urllib.parse import quote
from fastapi import HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from .db import Attachment, Knowledge, record, serialize, uid
from .downloads import export_file

MAX_ATTACHMENT = 10 * 1024 * 1024
MAX_PROJECT_EVIDENCE = 128 * 1024 * 1024
TEXT_TYPES = {"text/plain", "application/json", "application/xml", "text/xml"}
IMAGE_TYPES = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}


def validate_file(data, filename, media_type):
    filename = Path(filename.replace("\\", "/")).name
    filename = re.sub(r"[\x00-\x1f\x7f]", "", filename).strip()[:160]
    if not filename or not data or len(data) > MAX_ATTACHMENT:
        raise HTTPException(
            422, "Evidence must have a filename and contain 1 byte–10 MiB"
        )
    if media_type.startswith("image/"):
        try:
            with Image.open(io.BytesIO(data)) as image:
                actual = IMAGE_TYPES.get(image.format)
                if not actual or image.width * image.height > 25000000:
                    raise ValueError("Unsupported or oversized image")
                image.verify()
            media_type = actual
        except (
            ValueError,
            OSError,
            UnidentifiedImageError,
            Image.DecompressionBombError,
        ):
            raise HTTPException(
                422, "Use a valid PNG, JPEG or WebP image up to 25 megapixels"
            )
    elif media_type == "application/pdf":
        if not data.startswith(b"%PDF-"):
            raise HTTPException(422, "Invalid PDF document")
    elif media_type in TEXT_TYPES:
        try:
            data.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(422, "Text evidence must be UTF-8")
    else:
        raise HTTPException(
            422, "Supported evidence: PNG, JPEG, WebP, PDF, UTF-8 text, JSON and XML"
        )
    return filename, media_type


def register_evidence(app, sessions, project, root):
    directory = root / "attachments"
    directory.mkdir(mode=0o700, exist_ok=True)
    # Failed pre-commit uploads cannot leave permanent orphaned evidence.
    with sessions() as db:
        known = set(db.scalars(select(Attachment.id)))
        for path in directory.iterdir():
            if path.is_file() and path.name not in known:
                path.unlink()

    def attachment(db, pid, aid):
        row = db.get(Attachment, aid)
        if row is None or row.project_id != pid:
            raise HTTPException(404, "Attachment not found")
        return row

    @app.get("/projects/{pid}/attachments")
    def attachments(pid: str):
        with sessions() as db:
            project(db, pid)
            return [
                serialize(row)
                for row in db.scalars(
                    select(Attachment)
                    .where(Attachment.project_id == pid)
                    .order_by(Attachment.created.desc())
                )
            ]

    @app.post("/projects/{pid}/attachments", status_code=201)
    async def upload(pid: str, file: UploadFile = File()):
        data = await file.read(MAX_ATTACHMENT + 1)
        await file.close()
        filename, media_type = validate_file(
            data, file.filename or "", file.content_type or "application/octet-stream"
        )
        with sessions() as db:
            project(db, pid)
            rows = list(
                db.scalars(select(Attachment).where(Attachment.project_id == pid))
            )
            if (
                len(rows) >= 500
                or sum(row.size for row in rows) + len(data) > MAX_PROJECT_EVIDENCE
            ):
                raise HTTPException(409, "Project evidence limit: 500 files / 128 MiB")
            row = Attachment(
                id=uid(),
                project_id=pid,
                filename=filename,
                media_type=media_type,
                size=len(data),
                sha256=hashlib.sha256(data).hexdigest(),
            )
            path = directory / row.id
            try:
                with path.open("xb") as destination:
                    path.chmod(0o600)
                    destination.write(data)
                db.add(row)
                record(db, pid, "Evidence attachment added")
                db.commit()
            except BaseException:
                path.unlink(missing_ok=True)
                raise
            return serialize(row)

    @app.get("/projects/{pid}/attachments/{aid}/content")
    def download(pid: str, aid: str):
        with sessions() as db:
            row = attachment(db, pid, aid)
            path = directory / row.id
            if not path.is_file():
                raise HTTPException(404, "Evidence file is missing")
            if (
                path.stat().st_size != row.size
                or hashlib.sha256(path.read_bytes()).hexdigest() != row.sha256
            ):
                raise HTTPException(409, "Evidence integrity check failed")
            return FileResponse(
                path,
                media_type=row.media_type,
                headers={
                    "Content-Disposition": "attachment; filename*=UTF-8''"
                    + quote(row.filename),
                    "Content-Security-Policy": "default-src 'none'; sandbox",
                },
            )

    @app.delete("/projects/{pid}/attachments/{aid}")
    def delete(pid: str, aid: str):
        with sessions() as db:
            row = attachment(db, pid, aid)
            import json

            for entry in db.scalars(
                select(Knowledge).where(Knowledge.project_id == pid)
            ):
                if aid in json.loads(entry.content).get("attachment_ids", []):
                    raise HTTPException(
                        409,
                        "Unlink this file from knowledge records before deleting it",
                    )
            from .db import ImportRun

            if db.query(ImportRun).filter_by(attachment_id=aid).first():
                raise HTTPException(409, "This source is retained by import history")
            db.delete(row)
            record(db, pid, "Evidence attachment deleted")
            db.commit()
            (directory / aid).unlink(missing_ok=True)
            return {"deleted": True}

    @app.post("/projects/{pid}/attachments/{aid}/export")
    def export(pid: str, aid: str):
        with sessions() as db:
            row = attachment(db, pid, aid)
            path = directory / row.id
            if (
                not path.is_file()
                or hashlib.sha256(path.read_bytes()).hexdigest() != row.sha256
            ):
                raise HTTPException(409, "Evidence integrity check failed")
            return export_file(path, row.filename)
