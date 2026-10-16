"""Explicit, offline scope. Never resolve names or expand CIDR into host lists."""

import hashlib
import ipaddress
import re
from urllib.parse import urlsplit, urlunsplit
from typing import Literal
from fastapi import HTTPException
from pydantic import BaseModel, Field
from .db import ScopeRule, record, serialize


def hostname(value):
    value = value.rstrip(".").lower()
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        value = value.encode("idna").decode("ascii")
        if len(value) > 253 or not all(
            re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", p)
            for p in value.split(".")
        ):
            raise ValueError("Invalid domain name")
        return value


def web_url(value):
    if (
        len(value) > 4096
        or any(ord(c) < 33 or ord(c) == 127 for c in value)
        or "\\" in value
    ):
        raise ValueError("Invalid HTTP URL")
    parsed = urlsplit(value)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError("Use an http(s) URL without credentials")
    host = hostname(parsed.hostname)
    port = parsed.port
    if port is not None and not 1 <= port <= 65535:
        raise ValueError("Invalid port")
    authority = f"[{host}]" if ":" in host else host
    if port and port != (443 if parsed.scheme == "https" else 80):
        authority += f":{port}"
    origin = f"{parsed.scheme}://{authority}"
    # Preserve path case, escapes, duplicate query fields, values and ordering.
    url = urlunsplit((parsed.scheme, authority, parsed.path or "/", parsed.query, ""))
    return origin, url, host


def canonical_rule(value):
    value = value.strip()
    if not value or len(value) > 1000:
        raise ValueError("Empty or oversized scope entry")
    if "://" in value:
        origin, url, _ = web_url(value)
        if url != origin + "/":
            raise ValueError("Scope URLs must be origins without paths or queries")
        return origin
    if "/" in value:
        return str(ipaddress.ip_network(value, strict=False))
    if value.startswith("*."):
        return "*." + hostname(value[2:])
    return hostname(value)


def classify(rules, value, exported_ip=""):
    host = web_url(value)[2] if "://" in value else hostname(value)
    origin = web_url(value)[0] if "://" in value else ""

    def matches(rule, candidate, candidate_origin=""):
        target = rule.value
        if "://" in target:
            return target == candidate_origin
        if target.startswith("*."):
            return candidate.endswith(target[1:]) and candidate != target[2:]
        if "/" in target:
            try:
                return ipaddress.ip_address(candidate) in ipaddress.ip_network(target)
            except ValueError:
                return False
        return target == candidate

    if any(
        r.mode == "exclude"
        and (matches(r, host, origin) or (exported_ip and matches(r, exported_ip)))
        for r in rules
    ):
        return "excluded"
    if any(r.mode == "include" and matches(r, host, origin) for r in rules):
        return "included"
    return "unknown"


class RuleInput(BaseModel):
    value: str = Field(min_length=1, max_length=1000)
    mode: Literal["include", "exclude"] = "include"


class ScopeInput(BaseModel):
    rules: list[RuleInput] = Field(max_length=500)


def register_scope(app, sessions, project):
    @app.get("/projects/{pid}/scope")
    def get_scope(pid: str):
        with sessions() as db:
            project(db, pid)
            return [
                serialize(r)
                for r in db.query(ScopeRule)
                .filter_by(project_id=pid)
                .order_by(ScopeRule.mode, ScopeRule.value)
            ]

    @app.put("/projects/{pid}/scope")
    def set_scope(pid: str, body: ScopeInput):
        try:
            rules = sorted({(r.mode, canonical_rule(r.value)) for r in body.rules})
        except (ValueError, UnicodeError) as exc:
            raise HTTPException(422, str(exc))
        with app.state.research_lock, sessions() as db:
            project(db, pid)
            db.query(ScopeRule).filter_by(project_id=pid).delete()
            for mode, value in rules:
                db.add(
                    ScopeRule(
                        id=pid
                        + ":scope:"
                        + hashlib.sha256((mode + value).encode()).hexdigest()[:24],
                        project_id=pid,
                        mode=mode,
                        value=value,
                    )
                )
            record(
                db,
                pid,
                f"Scope updated: {len(rules)} rules; exclusions take precedence",
            )
            db.commit()
        return {"saved": len(rules)}
