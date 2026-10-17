"""Regression tests for the API's request and secret boundaries."""

import pytest


@pytest.mark.parametrize("length", [None, "1"])
def test_actual_json_body_limit(client, length):
    def chunks():
        yield b'{"name":"Must not be created"}'
        yield b" " * (256 * 1024)

    headers = {"Content-Type": "application/json", "Origin": "http://localhost:1420"}
    if length is not None:
        headers["Content-Length"] = length
    response = client.post("/projects", content=chunks(), headers=headers)
    assert response.status_code == 413
    assert response.headers["Access-Control-Allow-Origin"] == "http://localhost:1420"
    assert response.headers["Cache-Control"] == "no-store"
    assert client.get("/projects").json() == []


def test_small_chunked_json_still_works(client):
    response = client.post(
        "/projects",
        content=iter([b'{"name":', b'"Chunked project"}']),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 201
    assert response.json()["name"] == "Chunked project"


def test_actual_multipart_body_limit(client):
    pid = client.post("/projects", json={"name": "Evidence"}).json()["id"]

    def chunks():
        yield (
            b'--boundary\r\nContent-Disposition: form-data; name="file"; '
            b'filename="large.txt"\r\nContent-Type: text/plain\r\n\r\n'
        )
        for _ in range(12):
            yield b"x" * (1024 * 1024)
        yield b"\r\n--boundary--\r\n"

    response = client.post(
        f"/projects/{pid}/attachments",
        content=chunks(),
        headers={
            "Content-Type": "multipart/form-data; boundary=boundary",
            "Content-Length": "1",
        },
    )
    assert response.status_code == 413
    assert client.get(f"/projects/{pid}/attachments").json() == []


@pytest.mark.parametrize("path", ["/vault/setup", "/vault/unlock", "/projects/x/archive"])
@pytest.mark.parametrize("password", ["private", "private" * 200, {"private": "value"}])
def test_invalid_password_not_reflected(client, path, password):
    response = client.post(path, json={"password": password})
    assert response.status_code == 422
    assert "private" not in response.text
    for error in response.json()["detail"]:
        assert set(error) == {"type", "loc", "msg"}


def test_invalid_credential_not_reflected(client):
    response = client.post(
        "/projects/x/credentials",
        json={"title": "Credential", "secret": {"private": "credential"}},
    )
    assert response.status_code == 422
    assert "private" not in response.text


def test_malformed_json_not_reflected(client):
    response = client.post(
        "/vault/setup",
        content=b'{"password":"private malformed document"',
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert "private" not in response.text


@pytest.mark.parametrize("host", ["127.0.0.1:80/evil", "127.0.0.1:garbage", "evil.example"])
def test_invalid_loopback_host_rejected(client, host):
    assert client.get("/health", headers={"Host": host}).status_code == 403


@pytest.mark.parametrize("length", ["-1", "garbage", "9" * 5000])
def test_invalid_or_oversized_content_length(client, length):
    response = client.post("/projects", content=b"{}", headers={"Content-Length": length})
    assert response.status_code == (413 if length.isdecimal() else 400)


def test_non_ascii_authorization_rejected(client):
    response = client.get("/health", headers={"Authorization": b"Bearer \xff"})
    assert response.status_code == 401
