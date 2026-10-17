"""A verified backport must not hide future advisories for vendored code."""

import copy
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/audit-rust.py"
spec = importlib.util.spec_from_file_location("dragontrip_security_audit", SCRIPT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def finding(identity="RUSTSEC-2024-0429", version="0.18.5"):
    return {
        "package": {"name": "glib", "version": version},
        "advisory": {"id": identity, "title": "Iterator safety advisory"},
    }


def run_report(monkeypatch, report, returncode=1):
    original_run = subprocess.run
    lock = audit.ROOT / "src-tauri/Cargo.lock"
    before = lock.read_bytes()

    def run(command, **kwargs):
        if command[0] != "cargo":
            return original_run(command, **kwargs)
        temporary = Path(command[command.index("--file") + 1])
        assert temporary != lock
        baseline = temporary.read_text()
        assert 'name = "glib"\nversion = "0.18.5"\nsource = "registry+' in baseline
        assert "233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5" in baseline
        return subprocess.CompletedProcess(command, returncode, json.dumps(report), "")

    monkeypatch.setattr(audit.subprocess, "run", run)
    monkeypatch.setattr(sys, "argv", [str(SCRIPT)])
    try:
        audit.main()
    finally:
        assert lock.read_bytes() == before


def base_report():
    return {
        "vulnerabilities": {"list": []},
        "warnings": {"unsound": [finding()]},
    }


def test_verified_backport_is_visible_and_does_not_change_lockfile(monkeypatch, capsys):
    run_report(monkeypatch, base_report())
    output = capsys.readouterr().out
    assert "VERIFIED BACKPORT" in output
    assert "RUSTSEC-2024-0429" in output


@pytest.mark.parametrize("kind", ["vulnerability", "new_unsoundness", "different_version"])
def test_new_advisories_for_vendored_code_fail_audit(monkeypatch, kind):
    report = copy.deepcopy(base_report())
    if kind == "vulnerability":
        report["vulnerabilities"]["list"].append(finding("RUSTSEC-2099-0001"))
    elif kind == "new_unsoundness":
        report["warnings"]["unsound"].append(finding("RUSTSEC-2099-0002"))
    else:
        report["warnings"]["unsound"] = [finding(version="0.18.4")]
    with pytest.raises(SystemExit) as failure:
        run_report(monkeypatch, report)
    assert failure.value.code == 1


def test_incomplete_auditor_run_is_not_success(monkeypatch):
    with pytest.raises(RuntimeError, match="could not complete"):
        run_report(monkeypatch, {}, returncode=2)
