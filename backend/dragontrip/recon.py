"""Structured recon profiles and bounded adapters. No arbitrary command arguments."""

import asyncio
import json
import re
import shutil
from urllib.parse import urlsplit, urlunsplit

from . import nmap

TOOLS = {
    "nmap": "Nmap",
    "whatweb": "WhatWeb",
    "httpx": "ProjectDiscovery httpx",
    "ffuf": "ffuf",
}
SAFE_NSE = {"ssh-hostkey", "smb-protocols", "ftp-syst", "rdp-enum-encryption"}

DEFAULTS = [
    {
        "id": "quick",
        "name": "Quick Scan",
        "tool": "nmap",
        "ports": "",
        "rate": 100,
        "timeout": 240,
    },
    {
        "id": "full",
        "name": "Full Scan",
        "tool": "nmap",
        "ports": "1-65535",
        "rate": 100,
        "timeout": 900,
    },
    {
        "id": "service",
        "name": "Service Enumeration",
        "scripts": sorted(SAFE_NSE),
        "tool": "nmap",
        "ports": "80,443,8080,8443",
        "rate": 50,
        "timeout": 300,
    },
    {
        "id": "whatweb",
        "name": "Web fingerprint",
        "tool": "whatweb",
        "ports": "",
        "rate": 5,
        "timeout": 120,
    },
    {
        "id": "httpx",
        "name": "HTTP inspection",
        "tool": "httpx",
        "ports": "",
        "rate": 5,
        "timeout": 120,
    },
    {
        "id": "ffuf",
        "name": "Web path discovery",
        "tool": "ffuf",
        "ports": "",
        "rate": 5,
        "timeout": 180,
    },
]


def validate_profile(data):
    name = str(data.get("name", "")).strip()
    if not 1 <= len(name) <= 80 or data.get("tool") not in TOOLS:
        raise ValueError("Choose a name and a supported tool")
    ports = str(data.get("ports", ""))
    if ports:
        if len(ports) > 300 or not re.fullmatch(
            r"\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*", ports
        ):
            raise ValueError(
                "Ports must be numbers or ranges, such as 80,443,8000-8100"
            )
        for part in ports.split(","):
            values = [int(v) for v in part.split("-")]
            if not all(1 <= v <= 65535 for v in values) or values[0] > values[-1]:
                raise ValueError("Invalid port range")
    rate, timeout = int(data.get("rate", 50)), int(data.get("timeout", 240))
    if (
        not 1 <= rate <= (1000 if data["tool"] == "nmap" else 50)
        or not 10 <= timeout <= 900
    ):
        raise ValueError(
            "Rate must be 1–1000 for Nmap or 1–50 for web tools; timeout 10–900 seconds"
        )
    scripts = data.get("scripts", [])
    if (
        not isinstance(scripts, list)
        or len(scripts) > 4
        or any(script not in SAFE_NSE for script in scripts)
        or (scripts and data["tool"] != "nmap")
    ):
        raise ValueError("Only the listed diagnostic Nmap scripts are supported")
    return {
        "scripts": sorted(set(scripts)),
        "name": name,
        "tool": data["tool"],
        "ports": ports,
        "rate": rate,
        "timeout": timeout,
    }


def target(value, tool):
    if tool == "nmap":
        return nmap.ipv4(value)
    url = urlsplit(value)
    if (
        url.scheme not in {"http", "https"}
        or not url.hostname
        or url.username is not None
        or url.password is not None
        or url.fragment
        or url.query
    ):
        raise ValueError(
            "Use an HTTP(S) URL with a single IPv4 host; no credentials, query or fragment"
        )
    nmap.ipv4(url.hostname)
    if url.port is not None and not 1 <= url.port <= 65535:
        raise ValueError("Invalid URL port")
    if any(ord(c) < 32 or ord(c) == 127 for c in value) or len(value) > 1000:
        raise ValueError("Invalid URL")
    return urlunsplit((url.scheme, url.netloc, url.path or "/", "", ""))


async def discover(only=None):
    async def check(key, label):
        path = shutil.which(key + "-toolkit") if key == "httpx" else None
        path = path or shutil.which(key)
        info = {"id": key, "name": label, "path": path, "installed": bool(path)}
        if not path:
            return info
        proc = None
        try:
            proc = await asyncio.create_subprocess_exec(
                path,
                *(
                    ["-version", "-duc"]
                    if key == "httpx"
                    else ["--version"] if key != "ffuf" else ["-V"]
                ),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env=nmap.external_environment(),
            )
            raw, _ = await asyncio.wait_for(proc.communicate(), 3)
            text = re.sub(r"\x1b\[[0-9;]*[mK]", "", raw.decode(errors="replace")[:2000])
            if proc.returncode != 0:
                info.update(
                    installed=False,
                    version=text.strip()[:250] or "Executable failed its version check",
                )
            elif key == "httpx" and not (
                "projectdiscovery" in text.lower()
                or re.search(r"(?:current|httpx)\s+version.*v?\d", text, re.I)
            ):
                info.update(
                    installed=False,
                    version="This is not ProjectDiscovery httpx; install httpx-toolkit",
                )
            else:
                info["version"] = next(
                    (
                        line.strip()
                        for line in text.splitlines()
                        if re.search(r"version.*\d", line, re.I)
                    ),
                    (
                        text.strip().splitlines()[0]
                        if text.strip()
                        else "Version unavailable"
                    ),
                )[:250]
        except (OSError, asyncio.TimeoutError):
            info.update(installed=False, version="Executable could not start")
        finally:
            if proc and proc.returncode is None:
                proc.kill()
                await proc.wait()
        return info

    return await asyncio.gather(
        *(check(k, v) for k, v in TOOLS.items() if only is None or k == only)
    )


