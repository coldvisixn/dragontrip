import asyncio
import json
import os
import signal
from pathlib import Path

from .db import Scan, ScopeRule, now, record
from .scope import classify
from . import nmap
from .scan_results import save_outcome


class TaskManager:
    def __init__(self, sessions, artifacts: Path):
        self.sessions = sessions
        self.artifacts = artifacts
        artifacts.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.tool_config = artifacts / "tool-config"
        self.tool_config.mkdir(mode=0o700, exist_ok=True)
        (self.tool_config / "httpx.yaml").write_text("{}\n")
        self.tasks = {}
        self.processes = {}
        self.waiting = []
        self.running = set()
        self.concurrency = 1
        self.condition = asyncio.Condition()
        # Crashed scans are never presented as still running after restart.
        with sessions() as db:
            for scan in db.query(Scan).filter(Scan.status.in_(["queued", "running"])):
                scan.status, scan.ended, scan.error = (
                    "interrupted",
                    now(),
                    "Application stopped before scan completed",
                )
                # Preserve bounded raw evidence after a crash; never relaunch a tool.
                options = json.loads(scan.options)
                artifact = artifacts / f"{scan.id}.{'xml' if scan.tool == 'nmap' else 'json'}"
                available = artifact.is_file() and 0 < artifact.stat().st_size <= 16 * 1024 * 1024
                if artifact.is_file() and artifact.stat().st_size > 16 * 1024 * 1024:
                    artifact.unlink()
                options.update(stage="interrupted", result={
                    **options.get("result", {}), "partial": True,
                    "artifact_available": available,
                })
                scan.options = json.dumps(options)
            db.commit()
        # Wordlists are disposable, including a crash between file creation and DB commit.
        from uuid import UUID

        for wordlist in artifacts.glob("*.words"):
            try:
                UUID(wordlist.stem)
            except ValueError:
                continue
            wordlist.unlink(missing_ok=True)

    def enqueue(self, scan_id):
        self.waiting.append(scan_id)
        self.tasks[scan_id] = asyncio.create_task(self.scheduled(scan_id))

    async def scheduled(self, scan_id):
        try:
            async with self.condition:
                await self.condition.wait_for(
                    lambda: self.waiting
                    and self.waiting[0] == scan_id
                    and len(self.running) < self.concurrency
                )
                self.waiting.remove(scan_id)
                self.running.add(scan_id)
                self.condition.notify_all()
            await self.run(scan_id)
        except asyncio.CancelledError:
            self.finish(scan_id, "cancelled", "Cancelled before launch", None)
        finally:
            async with self.condition:
                if scan_id in self.waiting:
                    self.waiting.remove(scan_id)
                self.running.discard(scan_id)
                self.tasks.pop(scan_id, None)
                self.condition.notify_all()

    async def configure(self, concurrency):
        async with self.condition:
            self.concurrency = concurrency
            self.condition.notify_all()

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
        with self.sessions() as db:
            current = db.get(Scan, scan_id)
            tool = current.tool
            timeout = json.loads(current.options).get("timeout", 240)
        artifact = self.artifacts / f"{scan_id}.{"xml" if tool == "nmap" else "json"}"
        try:
            with self.sessions() as db:
                scan = db.get(Scan, scan_id)
                rules = list(db.query(ScopeRule).filter_by(project_id=scan.project_id))
                scope_required = json.loads(scan.options).get("scope_required", False)
                if (scope_required and not rules) or (
                    rules and classify(rules, scan.target) != "included"
                ):
                    raise ValueError(
                        "Project scope changed while queued; target is no longer included"
                    )
                args = json.loads(scan.command)
                scan.status = "running"
                options = json.loads(scan.options)
                options["stage"] = "executing"
                scan.options = json.dumps(options)
                scan.started = now()
                db.commit()
            environment = nmap.external_environment()
            environment["XDG_CONFIG_HOME"] = str(self.tool_config)
            proc = await asyncio.create_subprocess_exec(
                *args,
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                start_new_session=True,
                limit=65536,
                env=environment,
            )
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
                        scan.output = (scan.output + chunk.decode("utf-8", "replace"))[
                            -65536:
                        ]
                        db.commit()
                return await proc.wait()

            code = await asyncio.wait_for(consume(), timeout=timeout)
            if code != 0:
                raise RuntimeError(
                    f"{tool} exited with code {code}; see terminal output"
                )
            with self.sessions() as db:
                scan = db.get(Scan, scan_id)
                options = json.loads(scan.options)
                options["stage"] = "saving"
                scan.options = json.dumps(options)
                db.commit()
            # Synchronous transaction: cancellation cannot split projection and completion.
            save_outcome(self.sessions, scan_id, artifact, "completed", exit_code=str(code))
        except asyncio.CancelledError:
            if proc:
                await self.stop_process(proc)
            self.finish(scan_id, "cancelled", "Cancelled by user", proc)
        except Exception as exc:
            if proc:
                await self.stop_process(proc)
            self.finish(
                scan_id,
                "failed",
                (
                    f"Scan timeout ({timeout}s)"
                    if isinstance(exc, asyncio.TimeoutError)
                    else str(exc)
                ),
                proc,
            )
        finally:
            self.processes.pop(scan_id, None)
            self.tasks.pop(scan_id, None)
            (self.artifacts / f"{scan_id}.words").unlink(missing_ok=True)

    def finish(self, scan_id, status, error, proc):
        with self.sessions() as db:
            scan = db.get(Scan, scan_id)
            if scan.status not in {"queued", "running"}:
                return
            extension = "xml" if scan.tool == "nmap" else "json"
        try:
            save_outcome(self.sessions, scan_id, self.artifacts / f"{scan_id}.{extension}",
                         status, error, str(proc.returncode) if proc else None)
            return
        except Exception as exc:
            error += "; Result projection failed: " + str(exc)
        with self.sessions() as db:
            scan = db.get(Scan, scan_id)
            artifact = self.artifacts / f"{scan_id}.{extension}"
            options = json.loads(scan.options)
            options.update(stage=status, result={
                "partial": True,
                "artifact_available": artifact.is_file() and 0 < artifact.stat().st_size <= 16 * 1024 * 1024,
                "projection_error": error[:500],
            })
            scan.options = json.dumps(options)
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
            async with self.condition:
                if scan_id in self.waiting:
                    self.waiting.remove(scan_id)
                self.condition.notify_all()
            (self.artifacts / f"{scan_id}.words").unlink(missing_ok=True)

    async def close(self):
        await asyncio.gather(
            *(self.cancel(sid) for sid in list(self.tasks)), return_exceptions=True
        )
