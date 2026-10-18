"""Journey contracts, durable launch receipts and recoverable tool outcomes."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import io
import json
import sys
import time
import zipfile

from fastapi.testclient import TestClient

from dragontrip import recon
from dragontrip.app import create_app
from dragontrip.db import Node, Scan
from dragontrip.scan_results import save_outcome
from test_core import XML


def test_project_goal_journey_and_old_client_update(client):
    project = client.post('/projects', json={'name': 'Plan'}).json()
    base = '/projects/' + project['id']
    assert client.get(base + '/overview').json()['journey']['stage'] == 'goal'
    client.put(base, json={'name': 'Plan', 'goal': 'Check access boundaries'})
    client.put(base, json={'name': 'Renamed by an older client', 'description': 'Preserved context'})
    assert client.get(base).json()['project']['goal'] == 'Check access boundaries'
    assert client.get(base + '/overview').json()['journey']['stage'] == 'scope'
    client.put(base + '/scope', json={'rules': [{'value': '127.0.0.1', 'mode': 'include'}]})
    assert client.get(base + '/overview').json()['journey']['stage'] == 'collect'
    archive = client.post(base + '/archive', json={})
    restored = client.post('/imports', files={'file': ('plan.dtproj', archive.content)})
    assert restored.status_code == 201, restored.text
    assert restored.json()['goal'] == 'Check access boundaries'


def test_concurrent_and_restarted_launch_receipt(app, client, monkeypatch, tmp_path):
    calls = []
    async def discover(only=None):
        await asyncio.sleep(.03)  # Both HTTP requests reach discovery together without the lock.
        return [{'name': 'Nmap', 'installed': True, 'path': sys.executable}]
    monkeypatch.setattr(recon, 'discover', discover)
    monkeypatch.setattr(app.state.manager, 'enqueue', calls.append)
    pid = client.post('/projects', json={'name': 'Receipts'}).json()['id']
    path = f'/projects/{pid}/scans'
    body = {'target': '127.0.0.1', 'authorized': True, 'request_id': 'one-approved-plan'}
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: client.post(path, json=body), range(2)))
    assert all(r.status_code == 201 for r in results)
    sid = results[0].json()['id']
    assert results[1].json()['id'] == sid and calls == [sid]
    assert client.post(path, json={**body, 'target': '127.0.0.2'}).status_code == 409
    # Retry acknowledges the existing job even if scope changed; it authorizes no traffic.
    client.put(f'/projects/{pid}/scope', json={'rules': [{'value': '127.0.0.2', 'mode': 'include'}]})
    assert client.post(path, json=body).json()['id'] == sid
    restarted = create_app('a' * 64, tmp_path, dev=True)
    with TestClient(restarted, base_url='http://127.0.0.1', headers={'Authorization': 'Bearer ' + 'a' * 64}) as other:
        replay = other.post(path, json=body).json()
        assert replay['id'] == sid and replay['status'] == 'interrupted'
        assert other.get('/queue').json()['tasks'] == []
        assert len(other.get(f'/projects/{pid}/scan-history').json()['items']) == 1


def test_partial_nmap_preserves_prior_services_and_archive(app, client):
    pid = client.post('/projects', json={'name': 'Partial'}).json()['id']
    artifact = app.state.manager.artifacts / 'partial.xml'
    artifact.write_text(XML.split('<runstats>')[0])
    with app.state.sessions() as db:
        db.add(Scan(id='partial', project_id=pid, target='127.0.0.1', status='running'))
        db.add(Node(id='old-service', project_id=pid, kind='service', label='22/tcp', attrs=json.dumps({'host': '127.0.0.1', 'protocol': 'tcp', 'port': 22, 'state': 'open'})))
        db.commit()
    save_outcome(app.state.sessions, 'partial', artifact, 'cancelled', 'Cancelled by user')
    scan = client.get('/scans/partial').json()
    assert scan['status'] == 'cancelled'
    assert scan['options']['result']['objects'] == 2
    assert scan['options']['result']['partial'] is True
    graph = client.get(f'/projects/{pid}').json()
    assert next(n for n in graph['nodes'] if n['id'] == 'old-service')['attrs']['state'] == 'open'
    assert next(n for n in graph['nodes'] if n['kind'] == 'service' and n['id'] != 'old-service')['attrs']['partial'] is True
    assert client.get('/scans/partial/artifact').content == artifact.read_bytes()
    archive = client.post(f'/projects/{pid}/archive', json={})
    with zipfile.ZipFile(io.BytesIO(archive.content)) as bundle:
        assert json.loads(bundle.read('manifest.json'))['version'] == 6
        assert bundle.read('artifacts/partial.xml') == artifact.read_bytes()
    restored = client.post('/imports', files={'file': ('partial.dtproj', archive.content)})
    assert restored.status_code == 201, restored.text
    recovered = client.get('/projects/' + restored.json()['id']).json()
    scan = recovered['scans'][0]
    assert scan['status'] == 'cancelled'
    assert set(scan['options']['result']['node_ids']) <= {n['id'] for n in recovered['nodes']}
    assert client.get('/scans/' + scan['id'] + '/artifact').content == artifact.read_bytes()
    assert client.get('/queue').json()['tasks'] == []


def test_real_process_cancellation_and_partial_failure(app, client, monkeypatch):
    async def discover(only=None):
        return [{'name': 'Nmap', 'installed': True, 'path': sys.executable}]
    monkeypatch.setattr(recon, 'discover', discover)
    def arguments(path, profile, destination, artifact, words):
        code = "from pathlib import Path; import time; Path(" + repr(str(artifact)) + ").write_text(" + repr(XML.split('<runstats>')[0]) + "); print('saved first stage',flush=True); time.sleep(30)"
        return [sys.executable, '-c', code]
    monkeypatch.setattr(recon, 'arguments', arguments)
    pid = client.post('/projects', json={'name': 'Cancellation'}).json()['id']
    scan = client.post(f'/projects/{pid}/scans', json={'target': '127.0.0.1', 'authorized': True, 'request_id': 'cancel-test-plan'}).json()
    sid = scan['id']
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if 'saved first stage' in client.get('/scans/' + sid).json()['output']:
            break
        time.sleep(.02)
    else:
        raise AssertionError('Subprocess did not start')
    cancelled = client.post('/scans/' + sid + '/cancel').json()
    assert cancelled['cancelled'] is True
    assert cancelled['scan']['options']['result']['observations'] == 1
    assert not app.state.manager.processes and not app.state.manager.tasks
    assert client.post('/scans/' + sid + '/cancel').json()['scan']['status'] == 'cancelled'
    assert client.post('/scans/missing/cancel').status_code == 404
    # A later malformed result cannot roll back the previous saved stage.
    with app.state.sessions() as db:
        db.add(Scan(id='failure', project_id=pid, tool='httpx', target='http://127.0.0.1/', status='running'))
        db.commit()
    artifact = app.state.manager.artifacts / 'failure.json'
    artifact.write_text('{"url":"http://127.0.0.1/","status_code":200}\n{"url":')
    save_outcome(app.state.sessions, 'failure', artifact, 'failed', 'Tool exited with code 1')
    failed = client.get('/scans/failure').json()
    assert failed['status'] == 'failed' and failed['options']['result']['observations'] == 1
    assert any(n['kind'] == 'service' for n in client.get(f'/projects/{pid}').json()['nodes'])


def test_service_web_handoff_is_local_idempotent_and_project_scoped(app, client):
    pid = client.post('/projects', json={'name': 'Service context'}).json()['id']
    other = client.post('/projects', json={'name': 'Other'}).json()['id']
    with app.state.sessions() as db:
        db.add(Node(id='http-service', project_id=pid, kind='service', label='8080/tcp', attrs=json.dumps({'host': '127.0.0.1', 'port': 8080, 'name': 'http', 'state': 'open'})))
        db.commit()
    path = f'/projects/{pid}/nodes/http-service/web-context'
    result = client.post(path).json()
    assert result['application']['attrs']['origin'] == 'http://127.0.0.1:8080'
    assert client.post(path).json() == result
    assert client.post(f'/projects/{other}/nodes/http-service/web-context').status_code == 404
    graph = client.get(f'/projects/{pid}').json()
    assert len([n for n in graph['nodes'] if n['kind'] == 'application']) == 1
    assert any(e['source'] == 'http-service' and e['target'] == result['application']['id'] for e in graph['edges'])
    assert graph['scans'] == [] and client.get(f'/projects/{pid}/scope').json() == []
    with app.state.sessions() as db:
        node = db.get(Node, 'http-service')
        node.attrs = json.dumps({'host': 'invalid host', 'port': 8080, 'name': 'http'})
        db.commit()
    assert client.post(path).status_code == 422


def test_scan_plan_rejects_changed_scope_or_profile_before_launch(app, client, monkeypatch):
    launched = []
    monkeypatch.setattr(app.state.manager, 'enqueue', launched.append)
    async def discover(only=None):
        return [{'name': 'Nmap', 'installed': True, 'path': sys.executable}]
    monkeypatch.setattr(recon, 'discover', discover)
    pid = client.post('/projects', json={'name': 'Exact approval'}).json()['id']
    base = f'/projects/{pid}'
    body = {'target': '127.0.0.1', 'profile': 'quick'}
    plan = client.post(base + '/scan-plan', json=body).json()
    assert plan['parameters']['tool'] == 'nmap'
    assert not launched and client.get(base).json()['scans'] == []
    client.put(base + '/scope', json={'rules': [{'value': '127.0.0.1', 'mode': 'include'}]})
    approved = {**body, 'preview_token': plan['preview_token'], 'authorized': True, 'request_id': 'approved-plan'}
    assert client.post(base + '/scans', json=approved).status_code == 409
    assert not launched
    current = client.post(base + '/scan-plan', json=body).json()
    result = client.post(base + '/scans', json={**approved, 'preview_token': current['preview_token']})
    assert result.status_code == 201, result.text
    assert len(launched) == 1


def test_goal_conflict_retains_both_versions(client):
    pid = client.post('/projects', json={'name': 'Concurrent goal'}).json()['id']
    route = f'/projects/{pid}/goal'
    first = client.put(route, json={'goal': 'First review', 'expected_goal': ''})
    assert first.status_code == 200
    assert client.put(route, json={'goal': 'Second review', 'expected_goal': ''}).status_code == 409
    assert client.get(f'/projects/{pid}').json()['project']['goal'] == 'First review'
    assert client.put(route, json={'goal': 'First review', 'expected_goal': ''}).status_code == 200


def test_projection_failure_keeps_raw_evidence_available(app, client, monkeypatch):
    from dragontrip import tasks
    pid = client.post('/projects', json={'name': 'Projection failure'}).json()['id']
    with app.state.sessions() as db:
        db.add(Scan(id='projection-failed', project_id=pid, target='127.0.0.1', status='running'))
        db.commit()
    artifact = app.state.manager.artifacts / 'projection-failed.xml'
    artifact.write_text(XML)
    def reject(*args, **kwargs):
        raise ValueError('Injected projection failure')
    monkeypatch.setattr(tasks, 'save_outcome', reject)
    app.state.manager.finish('projection-failed', 'failed', 'Tool stopped', None)
    scan = client.get('/scans/projection-failed').json()
    assert scan['status'] == 'failed'
    assert scan['options']['stage'] == 'failed'
    assert scan['options']['result']['artifact_available'] is True
    assert 'Injected projection failure' in scan['options']['result']['projection_error']
    assert client.get('/scans/projection-failed/artifact').content == artifact.read_bytes()


def test_performance_profiles_remain_explicit_preferences(client):
    for profile in ('low', 'medium', 'high'):
        result = client.put('/settings/appearance', json={'performance_profile': profile, 'reduced_motion': True})
        assert result.status_code == 200
        saved = client.get('/settings').json()['appearance']
        assert saved['performance_profile'] == profile and saved['reduced_motion'] is True
    assert client.put('/settings/appearance', json={'performance_profile': 'unbounded'}).status_code == 422
