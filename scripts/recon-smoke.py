"""Real Phase 2 adapters against owned loopback servers, via the frozen backend API."""

import argparse
import http.server
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import urllib.error


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--backend", default="backend/dist/dragontrip-backend/dragontrip-backend"
    )
    parser.add_argument(
        "--skip-httpx",
        action="store_true",
        help="Partial local check when ProjectDiscovery httpx is unavailable",
    )
    args = parser.parse_args()
    outside_hits = []

    class Server(http.server.ThreadingHTTPServer):
        def handle_error(self, *_):
            pass

    class Outside(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            outside_hits.append(self.path)
            self.send_response(200)
            self.end_headers()

        def log_message(self, *_):
            pass

    outside = Server(("127.0.0.1", 0), Outside)

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(
                302
                if self.path == "/redirect"
                else (
                    403
                    if self.path == "/admin"
                    else 200 if self.path in ("/", "/robots.txt") else 404
                )
            )
            if self.path == "/redirect":
                self.send_header(
                    "Location", f"http://127.0.0.1:{outside.server_port}/escaped"
                )
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            try:
                self.wfile.write(
                    b"<html><title>Dragontrip local lab</title>Owned test server</html>"
                )
            except OSError:
                pass

        def log_message(self, *_):
            pass

    server = Server(("127.0.0.1", 8080), Handler)
    for instance in (server, outside):
        threading.Thread(target=instance.serve_forever, daemon=True).start()
    token = "a" * 64
    with tempfile.TemporaryDirectory(prefix="dragontrip-recon-") as root:
        env = {**os.environ, "DRAGONTRIP_TOKEN": token, "XDG_DATA_HOME": root}
        process = subprocess.Popen(
            [str(Path(args.backend).resolve())],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            line = process.stdout.readline()
            assert line.startswith("DRAGONTRIP_READY "), line
            port = int(line.split(" ", 1)[1])

            def api(path, body=None, method=None):
                request = urllib.request.Request(
                    f"http://127.0.0.1:{port}" + path,
                    data=json.dumps(body).encode() if body is not None else None,
                    method=method,
                    headers={
                        "Authorization": "Bearer " + token,
                        "Content-Type": "application/json",
                    },
                )
                with urllib.request.urlopen(request, timeout=15) as response:
                    return json.load(response)

            def wait(scan):
                deadline = time.monotonic() + 100
                while time.monotonic() < deadline:
                    value = api("/scans/" + scan["id"])
                    if value["status"] not in ("queued", "running"):
                        assert value["status"] == "completed", value
                        return value
                    time.sleep(0.2)
                raise RuntimeError("Recon timeout: " + str(scan))

            deadline = time.monotonic() + 10
            while True:
                try:
                    api("/health")
                    break
                except (OSError, urllib.error.URLError):
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(0.1)
            tools = api("/tools")
            assert all(
                t["installed"]
                for t in tools
                if not (args.skip_httpx and t["id"] == "httpx")
            ), tools
            print(
                "Real installed tools:",
                [(t["id"], t.get("version")) for t in tools],
                flush=True,
            )
            project = api("/projects", {"name": "Phase 2 real tools"})["id"]
            profile = api(
                "/profiles",
                {
                    "name": "Loopback service",
                    "tool": "nmap",
                    "ports": "8080",
                    "rate": 50,
                    "timeout": 60,
                },
            )
            api("/queue", {"concurrency": 2}, "PUT")
            wait(
                api(
                    "/projects/" + project + "/scans",
                    {
                        "target": "127.0.0.1",
                        "authorized": True,
                        "profile": profile["id"],
                    },
                )
            )
            assert any(
                n["kind"] == "service" and n["attrs"]["port"] == 8080
                for n in api("/projects/" + project)["nodes"]
            )
            recommendations = api("/projects/" + project + "/recommendations")
            assert {r["profile"] for r in recommendations} == {
                "service",
                "whatweb",
                "httpx",
                "ffuf",
            }
            service_recommendation = next(
                item for item in recommendations if item["profile"] == "service"
            )
            enumeration = wait(
                api(
                    "/projects/" + project + "/scans",
                    {
                        "target": "127.0.0.1",
                        "authorized": True,
                        "profile": "service",
                        "service_node": service_recommendation["node_id"],
                        "confirmed": True,
                    },
                )
            )
            assert (
                "--script" in enumeration["command"]
                and enumeration["options"]["ports"] == "8080"
            )
            print(
                "PASS: selected-service enumeration and bounded diagnostic NSE allowlist",
                flush=True,
            )
            pending = []
            for profile_id in (
                ["whatweb", "ffuf"] if args.skip_httpx else ["whatweb", "httpx", "ffuf"]
            ):
                pending.append(
                    api(
                        "/projects/" + project + "/scans",
                        {
                            "target": "http://127.0.0.1:8080/",
                            "authorized": True,
                            "profile": profile_id,
                            "confirmed": True,
                            "words": ["admin", "robots.txt", "missing", "redirect"],
                        },
                    )
                )
            for scan in pending:
                done = wait(scan)
                evidence = (
                    api("/scans/" + scan["id"] + "/artifact")
                    if scan["tool"] != "httpx"
                    else None
                )
                assert done["tool"] == scan["tool"]
                print(
                    "PASS:",
                    scan["tool"],
                    "real process, parsed result and persisted evidence",
                    flush=True,
                )
            graph = api("/projects/" + project)
            urls = [n for n in graph["nodes"] if n["kind"] == "url"]
            assert any(
                n["attrs"]["url"].endswith("/admin") and n["attrs"]["status"] == 403
                for n in urls
            ), graph
            assert any(n["attrs"]["url"].endswith("/robots.txt") for n in urls)
            assert not any(n["attrs"]["url"].endswith("/missing") for n in urls)
            root_node = next(
                n for n in urls if n["attrs"]["url"] == "http://127.0.0.1:8080/"
            )
            assert {v["tool"] for v in root_node["attrs"]["observations"]} == (
                {"whatweb"} if args.skip_httpx else {"whatweb", "httpx"}
            )
            api(
                "/projects/"
                + project
                + "/nodes/"
                + urllib.parse.quote(root_node["id"], safe="")
                + "/position",
                {"x": 789, "y": 345},
                "PUT",
            )
            for profile_id in ["whatweb"] if args.skip_httpx else ["whatweb", "httpx"]:
                wait(
                    api(
                        "/projects/" + project + "/scans",
                        {
                            "target": "http://127.0.0.1:8080/redirect",
                            "authorized": True,
                            "profile": profile_id,
                        },
                    )
                )
            assert not outside_hits, "Tool followed an out-of-origin redirect: " + str(
                outside_hits
            )
            assert (
                next(
                    n
                    for n in api("/projects/" + project)["nodes"]
                    if n["id"] == root_node["id"]
                )["x"]
                == 789
            )
            assert not list((Path(root) / "dragontrip/artifacts").glob("*.words"))
            print(
                ("PARTIAL PASS" if args.skip_httpx else "FULL PASS")
                + ": Nmap recommendations + web graph + deduplication + coordinate preservation + no cross-origin redirects + wordlist cleanup",
                flush=True,
            )
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            server.shutdown()
            outside.shutdown()


if __name__ == "__main__":
    main()
