import asyncio
import json
import os
import signal
from pathlib import Path

from .db import Scan, now, record
from .graph import ingest
from . import nmap


class TaskManager:
    def __init__(self, sessions, artifacts: Path):
        self.sessions = sessions
        self.artifacts = artifacts
        artifacts.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.tasks = {}
        self.processes = {}
        # Crashed scans are never presented as still running after restart.
        with sessions() as db:
            for scan in db.query(Scan).filter(Scan.status.in_(["queued", "running"])):
                scan.status, scan.ended, scan.error = "interrupted", now(), "Application stopped before scan completed"
            db.commit()

    async def stop_process(self, proc):
        if proc.returncode is None:
            try:
                os.killpg(proc.pid, signal.SIGTERM)
            except ProcessLookupError:
                return
            try:
                await asyncio.wait_for(proc.wait(), 3)
            except asyncio.TimeoutError:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                await proc.wait()

    async def run(self, scan_id):
        proc = None
        artifact = self.artifacts / f"{scan_id}.xml"
        try:
            with self.sessions() as db:
                scan = db.get(Scan, scan_id)
                args = json.loads(scan.command)
                scan.status = "running"
                db.commit()
            proc = await asyncio.create_subprocess_exec(
                *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
                start_new_session=True, limit=65536, env=nmap.external_environment())
            self.processes[scan_id] = proc

            async def consume():
                total = 0
                while chunk := await proc.stdout.read(4096):
                    total += len(chunk)
                    if total > 8 * 1024 * 1024:
                        raise ValueError("Tool output exceeded 8 MiB safety limit")
                    if artifact.exists() and artifact.stat().st_size > 16 * 1024 * 1024:
                        raise ValueError("XML output exceeded 16 MiB safety limit")
                    with self.sessions() as db:
                        scan = db.get(Scan, scan_id)
                        scan.output = (scan.output + chunk.decode("utf-8", "replace"))[-65536:]
                        db.commit()
                return await proc.wait()

            code = await asyncio.wait_for(consume(), timeout=240)
            if code != 0:
                raise RuntimeError(f"Nmap exited with code {code}; see terminal output")
            with self.sessions() as db:
                scan = db.get(Scan, scan_id)
                hosts = await asyncio.to_thread(nmap.parse, artifact, scan.target)
                ingest(db, scan, hosts)
                scan.status, scan.ended, scan.exit_code = "completed", now(), str(code)
                db.commit()
        except asyncio.CancelledError:
            if proc:
                await self.stop_process(proc)
            self.finish(scan_id, "cancelled", "Cancelled by user", proc)
            artifact.unlink(missing_ok=True)
        except Exception as exc:
            if proc:
                await self.stop_process(proc)
            self.finish(scan_id, "failed", "Scan timeout (240s)" if isinstance(exc, asyncio.TimeoutError) else str(exc), proc)
            artifact.unlink(missing_ok=True)
        finally:
            self.processes.pop(scan_id, None)
            self.tasks.pop(scan_id, None)

    def finish(self, scan_id, status, error, proc):
        with self.sessions() as db:
            scan = db.get(Scan, scan_id)
            scan.status, scan.error, scan.ended = status, error[:2000], now()
            scan.exit_code = str(proc.returncode) if proc else None
            record(db, scan.project_id, f"Scan {status}: {scan.target}")
            db.commit()

    async def cancel(self, scan_id):
        task = self.tasks.get(scan_id)
        if task:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            # Cancellation can arrive before the coroutine executes its first line.
            if scan_id in self.tasks:
                self.tasks.pop(scan_id, None)
                self.finish(scan_id, "cancelled", "Cancelled before launch", None)

    async def close(self):
        await asyncio.gather(*(self.cancel(sid) for sid in list(self.tasks)), return_exceptions=True)