def arguments(path, profile, destination, artifact, words=None):
    tool, rate, timeout = profile["tool"], profile["rate"], profile["timeout"]
    if tool == "nmap":
        args = nmap.arguments(path, destination, artifact)
        if profile.get("id") == "service":
            index = args.index("--version-light")
            args[index : index + 1] = ["--version-intensity", "7"]
        if profile["ports"]:
            index = args.index("--top-ports")
            args[index : index + 2] = ["-p", profile["ports"]]
        if profile.get("scripts"):
            args = args[:-1] + [
                "--script",
                ",".join(profile["scripts"]),
                "--script-timeout",
                "15s",
                args[-1],
            ]
        args[args.index("--host-timeout") + 1] = f"{max(10, timeout - 10)}s"
        return args[:-1] + ["--max-rate", str(rate), args[-1]]
    if tool == "whatweb":
        return [
            path,
            "--color=never",
            "--aggression=1",
            "--max-redirects=0",
            "--follow-redirect=never",
            "--open-timeout=5",
            "--read-timeout=10",
            f"--log-json={artifact}",
            destination,
        ]
    if tool == "httpx":
        return [
            path,
            "-config",
            str(artifact.parent / "tool-config/httpx.yaml"),
            "-follow-redirects=false",
            "-follow-host-redirects=false",
            "-tls-probe=false",
            "-csp-probe=false",
            "-u",
            destination,
            "-json",
            "-silent",
            "-duc",
            "-status-code",
            "-title",
            "-tech-detect",
            "-server",
            "-no-fallback-scheme",
            "-threads",
            "1",
            "-rate-limit",
            str(rate),
            "-timeout",
            "10",
            "-retries",
            "0",
            "-o",
            str(artifact),
        ]
    return [
        path,
        "-r=false",
        "-recursion=false",
        "-u",
        destination.rstrip("/") + "/FUZZ",
        "-w",
        str(words),
        "-of",
        "json",
        "-o",
        str(artifact),
        "-rate",
        str(rate),
        "-t",
        "1",
        "-timeout",
        "10",
        "-maxtime",
        str(timeout),
        "-noninteractive",
        "-mc",
        "200,204,301,302,307,308,401,403,405",
    ]


def parse(path, tool, destination):
    if path.stat().st_size > 16 * 1024 * 1024:
        raise ValueError("Recon result exceeds 16 MiB")
    text = path.read_text()
    if tool == "whatweb":
        rows = json.loads(text)
    elif tool == "httpx":
        rows = [json.loads(line) for line in text.splitlines() if line.strip()]
    else:
        rows = json.loads(text).get("results", [])
    if not isinstance(rows, list) or len(rows) > 10000:
        raise ValueError("Invalid or excessive result records")
    origin = urlsplit(destination)
    accepted = []
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Invalid recon record")
        candidate = str(row.get("url") or row.get("target") or destination)
        parsed = urlsplit(candidate)
        if (
            parsed.scheme,
            parsed.hostname,
            parsed.port or (443 if parsed.scheme == "https" else 80),
        ) != (
            origin.scheme,
            origin.hostname,
            origin.port or (443 if origin.scheme == "https" else 80),
        ):
            continue
        status = row.get("status", row.get("status_code", row.get("http_status")))
        if not isinstance(status, int) or not 100 <= status <= 599:
            continue
        default_port = 443 if parsed.scheme == "https" else 80
        host = parsed.hostname
        netloc = (
            f"{host}:{parsed.port}"
            if parsed.port and parsed.port != default_port
            else host
        )
        canonical = urlunsplit(
            (parsed.scheme, netloc, parsed.path or "/", parsed.query, "")
        )
        accepted.append(
            {
                "url": canonical[:2000],
                "status": status,
                "title": str(row.get("title", ""))[:1000],
                "technologies": (
                    list(row.get("plugins", {}).keys())[:100]
                    if tool == "whatweb" and isinstance(row.get("plugins"), dict)
                    else (
                        [str(v)[:100] for v in row.get("tech", [])[:100]]
                        if isinstance(row.get("tech", []), list)
                        else []
                    )
                ),
                "evidence": row,
            }
        )
    return accepted
