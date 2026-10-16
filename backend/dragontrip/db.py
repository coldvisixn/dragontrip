import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import (
    create_engine,
    event,
    Column,
    String,
    Text,
    Float,
    Integer,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()


def uid():
    return str(uuid.uuid4())


def now():
    return datetime.now(timezone.utc).isoformat()


class Project(Base):
    __tablename__ = "projects"
    id = Column(String, primary_key=True, default=uid)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    created = Column(String, default=now)
    updated = Column(String, default=now)


class Node(Base):
    __tablename__ = "nodes"
    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)
    label = Column(String, nullable=False)
    attrs = Column(Text, default="{}")
    x = Column(Float, default=0)
    y = Column(Float, default=0)


class Edge(Base):
    __tablename__ = "edges"
    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    source = Column(String, ForeignKey("nodes.id"), nullable=False)
    target = Column(String, ForeignKey("nodes.id"), nullable=False)
    kind = Column(String, default="CUSTOM_RELATION")
    evidence = Column(String, nullable=True)


class Scan(Base):
    __tablename__ = "scans"
    id = Column(String, primary_key=True, default=uid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    target = Column(String, nullable=False)
    tool = Column(Text, nullable=False, default="nmap")
    profile = Column(Text, nullable=False, default="quick")
    options = Column(Text, nullable=False, default="{}")
    status = Column(String, default="queued")
    command = Column(Text, default="[]")
    queued_at = Column(String, nullable=False, default=now)
    started = Column(String, default=now)
    ended = Column(String, nullable=True)
    exit_code = Column(String, nullable=True)
    output = Column(Text, default="")
    error = Column(Text, default="")


class Configuration(Base):
    __tablename__ = "configuration"
    id = Column(String, primary_key=True)
    value = Column(Text, nullable=False)


class Activity(Base):
    __tablename__ = "activity"
    id = Column(String, primary_key=True, default=uid)
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    message = Column(String)
    created = Column(String, default=now)


class Knowledge(Base):
    __tablename__ = "knowledge"
    id = Column(String, primary_key=True, default=uid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False, default="{}")
    created = Column(String, default=now)
    updated = Column(String, default=now)


class Credential(Base):
    __tablename__ = "credentials"
    id = Column(String, primary_key=True, default=uid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    ciphertext = Column(Text, nullable=False)


class Attachment(Base):
    __tablename__ = "attachments"
    id = Column(String, primary_key=True, default=uid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    media_type = Column(String, nullable=False)
    size = Column(Integer, nullable=False)
    sha256 = Column(String, nullable=False)
    created = Column(String, default=now)


class GraphView(Base):
    __tablename__ = "graph_views"
    project_id = Column(String, ForeignKey("projects.id"), primary_key=True)
    value = Column(Text, nullable=False)


def record(db, project_id, message):
    db.add(Activity(project_id=project_id, message=message))
    project = db.get(Project, project_id)
    if project:
        project.updated = now()


def serialize(obj, exclude=()):
    result = {
        c.name: getattr(obj, c.name)
        for c in obj.__table__.columns
        if c.name not in exclude
    }
    if isinstance(obj, Node):
        result["attrs"] = json.loads(result["attrs"])
    if isinstance(obj, Knowledge):
        result["content"] = json.loads(result["content"])
    if isinstance(obj, Scan):
        result["command"] = json.loads(result["command"])
        result["options"] = json.loads(result["options"])
    return result


def database(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    engine = create_engine(
        f"sqlite:///{path}", connect_args={"check_same_thread": False}
    )

    @event.listens_for(engine, "connect")
    def configure(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA busy_timeout=5000")

    return engine, sessionmaker(engine, expire_on_commit=False)


def data_dir():
    return (
        Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share"))
        / "dragontrip"
    )


class ScopeRule(Base):
    __tablename__ = "scope_rules"
    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    value = Column(String, nullable=False)
    mode = Column(String, nullable=False)


class ImportRun(Base):
    __tablename__ = "import_runs"
    __table_args__ = (
        UniqueConstraint("project_id", "sha256", name="uq_import_source"),
    )
    id = Column(String, primary_key=True, default=uid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    format = Column(String, nullable=False)
    sha256 = Column(String, nullable=False)
    attachment_id = Column(String, ForeignKey("attachments.id"), nullable=False)
    created = Column(String, default=now)
    summary = Column(Text, nullable=False, default="{}")


class Observation(Base):
    __tablename__ = "observations"
    id = Column(String, primary_key=True, default=uid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    run_id = Column(String, ForeignKey("import_runs.id"), nullable=False, index=True)
    node_id = Column(String, ForeignKey("nodes.id"), nullable=False, index=True)
    finding_id = Column(String, ForeignKey("knowledge.id"), nullable=True)
    fingerprint = Column(String, nullable=False)
    locator = Column(String, nullable=False)
    data = Column(Text, nullable=False)
