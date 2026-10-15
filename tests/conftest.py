import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from dragontrip.app import create_app

TOKEN = "a" * 64

@pytest.fixture
def app(tmp_path):
    return create_app(TOKEN, tmp_path, dev=True)

@pytest.fixture
def client(app):
    with TestClient(app, base_url="http://127.0.0.1", headers={"Authorization": "Bearer " + TOKEN}) as c:
        yield c
