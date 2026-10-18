"""Persist a tool outcome atomically with its graph projection.

No retry or network operation lives here. Incomplete exports remain available
even when they cannot be safely projected into observations.
"""
import json
from sqlalchemy import select, func
from . import nmap, recon
from .db import Node, Scan, now, record
from .graph import ingest, ingest_web


def save_outcome(sessions, scan_id, artifact, status, error="", exit_code=None):
    partial = status != "completed"
    available = artifact.is_file() and 0 < artifact.stat().st_size <= 16 * 1024 * 1024
    # Oversized output is outside the evidence budget; retain the console tail.
    if artifact.is_file() and artifact.stat().st_size > 16 * 1024 * 1024:
        artifact.unlink()
    with sessions() as db:
        scan = db.get(Scan, scan_id)
        options = json.loads(scan.options)
        rows, parse_error = [], ""
        if available:
            try:
                rows = (nmap.parse(artifact, scan.target, partial=partial) if scan.tool == "nmap"
                        else recon.parse(artifact, scan.tool, scan.target, partial=partial))
            except Exception as exc:
                if not partial:
                    raise
                parse_error = str(exc)[:500]
        elif not partial:
            raise ValueError("Tool finished without a usable result file")
        if rows:
            if scan.tool == "nmap":
                ingest(db, scan, rows, partial=partial)
            else:
                ingest_web(db, scan, rows)
            db.flush()
        ids = list(db.scalars(select(Node.id).where(
            Node.project_id == scan.project_id,
            func.json_extract(Node.attrs, "$.scan_id") == scan_id,
        ).order_by(Node.id)))
        options["result"] = {
            "partial": partial, "artifact_available": available,
            "observations": len(rows), "objects": len(ids), "node_ids": ids[:100],
            "projection_error": parse_error,
        }
        options["stage"] = status
        scan.options = json.dumps(options)
        scan.status, scan.error, scan.ended, scan.exit_code = status, error[:2000], now(), exit_code
        record(db, scan.project_id, f"Scan {status}: {scan.target}; {len(rows)} observations saved")
        db.commit()
