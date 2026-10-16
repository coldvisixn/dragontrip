"""Password-derived, authenticated encryption for local credential records."""

import base64
import json
import os
import threading
import time
from fastapi import HTTPException
from pydantic import BaseModel, Field, SecretStr, field_validator
from sqlalchemy import select
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from .db import Configuration, Credential, Node, uid, record

IDLE_SECONDS = 600


class PasswordInput(BaseModel):
    password: SecretStr = Field(min_length=12, max_length=1024)


class CredentialInput(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    username: str = Field(default="", max_length=500)
    secret: SecretStr | None = Field(default=None, max_length=8000)
    notes: str = Field(default="", max_length=4000)
    node_ids: list[str] = Field(default_factory=list, max_length=50)

    @field_validator("title")
    @classmethod
    def not_blank(cls, value):
        if not value.strip():
            raise ValueError("Title cannot be blank")
        return value.strip()


def encrypt(key, content, identity):
    nonce = os.urandom(12)
    encrypted = AESGCM(key).encrypt(
        nonce, json.dumps(content).encode(), identity.encode()
    )
    return base64.b64encode(nonce + encrypted).decode()


def decrypt(key, ciphertext, identity):
    data = base64.b64decode(ciphertext, validate=True)
    return json.loads(AESGCM(key).decrypt(data[:12], data[12:], identity.encode()))


class Vault:
    def __init__(self):
        self.key = None
        self.used = 0
        self.retry_after = 0
        self.lock = threading.RLock()

    def clear(self):
        with self.lock:
            self.key = None
            self.used = 0

    def require(self, touch=True):
        if time.monotonic() - self.used >= IDLE_SECONDS:
            self.clear()
        if self.key is None:
            raise HTTPException(423, "Vault is locked")
        if touch:
            self.used = time.monotonic()
        return self.key


def register_vault(app, sessions, project):
    vault = Vault()
    app.state.vault = vault

    def config(db):
        row = db.get(Configuration, "vault")
        return json.loads(row.value) if row else None

    @app.get("/vault")
    def status():
        with vault.lock, sessions() as db:
            try:
                vault.require(touch=False)
                unlocked = True
            except HTTPException:
                unlocked = False
            return {
                "initialized": config(db) is not None,
                "unlocked": unlocked,
                "idle_seconds": IDLE_SECONDS,
            }

    def derive(password, salt):
        return Scrypt(salt=salt, length=32, n=32768, r=8, p=1).derive(password.encode())

    @app.post("/vault/setup")
    def setup(body: PasswordInput):
        with vault.lock, sessions() as db:
            if config(db) is not None:
                raise HTTPException(
                    409, "Vault already exists; unlock it with its master password"
                )
            salt = os.urandom(16)
            key = derive(body.password.get_secret_value(), salt)
            settings = {
                "salt": base64.b64encode(salt).decode(),
                "check": encrypt(key, "dragontrip-vault-v1", "vault-verifier"),
            }
            db.add(Configuration(id="vault", value=json.dumps(settings)))
            db.commit()
            vault.key, vault.used = key, time.monotonic()
            return {"unlocked": True}

    @app.post("/vault/unlock")
    def unlock(body: PasswordInput):
        with vault.lock, sessions() as db:
            settings = config(db)
            if settings is None:
                raise HTTPException(409, "Create the vault first")
            if time.monotonic() < vault.retry_after:
                raise HTTPException(429, "Wait five seconds before retrying")
            key = derive(
                body.password.get_secret_value(), base64.b64decode(settings["salt"])
            )
            try:
                if (
                    decrypt(key, settings["check"], "vault-verifier")
                    != "dragontrip-vault-v1"
                ):
                    raise InvalidTag
            except (InvalidTag, ValueError):
                vault.clear()
                vault.retry_after = time.monotonic() + 5
                raise HTTPException(403, "Cannot unlock vault with this password")
            vault.key, vault.used = key, time.monotonic()
            return {"unlocked": True}

    @app.post("/vault/lock")
    def lock():
        vault.clear()
        return {"unlocked": False}

    def identity(row):
        return f"credential:{row.project_id}:{row.id}"

    def payload(row, key):
        try:
            return decrypt(key, row.ciphertext, identity(row))
        except (InvalidTag, ValueError, KeyError):
            raise HTTPException(409, "Credential integrity check failed")

    def metadata(row, key):
        return {
            "id": row.id,
            **{k: v for k, v in payload(row, key).items() if k != "secret"},
        }

    def get_row(db, pid, cid):
        row = db.get(Credential, cid)
        if row is None or row.project_id != pid:
            raise HTTPException(404, "Credential not found")
        return row

    def content(db, pid, body, previous=None):
        previous = previous or {}
        for nid in body.node_ids:
            node = db.get(Node, nid)
            if node is None and nid in previous.get("node_ids", []):
                continue
            if node is None or node.project_id != pid:
                raise HTTPException(422, "Linked objects must belong to this project")
        secret = (
            body.secret.get_secret_value()
            if body.secret is not None
            else previous.get("secret", "")
        )
        if not secret:
            raise HTTPException(422, "A secret is required")
        return {**body.model_dump(exclude={"secret"}), "secret": secret}

    @app.get("/projects/{pid}/credentials")
    def credentials(pid: str):
        with vault.lock, sessions() as db:
            key = vault.require(touch=False)
            project(db, pid)
            return [
                metadata(row, key)
                for row in db.scalars(
                    select(Credential).where(Credential.project_id == pid)
                )
            ]

    @app.post("/projects/{pid}/credentials", status_code=201)
    def add_credential(pid: str, body: CredentialInput):
        with vault.lock, sessions() as db:
            key = vault.require()
            project(db, pid)
            row = Credential(id=uid(), project_id=pid)
            row.ciphertext = encrypt(key, content(db, pid, body), identity(row))
            db.add(row)
            record(db, pid, "Credential added to vault")
            db.commit()
            return metadata(row, key)

    @app.get("/projects/{pid}/credentials/{cid}")
    def reveal(pid: str, cid: str):
        with vault.lock, sessions() as db:
            key = vault.require()
            row = get_row(db, pid, cid)
            return {"id": row.id, **payload(row, key)}

    @app.put("/projects/{pid}/credentials/{cid}")
    def update(pid: str, cid: str, body: CredentialInput):
        with vault.lock, sessions() as db:
            key = vault.require()
            row = get_row(db, pid, cid)
            row.ciphertext = encrypt(
                key, content(db, pid, body, payload(row, key)), identity(row)
            )
            record(db, pid, "Credential updated in vault")
            db.commit()
            return metadata(row, key)

    @app.delete("/projects/{pid}/credentials/{cid}")
    def delete(pid: str, cid: str):
        with vault.lock, sessions() as db:
            vault.require()
            row = get_row(db, pid, cid)
            db.delete(row)
            record(db, pid, "Credential deleted from vault")
            db.commit()
            return {"deleted": True}
