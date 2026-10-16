"""Offline parsers. Reject malformed input atomically; preserve original bytes separately."""

import base64
import hashlib
import ipaddress
import json
import re
from urllib.parse import urlsplit, parse_qsl
from defusedxml import ElementTree as XML
from .scope import web_url, hostname

MAX_SOURCE = 10 * 1024 * 1024
MAX_RECORDS = 5000


def digest(value):
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, ensure_ascii=True, separators=(",", ":")
        ).encode()
    ).hexdigest()


def identity(kind, value):
    return kind + ":" + digest(value)[:32]


def text(node, path):
    return node.findtext(path, default="") or ""


def message(node):
    if node is None:
        return ""
    value = node.text or ""
    if node.get("base64", "false").lower() == "true":
        try:
            return base64.b64decode(re.sub(r"\s", "", value), validate=True).decode(
                "utf-8", errors="replace"
            )
        except ValueError as exc:
            raise ValueError("Invalid base64 request/response") from exc
    return value


def method_from(request):
    first = request.splitlines()[0] if request else ""
    match = re.match(r"([A-Z!#$%&'*+.^_`|~-]{1,32}) \S+ HTTP/", first)
    return match[1] if match else "UNKNOWN"


def method(value):
    if not re.fullmatch(r"[A-Z!#$%&'*+.^_`|~-]{1,32}", value):
        raise ValueError("Invalid HTTP method")
    return value


def web_objects(url, verb, exported_ip=""):
    origin, url, host = web_url(url)
    verb = method(verb)
    try:
        ipaddress.ip_address(host)
        domain = "host:" + host
        host_kind = "host"
    except ValueError:
        domain = identity("domain", host)
        host_kind = "domain"
    app = identity("application", origin)
    endpoint = identity("endpoint", [verb, url])
    objects = [
        {"key": domain, "kind": host_kind, "label": host, "attrs": {"host": host}},
        {
            "key": app,
            "kind": "application",
            "label": origin,
            "parent": domain,
            "relation": "SERVES_APPLICATION",
            "attrs": {"origin": origin, "host": host},
        },
        {
            "key": endpoint,
            "kind": "endpoint",
            "label": f"{verb} {url}",
            "parent": app,
            "relation": "HAS_ENDPOINT",
            "attrs": {
                "origin": origin,
                "url": url,
                "host": host,
                "method": verb,
                "parameters": sorted(
                    {
                        key
                        for key, _ in parse_qsl(
                            urlsplit(url).query,
                            keep_blank_values=True,
                            max_num_fields=1000,
                        )
                    }
                ),
            },
        },
    ]
    if exported_ip:
        ip = str(ipaddress.ip_address(exported_ip))
        if ip != host:
            objects.insert(
                0,
                {"key": "host:" + ip, "kind": "host", "label": ip, "attrs": {"ip": ip}},
            )
            objects[1].update(parent="host:" + ip, relation="EXPORTED_ADDRESS")
    return objects, endpoint, url


def web_record(url, verb="UNKNOWN", request="", response="", ip="", **extra):
    objects, key, url = web_objects(url, verb, ip)
    params = set(objects[-1]["attrs"]["parameters"])
    headers, _, body = request.replace("\r\n", "\n").partition("\n\n")
    if re.search(r"(?im)^content-type:\s*application/x-www-form-urlencoded", headers):
        params |= {
            key
            for key, _ in parse_qsl(body, keep_blank_values=True, max_num_fields=1000)
        }
    elif re.search(r"(?im)^content-type:\s*application/json", headers) and body:
        try:
            data = json.loads(body)
            if isinstance(data, dict):
                params |= set(data)
        except ValueError:
            pass
    objects[-1]["attrs"]["parameters"] = sorted(params)[:1000]
    return {
        "objects": objects,
        "key": key,
        "scope_target": url,
        "ip": ip,
        "data": {
            "url": url,
            "method": verb,
            "parameters": sorted(params)[:1000],
            "request": request[:32000],
            "response": response[:32000],
            "messages_truncated": len(request) > 32000 or len(response) > 32000,
            **extra,
        },
    }


