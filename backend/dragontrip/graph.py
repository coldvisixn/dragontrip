import json
from .db import Node, Edge, record


def ingest(db, scan, hosts):
    """Stable entity IDs preserve coordinates and custom objects across scans."""
    scanned = next(
        (host.get("scanned_ports") for host in hosts if host.get("scanned_ports")), ""
    )
    ranges = [
        tuple(int(v) for v in part.split("-")) for part in scanned.split(",") if part
    ]

    def included(port):
        return not ranges or any(values[0] <= port <= values[-1] for values in ranges)

    for old in db.query(Node).filter_by(project_id=scan.project_id, kind="service"):
        previous = json.loads(old.attrs)
        if (
            previous.get("host") == scan.target
            and previous.get("protocol") == "tcp"
            and included(int(previous.get("port", 0)))
        ):
            previous["state"] = "not observed in latest scan"
            old.attrs = json.dumps(previous)
    for host in hosts:
        hid = f"{scan.project_id}:host:{host['ip']}"
        node = db.get(Node, hid)
        attrs = {k: v for k, v in host.items() if k != "services"}
        attrs.update(scan_id=scan.id, source="nmap", observed_at=scan.started)
        if node is None:
            node = Node(
                id=hid,
                project_id=scan.project_id,
                kind="host",
                label=host["ip"],
                x=120,
                y=180,
            )
            db.add(node)
        node.attrs = json.dumps(attrs)
        db.flush()
        for i, service in enumerate(host["services"]):
            sid = f"{hid}:{service['protocol']}:{service['port']}"
            item = db.get(Node, sid)
            if item is None:
                item = Node(
                    id=sid,
                    project_id=scan.project_id,
                    kind="service",
                    label=f"{service['port']}/{service['protocol']} · {service['name']}",
                    x=490 + (i // 6) * 280,
                    y=40 + (i % 6) * 125,
                )
                db.add(item)
            item.label = f"{service['port']}/{service['protocol']} · {service['name']}"
            item.attrs = json.dumps(
                {
                    **service,
                    "scan_id": scan.id,
                    "source": "nmap",
                    "host": host["ip"],
                    "observed_at": scan.started,
                }
            )
            db.flush()
            eid = f"{sid}:exposes"
            edge = db.get(Edge, eid)
            if edge is None:
                db.add(
                    Edge(
                        id=eid,
                        project_id=scan.project_id,
                        source=hid,
                        target=sid,
                        kind="EXPOSES",
                        evidence=scan.id,
                    )
                )
            else:
                edge.evidence = scan.id
    record(db, scan.project_id, f"Nmap results saved for {scan.target}")


def ingest_web(db, scan, results):
    from urllib.parse import urlsplit
    from hashlib import sha256

    if not results:
        record(db, scan.project_id, f"{scan.tool}: no HTTP responses observed")
        return
    origin = urlsplit(scan.target)
    host = origin.hostname
    hid = f"{scan.project_id}:host:{host}"
    item = db.get(Node, hid)
    if item is None:
        item = Node(
            id=hid,
            project_id=scan.project_id,
            kind="host",
            label=host,
            x=120,
            y=180,
            attrs=json.dumps(
                {
                    "ip": host,
                    "source": scan.tool,
                    "scan_id": scan.id,
                    "state": "HTTP response observed",
                }
            ),
        )
        db.add(item)
        db.flush()
    for i, result in enumerate(results):
        url = result["url"]
        nid = f"{scan.project_id}:url:{sha256(url.encode()).hexdigest()[:24]}"
        node = db.get(Node, nid)
        if node is None:
            node = Node(
                id=nid,
                project_id=scan.project_id,
                kind="url",
                label=url,
                x=490 + (i // 6) * 280,
                y=40 + (i % 6) * 125,
            )
            db.add(node)
        previous = json.loads(node.attrs or "{}")
        observations = previous.get("observations", [])
        observations = [v for v in observations if v.get("scan_id") != scan.id]
        observations.append(
            {"scan_id": scan.id, "tool": scan.tool, "observed_at": scan.started}
        )
        node.attrs = json.dumps(
            {
                "host": host,
                "url": url,
                "status": result["status"],
                "title": result["title"],
                "source": scan.tool,
                "scan_id": scan.id,
                "observed_at": scan.started,
                "technologies": result.get("technologies", []),
                "evidence_truncated": len(json.dumps(result["evidence"])) > 16000,
                "observations": observations[-20:],
                "evidence_json": json.dumps(result["evidence"])[:16000],
            }
        )
        db.flush()
        eid = nid + ":web"
        edge = db.get(Edge, eid)
        if edge is None:
            db.add(
                Edge(
                    id=eid,
                    project_id=scan.project_id,
                    source=hid,
                    target=nid,
                    kind="WEB_RESOURCE",
                    evidence=scan.id,
                )
            )
        else:
            edge.evidence = scan.id
    record(
        db,
        scan.project_id,
        f"{scan.tool} results saved: {len(results)} web observations",
    )
