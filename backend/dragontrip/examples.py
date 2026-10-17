"""Explicit, isolated fictional walkthrough. Never starts a tool or adds live scope."""

import json

from .db import Project, Node, Edge, Knowledge, record, serialize, uid


def register_examples(app, sessions):
    @app.post("/examples", status_code=201)
    def example():
        with sessions() as db:
            project = Project(
                name="[DEMO] Dragontrip walkthrough",
                description="Fictional demonstration project. No scans have run and no vulnerability is verified. All example targets are reserved documentation addresses.",
            )
            db.add(project)
            db.flush()
            host_id, service_id = (
                f"{project.id}:example-host",
                f"{project.id}:example-service",
            )
            db.add_all(
                [
                    Node(
                        id=host_id,
                        project_id=project.id,
                        kind="host",
                        label="192.0.2.10",
                        x=160,
                        y=200,
                        attrs=json.dumps(
                            {
                                "source": "example",
                                "address": "192.0.2.10",
                                "state": "fictional",
                            }
                        ),
                    ),
                    Node(
                        id=service_id,
                        project_id=project.id,
                        kind="service",
                        label="443/tcp · example HTTPS",
                        x=540,
                        y=200,
                        attrs=json.dumps(
                            {
                                "source": "example",
                                "port": 443,
                                "protocol": "tcp",
                                "product": "Fictional HTTPS server",
                                "state": "fictional",
                            }
                        ),
                    ),
                ]
            )
            db.flush()
            db.add(
                Edge(
                    id=uid(),
                    project_id=project.id,
                    source=host_id,
                    target=service_id,
                    kind="HOST_HAS_SERVICE",
                )
            )
            shared = {
                "node_ids": [service_id],
                "scan_ids": [],
                "attachment_ids": [],
                "steps": [],
                "severity": "info",
                "remediation": "",
            }
            for kind, title, content in [
                (
                    "note",
                    "[DEMO] Start here",
                    {
                        "status": "draft",
                        "body": "This is fictional data, not a scan result.\n\nOpen the linked service, create a finding, attach your own evidence, then build a report. Real projects start empty.",
                    },
                ),
                (
                    "finding",
                    "[DEMO] Review service access",
                    {
                        "status": "draft",
                        "body": "Example only: no vulnerability has been verified.\n\nDocument the expected access rules, reproduce the observed behavior and attach evidence before confirming a real finding.",
                    },
                ),
                (
                    "task",
                    "[DEMO] Verify expected access",
                    {
                        "status": "todo",
                        "priority": "medium",
                        "body": "Example follow-up task. Confirm scope and authorization before testing a real target.",
                    },
                ),
            ]:
                db.add(
                    Knowledge(
                        project_id=project.id,
                        kind=kind,
                        title=title,
                        content=json.dumps({**shared, **content}),
                    )
                )
            record(
                db, project.id, "Fictional demo created explicitly; no scans launched"
            )
            db.commit()
            return serialize(project)
