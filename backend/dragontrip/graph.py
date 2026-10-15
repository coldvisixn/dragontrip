import json
from .db import Node, Edge, record


def ingest(db, scan, hosts):
    """Stable entity IDs preserve coordinates and custom objects across scans."""
    for old in db.query(Node).filter_by(project_id=scan.project_id, kind="service"):
        previous = json.loads(old.attrs)
        if previous.get("host") == scan.target:
            previous["state"] = "not observed in latest scan"
            old.attrs = json.dumps(previous)
    for host in hosts:
        hid = f"{scan.project_id}:host:{host['ip']}"
        node = db.get(Node, hid)
        attrs = {k: v for k, v in host.items() if k != "services"}
        attrs.update(scan_id=scan.id, source="nmap", observed_at=scan.started)
        if node is None:
            node = Node(id=hid, project_id=scan.project_id, kind="host",
                        label=host["ip"], x=120, y=180)
            db.add(node)
        node.attrs = json.dumps(attrs)
        db.flush()
        for i, service in enumerate(host["services"]):
            sid = f"{hid}:{service['protocol']}:{service['port']}"
            item = db.get(Node, sid)
            if item is None:
                item = Node(id=sid, project_id=scan.project_id, kind="service",
                            label=f"{service['port']}/{service['protocol']} · {service['name']}",
                            x=490 + (i // 6) * 280, y=40 + (i % 6) * 125)
                db.add(item)
            item.label = f"{service['port']}/{service['protocol']} · {service['name']}"
            item.attrs = json.dumps({**service, "scan_id": scan.id, "source": "nmap", "host": host["ip"], "observed_at": scan.started})
            db.flush()
            eid = f"{sid}:exposes"
            edge = db.get(Edge, eid)
            if edge is None:
                db.add(Edge(id=eid, project_id=scan.project_id, source=hid,
                            target=sid, kind="EXPOSES", evidence=scan.id))
            else:
                edge.evidence = scan.id
    record(db, scan.project_id, f"Nmap results saved for {scan.target}")
