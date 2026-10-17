"""Guard the loopback API before parsing any untrusted request bodies."""

import hmac
import re

from starlette.datastructures import Headers, MutableHeaders
from starlette.exceptions import HTTPException
from starlette.responses import Response


class LocalAPIGuard:
    def __init__(self, app, token, origins):
        self.app = app
        self.authorization = f"Bearer {token}".encode()
        self.origins = origins

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = Headers(scope=scope)
        host = headers.get("host", "")
        if not re.fullmatch(r"127\.0\.0\.1(?::[0-9]{1,5})?", host):
            return await Response(status_code=403)(scope, receive, send)
        origin = headers.get("origin")
        if origin and origin not in self.origins:
            return await Response(status_code=403)(scope, receive, send)
        cors = (
            {"Access-Control-Allow-Origin": origin, "Vary": "Origin"} if origin else {}
        )

        async def respond(status):
            await Response(status_code=status, headers=cors)(scope, receive, send)

        if scope["method"] == "OPTIONS":
            if origin not in self.origins:
                return await respond(403)
            return await Response(
                headers={
                    **cors,
                    "Access-Control-Allow-Headers": "Authorization, Content-Type",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                }
            )(scope, receive, send)
        if not hmac.compare_digest(
            headers.get("authorization", "").encode(), self.authorization
        ):
            return await respond(401)
        path = scope["path"]
        upload = scope["method"] == "POST" and (
            path.endswith("/attachments")
            or path == "/imports"
            or "/tool-import/" in path
        )
        limit = (
            140 * 1024 * 1024
            if path == "/imports"
            else 11 * 1024 * 1024 if upload else 256 * 1024
        )
        length = headers.get("content-length")
        if length is not None and not re.fullmatch(r"[0-9]+", length):
            return await respond(400)
        if upload and length is None:
            return await respond(411)
        # Compare as decimal text too, so arbitrarily long numeric headers cannot
        # hit Python's integer conversion limit and produce a server error.
        normalized = (length or "0").lstrip("0") or "0"
        if len(normalized) > len(str(limit)) or int(normalized) > limit:
            return await respond(413)
        received = 0

        async def bounded_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise HTTPException(413, "Request body exceeds size limit")
            return message

        async def guarded_send(message):
            if message["type"] == "http.response.start":
                response_headers = MutableHeaders(scope=message)
                response_headers.update(cors)
                response_headers["Cache-Control"] = "no-store"
                response_headers["X-Content-Type-Options"] = "nosniff"
            await send(message)

        await self.app(scope, bounded_receive, guarded_send)