def parse_source(data):
    if not data or len(data) > MAX_SOURCE:
        raise ValueError("Import source must contain 1 byte–10 MiB")
    try:
        decoded = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError(
            "Use UTF-8 XML or JSONL; binary Burp project files are not supported"
        ) from exc
    warnings = []
    records = []
    if decoded.lstrip().startswith("<"):
        root = XML.fromstring(decoded)
        if root.tag == "items":
            fmt = "burp-items"
            warnings.append(
                "Selected saved items only: this export does not establish a complete sitemap. No vulnerability findings are inferred from traffic."
            )
            for i, item in enumerate(root.findall("item"), 1):
                request, response = message(item.find("request")), message(
                    item.find("response")
                )
                host = item.find("host")
                record = web_record(
                    text(item, "url"),
                    text(item, "method") or method_from(request),
                    request,
                    response,
                    host.get("ip", "") if host is not None else "",
                    status=text(item, "status"),
                    comment=text(item, "comment"),
                    time=text(item, "time"),
                )
                record["locator"] = f"item[{i}]"
                records.append(record)
        elif root.tag == "issues":
            fmt = "burp-issues"
            warnings.append(
                "Issue report only: endpoints are limited to reported issue locations and included messages, never a full sitemap. HTML descriptions are displayed as source text."
            )
            for i, issue in enumerate(root.findall("issue"), 1):
                pairs = issue.findall("requestresponse") or [None]
                for j, pair in enumerate(pairs, 1):
                    request = message(pair.find("request")) if pair is not None else ""
                    response = (
                        message(pair.find("response")) if pair is not None else ""
                    )
                    host = text(issue, "host")
                    location = text(issue, "path") or text(issue, "location") or "/"
                    url = host.rstrip("/") + "/" + location.lstrip("/")
                    # Prefer request target when a report provides a broader location.
                    first = request.splitlines()[0].split() if request else []
                    if len(first) >= 2 and first[1].startswith("/"):
                        url = host.rstrip("/") + first[1]
                    address = issue.find("host")
                    record = web_record(
                        url,
                        method_from(request),
                        request,
                        response,
                        address.get("ip", "") if address is not None else "",
                    )
                    severity = text(issue, "severity").lower()
                    record["finding"] = {
                        "type": text(issue, "type"),
                        "serial": text(issue, "serialNumber"),
                        "name": text(issue, "name") or "Burp issue",
                        "location": location,
                        "severity": (
                            severity
                            if severity in {"info", "low", "medium", "high", "critical"}
                            else "info"
                        ),
                        "body": (
                            text(issue, "issueBackground")
                            + "\n\n"
                            + text(issue, "issueDetail")
                        )[:12000],
                        "remediation": (
                            text(issue, "remediationBackground")
                            + "\n\n"
                            + text(issue, "remediationDetail")
                        )[:6000],
                        "confidence": text(issue, "confidence"),
                    }
                    record["locator"] = (
                        f"issue[{i}]/requestresponse[{j}]"
                        if pair is not None
                        else f"issue[{i}]"
                    )
                    records.append(record)
        elif root.tag == "nmaprun":
            fmt = "nmap-xml"
            finished = root.find("runstats/finished")
            if finished is None or finished.get("exit", "success") != "success":
                warnings.append(
                    "Incomplete/unsuccessful Nmap export: only present objects are imported; no absence or fixed state is inferred."
                )
            for i, host in enumerate(root.findall("host"), 1):
                address = host.find("address[@addrtype='ipv4']")
                if address is None:
                    address = host.find("address[@addrtype='ipv6']")
                if address is None:
                    warnings.append(f"host[{i}] has no supported IP address; skipped")
                    continue
                ip = str(ipaddress.ip_address(address.get("addr", "")))
                key = "host:" + ip
                obj = {
                    "key": key,
                    "kind": "host",
                    "label": ip,
                    "attrs": {
                        "ip": ip,
                        "state": text(host, "status")
                        or (
                            host.find("status").get("state", "unknown")
                            if host.find("status") is not None
                            else "unknown"
                        ),
                    },
                }
                records.append(
                    {
                        "objects": [obj],
                        "key": key,
                        "scope_target": ip,
                        "data": obj["attrs"],
                        "locator": f"host[{i}]",
                    }
                )
                for port in host.findall("ports/port"):
                    state = port.find("state")
                    if state is None or state.get("state") != "open":
                        continue
                    number = int(port.get("portid", "0"))
                    protocol = port.get("protocol", "")
                    if not 1 <= number <= 65535 or protocol not in {
                        "tcp",
                        "udp",
                        "sctp",
                    }:
                        raise ValueError("Invalid Nmap service")
                    sid = f"{key}:{protocol}:{number}"
                    service = port.find("service")
                    attrs = {
                        "host": ip,
                        "port": number,
                        "protocol": protocol,
                        "state": "open",
                        **(
                            {
                                k: service.get(k, "")
                                for k in ("name", "product", "version", "tunnel")
                            }
                            if service is not None
                            else {}
                        ),
                    }
                    records.append(
                        {
                            "objects": [
                                obj,
                                {
                                    "key": sid,
                                    "kind": "service",
                                    "label": f"{number}/{protocol} · {attrs.get('name', 'unknown')}",
                                    "attrs": attrs,
                                    "parent": key,
                                    "relation": "EXPOSES",
                                },
                            ],
                            "key": sid,
                            "scope_target": ip,
                            "data": attrs,
                            "locator": f"host[{i}]/port[{protocol}:{number}]",
                        }
                    )
                for name in host.findall("hostnames/hostname"):
                    domain = hostname(name.get("name", ""))
                    dkey = identity("domain", domain)
                    records.append(
                        {
                            "objects": [
                                obj,
                                {
                                    "key": dkey,
                                    "kind": "domain",
                                    "label": domain,
                                    "attrs": {"host": domain},
                                    "parent": key,
                                    "relation": "EXPORTED_ADDRESS",
                                },
                            ],
                            "key": dkey,
                            "scope_target": domain,
                            "ip": ip,
                            "data": {"exported_ip": ip},
                            "locator": f"host[{i}]/hostname[{domain}]",
                        }
                    )
        else:
            raise ValueError(
                "Unsupported XML root. Use Nmap nmaprun, Burp items or issues XML; HTML and binary project files are not supported"
            )
    else:
        fmt = "nuclei-jsonl"
        for i, line in enumerate(decoded.splitlines(), 1):
            if not line.strip():
                continue
            item = json.loads(line)
            if (
                not isinstance(item, dict)
                or not item.get("template-id")
                or not isinstance(item.get("info"), dict)
            ):
                raise ValueError(f"Line {i}: expected a Nuclei JSONL result")
            if item.get("matcher-status") is False or item.get("error"):
                warnings.append(
                    f"Line {i}: unsuccessful Nuclei result skipped; no finding inferred"
                )
                continue
            url = item.get("matched-at") or item.get("url") or item.get("host", "")
            if not isinstance(url, str) or not url.startswith(("http://", "https://")):
                warnings.append(
                    f"Line {i}: non-HTTP Nuclei result is unsupported and skipped"
                )
                continue
            request, response = item.get("request") or "", item.get("response") or ""
            if not isinstance(request, str) or not isinstance(response, str):
                raise ValueError(f"Line {i}: request/response must be strings")
            record = web_record(
                url,
                method_from(request),
                request,
                response,
                item.get("ip") or "",
                extracted_results=item.get("extracted-results", []),
                matcher_name=item.get("matcher-name", ""),
            )
            info = item["info"]
            severity = str(info.get("severity", "info")).lower()
            record["finding"] = {
                "type": str(item["template-id"]),
                "name": str(info.get("name") or item["template-id"]),
                "location": str(item.get("matcher-name", "")),
                "severity": (
                    severity
                    if severity in {"info", "low", "medium", "high", "critical"}
                    else "info"
                ),
                "body": str(info.get("description", ""))[:12000],
                "remediation": str(info.get("remediation", ""))[:6000],
                "classification": info.get("classification", {}),
            }
            record["locator"] = f"line[{i}]"
            records.append(record)
            if len(records) > MAX_RECORDS:
                raise ValueError("Import exceeds 5000 observations; split the export")
    if len(records) > MAX_RECORDS:
        raise ValueError("Import exceeds 5000 observations; split the export")
    if not records:
        if not decoded.lstrip().startswith("<"):
            raise ValueError("No supported HTTP results found in this export")
        warnings.append(
            "Empty export: records no observations and does not establish that any issue is fixed"
        )
    for record in records:
        if len(json.dumps(record).encode()) > 1024 * 1024:
            raise ValueError(
                "A single observation exceeds 1 MiB of metadata; split/reduce the export"
            )
    return fmt, records, list(dict.fromkeys(warnings))[:100]
