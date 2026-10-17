"""Script-free, self-contained report output with explicitly selected evidence."""

import base64
import hashlib
import html
import zipfile

from fastapi import HTTPException
from markdown_it import MarkdownIt

from .db import Attachment

MAX_EVIDENCE = 32 * 1024 * 1024


def selected_evidence(db, pid, ids, root):
    items, total = [], 0
    for aid in dict.fromkeys(ids):
        row = db.get(Attachment, aid)
        if row is None or row.project_id != pid:
            raise HTTPException(422, "Selected evidence must belong to this project")
        path = root / "attachments" / row.id
        total += row.size
        if total > MAX_EVIDENCE:
            raise HTTPException(413, "Report evidence exceeds 32 MiB")
        try:
            if path.is_symlink() or path.stat().st_size != row.size:
                raise OSError("Invalid evidence size")
            data = path.read_bytes()
        except OSError:
            raise HTTPException(409, "Selected evidence is unavailable") from None
        if hashlib.sha256(data).hexdigest() != row.sha256:
            raise HTTPException(409, "Selected evidence failed its integrity check")
        suffix = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/webp": ".webp",
            "application/pdf": ".pdf",
            "application/json": ".json",
            "application/xml": ".xml",
            "text/xml": ".xml",
            "text/plain": ".txt",
        }.get(row.media_type, ".bin")
        items.append(
            {
                "id": row.id,
                "filename": row.filename,
                "sha256": row.sha256,
                "media_type": row.media_type,
                "path": f"evidence/{row.id}{suffix}",
                "data": data,
            }
        )
    return items


def html_report(markdown, title, evidence):
    renderer = MarkdownIt("commonmark", {"html": False}).enable("table")

    def omit_image(tokens, index, options, env):
        return "<span>[External or unselected image omitted]</span>"

    renderer.renderer.rules["image"] = omit_image
    links = {item["path"]: "#evidence-" + item["id"] for item in evidence}

    def link_open(tokens, index, options, env):
        href = tokens[index].attrGet("href")
        if href in links:
            tokens[index].attrSet("href", links[href])
        tokens[index].attrSet("rel", "noreferrer noopener")
        return renderer.renderer.renderToken(tokens, index, options, env)

    renderer.renderer.rules["link_open"] = link_open
    rendered = renderer.render(markdown)
    if evidence:
        rendered += "<h2>Included evidence</h2>"
    for item in evidence:
        name = html.escape(item["filename"], quote=True)
        uri = (
            "data:"
            + item["media_type"]
            + ";base64,"
            + base64.b64encode(item["data"]).decode()
        )
        rendered += f'<section id="evidence-{item["id"]}"><h3>{name}</h3><p>SHA-256 <code>{item["sha256"]}</code></p>'
        rendered += f'<a href="{uri}" download="{name}">Save included file: {name}</a>'
        if item["media_type"] in {"image/png", "image/jpeg", "image/webp"}:
            rendered += f'<p><img src="{uri}" alt="{name}"></p>'
        rendered += "</section>"
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer"><title>{html.escape(title)}</title>
<style>body{{max-width:960px;margin:48px auto;padding:0 24px;font:16px/1.65 system-ui,sans-serif;color:#172033;background:#fff}}h1,h2,h3{{line-height:1.25;break-after:avoid}}h2{{margin-top:2.2em;border-bottom:1px solid #d8dce5;padding-bottom:.3em}}table{{border-collapse:collapse;width:100%;display:block;overflow:auto}}td,th{{border:1px solid #d8dce5;padding:8px;text-align:left}}pre{{padding:16px;background:#f1f3f7;white-space:pre-wrap}}code,a{{overflow-wrap:anywhere}}img{{max-width:100%;height:auto}}blockquote{{border-left:3px solid #8a78d6;padding-left:16px}}@media print{{body{{margin:0;max-width:none}}a{{color:inherit}}pre,section{{break-inside:avoid}}}}</style></head>
<body><main>{rendered}</main><footer><p>Prepared with Dragontrip · Review before sharing.</p></footer></body></html>"""


def write_deliverable(directory, report, title, format, evidence):
    markdown = report["markdown"]
    if format == "markdown":
        path = directory / "report.md"
        path.write_text(markdown, encoding="utf-8")
    elif format == "html":
        path = directory / "report.html"
        path.write_text(html_report(markdown, title, evidence), encoding="utf-8")
    else:
        path = directory / "report.zip"
        with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("report.md", markdown)
            archive.writestr("report.html", html_report(markdown, title, evidence))
            archive.writestr(
                "README.txt",
                "Open report.html in a browser. It is self-contained and printable.\n"
                "report.md is a Markdown copy. evidence/ contains only explicitly selected files.\n"
                "No vault entries, raw scan buffers, or editor drafts are included.\n",
            )
            for item in evidence:
                archive.writestr(item["path"], item["data"])
    return path
