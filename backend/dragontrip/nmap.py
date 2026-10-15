"""Nmap adapter: no shell, no user-supplied switches, bounded XML."""
import ipaddress
import os
import shutil
import sys
from pathlib import Path
from defusedxml import ElementTree


def ipv4(value: str):
    try:
        return str(ipaddress.IPv4Address(value))
    except ipaddress.AddressValueError as exc:
        raise ValueError("Enter a single IPv4 address (no CIDR, hostname or arguments).") from exc


def discover():
    path = shutil.which("nmap")
    return {"name": "Nmap", "installed": bool(path), "path": path}


def external_environment():
    """Let system tools load system libraries, not PyInstaller's private copies."""
    environment = os.environ.copy()
    if getattr(sys, "frozen", False) and sys.platform.startswith("linux"):
        original = environment.get("LD_LIBRARY_PATH_ORIG")
        if original is None:
            environment.pop("LD_LIBRARY_PATH", None)
        else:
            environment["LD_LIBRARY_PATH"] = original
    return environment


def arguments(binary, target, artifact):
    return [binary, "-sT", "-sV", "--version-light", "-n", "-Pn",
            "--top-ports", "100", "--max-retries", "1", "--host-timeout", "180s",
            "--stats-every", "2s", "-v", "-oX", str(artifact), ipv4(target)]


def parse(path: Path, target: str):
    if path.stat().st_size > 16 * 1024 * 1024:
        raise ValueError("Nmap XML exceeds 16 MiB limit")
    root = ElementTree.parse(path).getroot()
    if root.tag != "nmaprun" or root.find("runstats/finished") is None:
        raise ValueError("Incomplete Nmap XML")
    if root.find("runstats/finished").get("exit", "success") != "success":
        raise ValueError("Nmap reported an unsuccessful run")
    hosts = []
    for host in root.findall("host"):
        address = host.find("address[@addrtype='ipv4']")
        if address is None or address.get("addr") != target:
            continue
        status = host.find("status")
        services = []
        for port in host.findall("ports/port"):
            state = port.find("state")
            if state is None or state.get("state") != "open":
                continue
            service = port.find("service")
            services.append({
                "port": int(port.attrib["portid"]), "protocol": port.attrib["protocol"],
                "state": "open", "name": service.get("name", "unknown") if service is not None else "unknown",
                "product": service.get("product", "") if service is not None else "",
                "version": service.get("version", "") if service is not None else "",
                "evidence_xml": ElementTree.tostring(port, encoding="unicode"),
            })
        hosts.append({"ip": target, "state": status.get("state", "unknown") if status is not None else "unknown",
                      "services": services, "evidence_xml": ElementTree.tostring(host, encoding="unicode")[:32000]})
    return hosts
