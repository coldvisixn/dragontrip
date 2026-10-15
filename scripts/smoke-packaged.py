"""Exercise the frozen sidecar through real HTTP, then restart with the same DB."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
import urllib.request

root=Path(__file__).resolve().parent.parent
binary=root/"src-tauri/resources/backend/dragontrip-backend"
with tempfile.TemporaryDirectory(prefix="dragontrip-smoke-") as storage:
    token=secrets.token_hex(32)
    def launch():
        start=time.monotonic()
        proc=subprocess.Popen([str(binary)],env={**os.environ,"DRAGONTRIP_TOKEN":token,"XDG_DATA_HOME":storage},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        line=proc.stdout.readline()
        if not line.startswith("DRAGONTRIP_READY "):
            raise RuntimeError(proc.stderr.read())
        port=int(line.split()[1])
        def request(path,body=None):
            data=json.dumps(body).encode() if body is not None else None
            req=urllib.request.Request(f"http://127.0.0.1:{port}"+path,data=data,headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"})
            with urllib.request.urlopen(req,timeout=5) as response:
                return json.load(response)
        for _ in range(100):
            try:
                request("/health")
                break
            except OSError:
                time.sleep(.05)
        print(f"Frozen backend ready in {time.monotonic()-start:.3f}s")
        status=Path(f"/proc/{proc.pid}/status").read_text()
        print(next(line for line in status.splitlines() if line.startswith("VmRSS:")))
        return proc,request
    proc,request=launch()
    try:
        p=request("/projects",{"name":"Frozen backend smoke"})
        node=request(f"/projects/{p['id']}/nodes",{"label":"Saved object","x":123,"y":456})
    finally:
        proc.terminate()
        proc.wait(timeout=10)
    proc,request=launch()
    try:
        result=request(f"/projects/{p['id']}")
        assert result["nodes"][0]["x"]==123
        assert result["nodes"][0]["id"]==node["id"]
        print("Frozen backend HTTP + migrations + restart persistence: PASS")
    finally:
        proc.terminate()
        proc.wait(timeout=10)
