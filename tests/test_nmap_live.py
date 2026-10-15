"""Opt-in integration check against our own loopback HTTP server only."""
import os
import shutil
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import pytest

@pytest.mark.skipif(os.environ.get("DRAGONTRIP_LIVE_TEST") != "1" or not shutil.which("nmap"),
                    reason="Set DRAGONTRIP_LIVE_TEST=1 with system Nmap installed")
def test_real_nmap_database_graph(client, app):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type","text/plain")
            self.end_headers()
            self.wfile.write(b"Dragontrip authorized loopback integration test\n")
        def log_message(self, *_):
            pass
    class QuietServer(ThreadingHTTPServer):
        def handle_error(self, request, client_address):
            pass
    server=QuietServer(("127.0.0.1",8080),Handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    try:
        p=client.post("/projects",json={"name":"Live loopback verification"}).json()
        result=client.post(f"/projects/{p['id']}/scans",json={"target":"127.0.0.1","authorized":True})
        assert result.status_code==201, result.text
        sid=result.json()["id"]
        deadline=time.monotonic()+245
        while time.monotonic()<deadline:
            scan=client.get(f"/scans/{sid}").json()
            if scan["status"] not in ("running","queued"):
                break
            time.sleep(.25)
        assert scan["status"]=="completed",scan
        d=client.get(f"/projects/{p['id']}").json()
        services=[n for n in d["nodes"] if n["kind"]=="service"]
        assert any(n["attrs"]["port"]==8080 for n in services), d
        assert all(n["attrs"]["scan_id"]==sid for n in services)
        assert all(e["evidence"]==sid for e in d["edges"])
        artifact=client.get(f"/scans/{sid}/artifact")
        assert artifact.status_code==200
        assert b"<nmaprun" in artifact.content
        print(f"Verified real Nmap scan: {len(services)} loopback service(s), graph persisted")
    finally:
        server.shutdown()
        server.server_close()
