"""Portable project archives. No archive entry is ever extracted by pathname."""

import base64
import hashlib
import json
import os
import re
import tempfile
import zipfile
from pathlib import Path
from typing import Literal
from fastapi import File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, SecretStr, ValidationError
from sqlalchemy import select, func, cast, LargeBinary, String, Text
from sqlalchemy.exc import IntegrityError
from starlette.background import BackgroundTask
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from .db import (
    Project,
    Node,
    Edge,
    Scan,
    Knowledge,
    Activity,
    Attachment,
    Credential,
    GraphView,
    ScopeRule,
    ImportRun,
    Observation,
    serialize,
    uid,
    now,
    record,
)
from .evidence import validate_file, MAX_ATTACHMENT
from .workspace import KnowledgeInput
from .vault import encrypt, decrypt, CredentialInput
from .downloads import export_file

MAX_ARCHIVE = 128 * 1024 * 1024
MAX_MANIFEST = 32 * 1024 * 1024
SAFE_ID = re.compile(r"[a-zA-Z0-9:._-]{1,300}\Z")


class ArchiveOptions(BaseModel):
    include_credentials: bool = False
    password: SecretStr | None = Field(default=None, min_length=12, max_length=1024)


class NodeRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(min_length=1, max_length=300)
    kind: Literal[
        "host", "service", "url", "custom", "domain", "application", "endpoint"
    ]
    label: str = Field(min_length=1, max_length=1000)
    attrs: dict = Field(default_factory=dict)
    x: float = Field(ge=-1000000, le=1000000, allow_inf_nan=False)
    y: float = Field(ge=-1000000, le=1000000, allow_inf_nan=False)


class ScanRecord(BaseModel):
    id: str = Field(min_length=1, max_length=300)
    target: str = Field(max_length=1000)
    tool: Literal["nmap", "whatweb", "httpx", "ffuf"] = "nmap"
    profile: str = Field(default="quick", max_length=300)
    options: dict = Field(default_factory=dict)
    status: Literal[
        "completed", "failed", "cancelled", "interrupted", "queued", "running"
    ]
    command: list[str] = Field(default_factory=list, max_length=100)
    queued_at: str = Field(default="", max_length=100)
    started: str = Field(max_length=100)
    ended: str | None = Field(default=None, max_length=100)
    exit_code: str | None = Field(default=None, max_length=50)
    output: str = Field(default="", max_length=65536)
    error: str = Field(default="", max_length=4000)


class KnowledgeRecord(KnowledgeInput):
    id: str = Field(min_length=1, max_length=300)
    created: str = Field(max_length=100)
    updated: str = Field(max_length=100)


class AttachmentRecord(BaseModel):
    id: str = Field(min_length=1, max_length=300)
    filename: str = Field(min_length=1, max_length=160)
    media_type: str = Field(max_length=100)
    size: int = Field(ge=1, le=MAX_ATTACHMENT)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    created: str = Field(max_length=100)


class EdgeRecord(BaseModel):
    id: str = Field(min_length=1, max_length=1000)
    source: str = Field(max_length=300)
    target: str = Field(max_length=300)
    kind: str = Field(min_length=1, max_length=80)
    evidence: str | None = Field(default=None, max_length=300)


class EventRecord(BaseModel):
    message: str = Field(max_length=4000)
    created: str = Field(max_length=100)


class ScopeRecord(BaseModel):
    id: str = Field(min_length=1, max_length=300)
    value: str = Field(min_length=1, max_length=1000)
    mode: Literal["include", "exclude"]


class ImportRecord(BaseModel):
    id: str = Field(min_length=1, max_length=300)
    format: Literal["burp-items", "burp-issues", "nmap-xml", "nuclei-jsonl"]
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    attachment_id: str = Field(min_length=1, max_length=300)
    created: str = Field(max_length=100)
    summary: str = Field(max_length=100000)


