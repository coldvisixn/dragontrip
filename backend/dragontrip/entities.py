"""Shared graph identity/upsert for offline imports, manual web objects and recon."""

import json
from .db import Node, Edge
from .graph import Placement
from .import_formats import digest


def nid(pid, key):
    return pid + ":" + key


def upsert_objects(db, pid, rows, source, run_id=None):
    placement = Placement(db, pid)
    for row in rows:
        for obj in row["objects"]:
            identifier = nid(pid, obj["key"])
            node = db.get(Node, identifier)
            if node is None:
                node = Node(
                    id=identifier,
                    project_id=pid,
                    kind=obj["kind"],
                    label=obj["label"][:1000],
                    attrs="{}",
                    **placement.reserve(
                        120 if obj["kind"] in {"host", "domain"} else 500, 180
                    ),
                )
                db.add(node)
            previous = json.loads(node.attrs or "{}")
            # Manual annotations and old scan evidence are never replaced by import metadata.
            parameters = set(previous.get("parameters", [])) | set(
                obj["attrs"].get("parameters", [])
            )
            node.attrs = json.dumps(
                {
                    **previous,
                    **obj["attrs"],
                    "source": previous.get("source", source),
                    **({"parameters": sorted(parameters)} if parameters else {}),
                    **({"run_id": run_id} if run_id else {}),
                }
            )
            db.flush()
            if obj.get("parent"):
                source_id = nid(pid, obj["parent"])
                # Key includes both ends so a later exported IP does not overwrite a previous association.
                eid = (
                    pid
                    + ":relation:"
                    + digest(
                        [source_id[len(pid) :], identifier[len(pid) :], obj["relation"]]
                    )[:32]
                )
                if db.get(Edge, eid) is None:
                    db.add(
                        Edge(
                            id=eid,
                            project_id=pid,
                            source=source_id,
                            target=identifier,
                            kind=obj["relation"],
                            evidence=run_id,
                        )
                    )
        db.flush()