class ObservationRecord(BaseModel):
    id: str = Field(min_length=1, max_length=300)
    run_id: str = Field(max_length=300)
    node_id: str = Field(max_length=300)
    finding_id: str | None = Field(default=None, max_length=300)
    fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")
    locator: str = Field(max_length=1000)
    data: str = Field(max_length=1000000)


class Manifest(BaseModel):
    format: Literal["dragontrip-project"]
    version: Literal[1, 2, 3]
    project: dict
    nodes: list[NodeRecord] = Field(max_length=10000)
    edges: list[EdgeRecord] = Field(max_length=50000)
    scans: list[ScanRecord] = Field(max_length=5000)
    knowledge: list[KnowledgeRecord] = Field(max_length=5000)
    attachments: list[AttachmentRecord] = Field(max_length=500)
    events: list[EventRecord] = Field(max_length=10000)
    files: dict[str, dict] = Field(max_length=6000)
    scope_rules: list[ScopeRecord] = Field(default_factory=list, max_length=500)
    import_runs: list[ImportRecord] = Field(default_factory=list, max_length=500)
    observations: list[ObservationRecord] = Field(
        default_factory=list, max_length=50000
    )
    view: dict | None = None
    credentials_included: bool = False


def derive(password, salt):
    return Scrypt(salt=salt, length=32, n=32768, r=8, p=1).derive(password.encode())


def fail(message):
    raise HTTPException(422, message)


def register_archives(app, sessions, project, root):
    @app.post("/projects/{pid}/archive")
    def export(pid: str, body: ArchiveOptions):
        temporary = tempfile.NamedTemporaryFile(
            prefix="dragontrip-", suffix=".dtproj", delete=False
        )
        output = Path(temporary.name)
        temporary.close()
        try:
            with app.state.vault.lock, sessions() as db, zipfile.ZipFile(
                output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=3
            ) as archive:
                p = project(db, pid)
                # Refuse oversized snapshots in SQL before materializing histories/console tails.
                estimated = 0
                for model, maximum in [
                    (Node, 10000),
                    (Edge, 50000),
                    (Scan, 5000),
                    (Knowledge, 5000),
                    (Attachment, 500),
                    (Activity, 10000),
                    (ScopeRule, 500),
                    (ImportRun, 500),
                    (Observation, 50000),
                ]:
                    filters = model.project_id == pid
                    count = db.scalar(
                        select(func.count()).select_from(model).where(filters)
                    )
                    if count > maximum:
                        fail(
                            f"Project exceeds the archive limit for {model.__tablename__}: {maximum}"
                        )
                    columns = [
                        column
                        for column in model.__table__.columns
                        if isinstance(column.type, (String, Text))
                    ]
                    row_size = 512 + sum(
                        func.coalesce(func.length(cast(column, LargeBinary)), 0)
                        for column in columns
                    )
                    estimated += db.scalar(
                        select(func.coalesce(func.sum(row_size), 0))
                        .select_from(model)
                        .where(filters)
                    )
                if estimated > MAX_MANIFEST:
                    fail("Project metadata exceeds the 32 MiB portable archive budget")

                def rows(model):
                    return [
                        serialize(row)
                        for row in db.scalars(
                            select(model).where(model.project_id == pid)
                        )
                    ]

                scans = rows(Scan)
                if any(scan["status"] in {"queued", "running"} for scan in scans):
                    raise HTTPException(
                        409, "Wait for or cancel active project scans before exporting"
                    )
                manifest = {
                    "format": "dragontrip-project",
                    "version": 3,
                    "project": serialize(p),
                    "nodes": rows(Node),
                    "edges": rows(Edge),
                    "scans": scans,
                    "scope_rules": rows(ScopeRule),
                    "import_runs": rows(ImportRun),
                    "observations": rows(Observation),
                    "knowledge": rows(Knowledge),
                    "attachments": rows(Attachment),
                    "events": rows(Activity),
                    "files": {},
                    "credentials_included": body.include_credentials,
                }
                view = db.get(GraphView, pid)
                manifest["view"] = json.loads(view.value) if view else None
                total = 0

                def write(name, data):
                    nonlocal total
                    total += len(data)
                    if total > MAX_ARCHIVE:
                        fail("Project exceeds the 128 MiB portable archive limit")
                    archive.writestr(name, data)
                    manifest["files"][name] = {
                        "size": len(data),
                        "sha256": hashlib.sha256(data).hexdigest(),
                    }

                for scan in scans:
                    extension = "xml" if scan["tool"] == "nmap" else "json"
                    path = root / "artifacts" / (scan["id"] + "." + extension)
                    if scan["status"] == "completed" and path.is_file():
                        write("artifacts/" + path.name, path.read_bytes())
                for attachment in manifest["attachments"]:
                    path = root / "attachments" / attachment["id"]
                    if not path.is_file():
                        raise HTTPException(
                            409,
                            "An attachment is missing; restore or unlink/delete it before exporting",
                        )
                    data = path.read_bytes()
                    if hashlib.sha256(data).hexdigest() != attachment["sha256"]:
                        raise HTTPException(409, "Attachment integrity check failed")
                    write("attachments/" + attachment["id"], data)
                if body.include_credentials:
                    if body.password is None:
                        fail("Choose an archive password of at least 12 characters")
                    key = app.state.vault.require()
                    credentials = []
                    for row in db.scalars(
                        select(Credential).where(Credential.project_id == pid)
                    ):
                        try:
                            credentials.append(
                                decrypt(
                                    key, row.ciphertext, f"credential:{pid}:{row.id}"
                                )
                            )
                        except (ValueError, InvalidTag):
                            raise HTTPException(
                                409, "Credential integrity check failed"
                            )
                    salt = os.urandom(16)
                    encrypted = encrypt(
                        derive(body.password.get_secret_value(), salt),
                        credentials,
                        "dragontrip-project-archive-v1",
                    )
                    write(
                        "vault.json",
                        json.dumps(
                            {
                                "salt": base64.b64encode(salt).decode(),
                                "ciphertext": encrypted,
                            }
                        ).encode(),
                    )
                Manifest.model_validate(manifest)
                encoded = json.dumps(manifest, ensure_ascii=False).encode()
                if len(encoded) > MAX_MANIFEST or total + len(encoded) > MAX_ARCHIVE:
                    fail("Project metadata exceeds the portable archive limit")
                archive.writestr("manifest.json", encoded)
            return FileResponse(
                output,
                media_type="application/zip",
                filename=f"dragontrip-{pid}.dtproj",
                background=BackgroundTask(output.unlink, missing_ok=True),
            )
        except BaseException:
            output.unlink(missing_ok=True)
            raise

    @app.post("/projects/{pid}/export")
    def export_download(pid: str, body: ArchiveOptions):
        response = export(pid, body)
        try:
            return export_file(Path(response.path), f"dragontrip-{pid}.dtproj")
        finally:
            Path(response.path).unlink(missing_ok=True)

    @app.post("/imports", status_code=201)
    async def import_project(
        file: UploadFile = File(), password: SecretStr | None = Form(default=None)
    ):
        # UploadFile spools to disk; archive limits are checked before any data is imported.
        try:
            if file.size is not None and file.size > MAX_ARCHIVE:
                fail("Archive exceeds 128 MiB")
            with zipfile.ZipFile(file.file) as archive:
                infos = archive.infolist()
                if len(infos) > 6002 or len({entry.filename for entry in infos}) != len(
                    infos
                ):
                    fail("Archive has too many or duplicate entries")
                if sum(entry.file_size for entry in infos) > MAX_ARCHIVE:
                    fail("Expanded archive exceeds 128 MiB")
                for entry in infos:
                    if (
                        entry.flag_bits & 1
                        or entry.compress_type
                        not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}
                        or (entry.external_attr >> 16) & 0o170000 == 0o120000
                    ):
                        fail("Unsupported archive entry")
                    if not re.fullmatch(
                        r"manifest\.json|vault\.json|attachments/[a-zA-Z0-9:._-]{1,300}|artifacts/[a-zA-Z0-9:._-]{1,300}\.(xml|json)",
                        entry.filename,
                    ):
                        fail("Invalid archive path")
                if (
                    "manifest.json" not in archive.namelist()
                    or archive.getinfo("manifest.json").file_size > MAX_MANIFEST
                ):
                    fail("Missing or oversized project manifest")
                manifest = Manifest.model_validate_json(archive.read("manifest.json"))
                if set(archive.namelist()) != {"manifest.json", *manifest.files}:
                    fail("Archive contents do not match its manifest")
                for name, info in manifest.files.items():
                    data = archive.read(name)
                    if len(data) != info.get("size") or hashlib.sha256(
                        data
                    ).hexdigest() != info.get("sha256"):
                        fail("Archive file checksum mismatch")
                from .app import ProjectInput

                project_input = ProjectInput.model_validate(manifest.project)
                old_pid = str(manifest.project.get("id", ""))
                if not old_pid or not SAFE_ID.fullmatch(old_pid):
                    fail("Invalid source project identity")
                for collection in [
                    manifest.nodes,
                    manifest.scans,
                    manifest.knowledge,
                    manifest.attachments,
                    manifest.scope_rules,
                    manifest.import_runs,
                    manifest.observations,
                ]:
                    if len({item.id for item in collection}) != len(collection) or any(
                        not SAFE_ID.fullmatch(item.id) for item in collection
                    ):
                        fail("Duplicate or invalid record identities")
                if len({item.id for item in manifest.edges}) != len(
                    manifest.edges
                ) or any(
                    not re.fullmatch(r"[a-zA-Z0-9:._-]{1,1000}", item.id)
                    for item in manifest.edges
                ):
                    fail("Duplicate or invalid relationship identities")
                from .scope import canonical_rule

                for rule in manifest.scope_rules:
                    if canonical_rule(rule.value) != rule.value:
                        fail("Invalid scope rule")
                if manifest.version == 1 and (
                    manifest.scope_rules
                    or manifest.import_runs
                    or manifest.observations
                ):
                    fail("Research data requires archive version 2")
                if len({r.sha256 for r in manifest.import_runs}) != len(
                    manifest.import_runs
                ):
                    fail("Duplicate import sources")
                if manifest.version < 3 and any(
                    k.kind in {"checklist", "workflow", "workflow_run"}
                    for k in manifest.knowledge
                ):
                    fail("Methodologies and workflows require archive version 3")
                sid = {row.id: uid() for row in manifest.scans}
                rid = {row.id: uid() for row in manifest.import_runs}
                aid = {row.id: uid() for row in manifest.attachments}
                pid = uid()
                nid = {
                    row.id: (
                        pid + row.id[len(old_pid) :]
                        if row.id.startswith(old_pid + ":")
                        else uid()
                    )
                    for row in manifest.nodes
                }
                if len(set(nid.values())) != len(nid):
                    fail("Ambiguous object identities")
                kid = {
                    row.id: (
                        pid + row.id[len(old_pid) :]
                        if row.id.startswith(old_pid + ":")
                        else uid()
                    )
                    for row in manifest.knowledge
                }
                if any(r.attachment_id not in aid for r in manifest.import_runs) or any(
                    o.run_id not in rid
                    or o.node_id not in nid
                    or (o.finding_id and o.finding_id not in kid)
                    for o in manifest.observations
                ):
                    fail("Invalid import provenance references")
                if any(
                    edge.source not in nid
                    or edge.target not in nid
                    or (
                        edge.evidence
                        and edge.evidence not in sid
                        and edge.evidence not in rid
                    )
                    for edge in manifest.edges
                ):
                    fail("Relationship references are invalid")
                allowed_files = {
                    f"attachments/{row.id}" for row in manifest.attachments
                }
                allowed_files |= {
                    f"artifacts/{row.id}.{'xml' if row.tool == 'nmap' else 'json'}"
                    for row in manifest.scans
                    if row.status == "completed"
                }
                if manifest.credentials_included:
                    allowed_files.add("vault.json")
                if not set(manifest.files) <= allowed_files or any(
                    f"attachments/{row.id}" not in manifest.files
                    for row in manifest.attachments
                ):
                    fail("Unexpected or missing evidence files")
                credentials = []
                if manifest.credentials_included:
                    if (
                        not password
                        or len(password.get_secret_value()) < 12
                        or "vault.json" not in manifest.files
                    ):
                        fail("This archive requires its credential-encryption password")
                    try:
                        vault_data = json.loads(archive.read("vault.json"))
                        salt = base64.b64decode(vault_data["salt"], validate=True)
                        if len(salt) != 16:
                            fail("Invalid archive encryption metadata")
                        credentials = decrypt(
                            derive(password.get_secret_value(), salt),
                            vault_data["ciphertext"],
                            "dragontrip-project-archive-v1",
                        )
                        if not isinstance(credentials, list) or len(credentials) > 5000:
                            fail("Invalid credential collection")
                        credentials = [
                            CredentialInput.model_validate(value)
                            for value in credentials
                        ]
                    except (KeyError, ValueError, InvalidTag):
                        fail(
                            "Cannot decrypt archive credentials; check the archive password"
                        )
                from .product import ViewInput

                view = (
                    ViewInput.model_validate(manifest.view) if manifest.view else None
                )

                def remap(value):
                    if isinstance(value, list):
                        return [remap(v) for v in value]
                    if not isinstance(value, dict):
                        return value
                    result = {}
                    for key, entry in value.items():
                        mapping = (
                            sid
                            if key in {"scan_id", "scan_ids"}
                            else (
                                aid
                                if key in {"attachment_ids", "attachment_id"}
                                else (
                                    nid
                                    if key in {"node_id", "node_ids", "service_node"}
                                    else (
                                        rid
                                        if key == "run_id"
                                        else (
                                            kid
                                            if key in {"finding_id", "workflow_id"}
                                            else None
                                        )
                                    )
                                )
                            )
                        )
                        if mapping is not None and entry is not None:
                            if isinstance(entry, list):
                                result[key] = [
                                    mapping.setdefault(str(v), uid()) for v in entry
                                ]
                            else:
                                result[key] = mapping.setdefault(str(entry), uid())
                        else:
                            result[key] = remap(entry)
                    return result

                written = []
                with app.state.vault.lock, sessions() as db:
                    key = app.state.vault.require() if credentials else None
                    try:
                        p = Project(
                            id=pid,
                            name=(project_input.name + " (imported)")[:100],
                            description=project_input.description,
                        )
                        db.add(p)
                        db.flush()
                        for row in manifest.scans:
                            value = row.model_dump()
                            value.update(
                                id=sid[row.id],
                                project_id=pid,
                                command=json.dumps(row.command),
                                options=json.dumps(remap(row.options)),
                            )
                            if value["status"] in {"queued", "running"}:
                                value.update(
                                    status="interrupted",
                                    ended=now(),
                                    error="Imported active scan; not resumed",
                                )
                            db.add(Scan(**value))
                        db.flush()
                        for row in manifest.nodes:
                            db.add(
                                Node(
                                    id=nid[row.id],
                                    project_id=pid,
                                    kind=row.kind,
                                    label=row.label,
                                    x=row.x,
                                    y=row.y,
                                    attrs=json.dumps(
                                        {**remap(row.attrs), "imported": True}
                                    ),
                                )
                            )
                        db.flush()
                        for row in manifest.edges:
                            edge_id = (
                                pid + row.id[len(old_pid) :]
                                if row.id.startswith(old_pid + ":")
                                else (
                                    f"manual:{pid}:{nid[row.source]}:{nid[row.target]}"
                                    if not row.evidence
                                    else uid()
                                )
                            )
                            db.add(
                                Edge(
                                    id=edge_id,
                                    project_id=pid,
                                    source=nid[row.source],
                                    target=nid[row.target],
                                    kind=row.kind,
                                    evidence=sid.get(row.evidence)
                                    or rid.get(row.evidence),
                                )
                            )
                        for row in manifest.knowledge:
                            db.add(
                                Knowledge(
                                    id=kid[row.id],
                                    project_id=pid,
                                    kind=row.kind,
                                    title=row.title,
                                    content=json.dumps(
                                        remap(row.content.model_dump(mode="json"))
                                    ),
                                    created=row.created,
                                    updated=row.updated,
                                )
                            )
                        for row in manifest.attachments:
                            data = archive.read("attachments/" + row.id)
                            filename, media_type = validate_file(
                                data, row.filename, row.media_type
                            )
                            if (
                                len(data) != row.size
                                or hashlib.sha256(data).hexdigest() != row.sha256
                            ):
                                fail("Attachment metadata does not match its evidence")
                            db.add(
                                Attachment(
                                    id=aid[row.id],
                                    project_id=pid,
                                    filename=filename,
                                    media_type=media_type,
                                    size=row.size,
                                    sha256=row.sha256,
                                    created=row.created,
                                )
                            )
                        db.flush()
                        for row in manifest.scope_rules:
                            db.add(
                                ScopeRule(
                                    id=uid(),
                                    project_id=pid,
                                    value=row.value,
                                    mode=row.mode,
                                )
                            )
                        for row in manifest.import_runs:
                            source_attachment = next(
                                a
                                for a in manifest.attachments
                                if a.id == row.attachment_id
                            )
                            if source_attachment.sha256 != row.sha256:
                                fail("Import source hash mismatch")
                            json.loads(row.summary)
                            db.add(
                                ImportRun(
                                    id=rid[row.id],
                                    project_id=pid,
                                    format=row.format,
                                    sha256=row.sha256,
                                    attachment_id=aid[row.attachment_id],
                                    created=row.created,
                                    summary=row.summary,
                                )
                            )
                        db.flush()
                        for row in manifest.observations:
                            json.loads(row.data)
                            db.add(
                                Observation(
                                    id=uid(),
                                    project_id=pid,
                                    run_id=rid[row.run_id],
                                    node_id=nid[row.node_id],
                                    finding_id=kid.get(row.finding_id),
                                    fingerprint=row.fingerprint,
                                    locator=row.locator,
                                    data=row.data,
                                )
                            )
                        for row in manifest.events:
                            db.add(
                                Activity(
                                    project_id=pid,
                                    message=row.message,
                                    created=row.created,
                                )
                            )
                        if view:
                            db.add(
                                GraphView(project_id=pid, value=view.model_dump_json())
                            )
                        for row in credentials:
                            cid = uid()
                            value = row.model_dump(exclude={"secret"})
                            value = remap(value)
                            if row.secret is None:
                                fail("Archived credential is missing its secret")
                            value["secret"] = row.secret.get_secret_value()
                            db.add(
                                Credential(
                                    id=cid,
                                    project_id=pid,
                                    ciphertext=encrypt(
                                        key, value, f"credential:{pid}:{cid}"
                                    ),
                                )
                            )
                        for name in manifest.files:
                            if name == "vault.json":
                                continue
                            if name.startswith("attachments/"):
                                path = root / "attachments" / aid[name.split("/", 1)[1]]
                            else:
                                original, extension = name.split("/", 1)[1].rsplit(
                                    ".", 1
                                )
                                path = (
                                    root
                                    / "artifacts"
                                    / (sid[original] + "." + extension)
                                )
                            with path.open("xb") as destination:
                                path.chmod(0o600)
                                written.append(path)
                                destination.write(archive.read(name))
                        record(
                            db,
                            pid,
                            "Project imported from a verified portable archive; no tasks resumed",
                        )
                        db.commit()
                        return serialize(p)
                    except BaseException:
                        db.rollback()
                        for path in written:
                            path.unlink(missing_ok=True)
                        raise
        except (
            zipfile.BadZipFile,
            KeyError,
            ValueError,
            ValidationError,
            RecursionError,
            RuntimeError,
            IntegrityError,
        ):
            fail("Invalid or unsupported project archive")
        finally:
            await file.close()
