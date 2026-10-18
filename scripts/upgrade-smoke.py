"""Upgrade an isolated project using the actual previous and current frozen backends.

Pass an extracted published backend as baseline. Never opens the user's data directory.
"""
import argparse
import io
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
import urllib.request
import zipfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('baseline', type=Path)
    parser.add_argument('current', type=Path, nargs='?', default=Path('src-tauri/resources/backend/dragontrip-backend'))
    parser.add_argument('--baseline-version', default='previous release')
    args = parser.parse_args()
    token = secrets.token_hex(32)
    vault_password = secrets.token_urlsafe(24)
    credential_secret = secrets.token_urlsafe(24)
    with tempfile.TemporaryDirectory(prefix='dragontrip-upgrade-') as storage:
        def launch(binary):
            proc = subprocess.Popen([str(binary.resolve())], env={**os.environ, 'XDG_DATA_HOME': storage, 'DRAGONTRIP_TOKEN': token, 'XDG_DOWNLOAD_DIR': storage}, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            line = proc.stdout.readline()
            if not line.startswith('DRAGONTRIP_READY '):
                raise RuntimeError(proc.stderr.read())
            origin = 'http://127.0.0.1:' + line.split()[1]
            def request(path, method='GET', body=None, raw=False, content_type='application/json'):
                data = body if isinstance(body, bytes) else json.dumps(body).encode() if body is not None else None
                req = urllib.request.Request(origin + path, data=data, method=method, headers={'Authorization': 'Bearer ' + token, 'Content-Type': content_type})
                with urllib.request.urlopen(req, timeout=20) as response:
                    return response.read() if raw else json.load(response)
            for _ in range(100):
                try:
                    request('/health')
                    return proc, request
                except OSError:
                    time.sleep(.05)
            proc.terminate()
            raise RuntimeError('Backend not ready')
        proc, request = launch(args.baseline)
        try:
            pid = request('/projects', 'POST', {'name': 'Published release upgrade fixture'})['id']
            base = f'/projects/{pid}'
            node = request(base + '/nodes', 'POST', {'label': 'Saved hypothesis', 'description': 'Preserve object context'})
            finding = request(base + '/knowledge', 'POST', {'kind': 'finding', 'title': 'Manual finding', 'content': {'body': 'Original reasoning', 'node_ids': [node['id']]}})
            finding = request(base + '/knowledge/' + finding['id'] + '/retests', 'POST', {'result': 'inconclusive', 'note': 'Check failed; preserve this attempt', 'expected_updated': finding['updated']})
            draft = {'title': 'Unfinished finding', 'expectedUpdated': finding['updated'], 'content': {**finding['content'], 'body': 'Do not lose my 0.8 text'}}
            legacy = {'revision': '1780000000000-' + 'a' * 32, 'value': draft}
            request(base + '/drafts/finding:' + finding['id'], 'PUT', legacy)
            boundary = 'dragontrip-upgrade-fixture'
            data = f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="proof.txt"\r\nContent-Type: text/plain\r\n\r\noriginal evidence\r\n--{boundary}--\r\n'.encode()
            evidence = request(base + '/attachments', 'POST', data, content_type='multipart/form-data; boundary=' + boundary)
            request('/vault/setup', 'POST', {'password': vault_password})
            credential = request(base + '/credentials', 'POST', {'title': 'Upgrade credential', 'username': 'fixture-user', 'secret': credential_secret, 'node_ids': [node['id']]})
            baseline_archive = request(base + '/archive', 'POST', {}, raw=True)
        finally:
            proc.terminate()
            proc.wait(timeout=15)
        proc, request = launch(args.current)
        try:
            assert request(base)['project']['goal'] == ''
            request(base + '/goal', 'PUT', {'goal': 'Continue the existing investigation', 'expected_goal': ''})
            assert request('/vault')['unlocked'] is False
            request('/vault/unlock', 'POST', {'password': vault_password})
            restored_credential = request(base + '/credentials/' + credential['id'])
            assert restored_credential['secret'] == credential_secret
            assert restored_credential['node_ids'] == [node['id']]
            assert request(base + '/knowledge/' + finding['id']) == finding
            assert request(base + '/attachments/' + evidence['id'] + '/content', raw=True) == b'original evidence'
            assert request(base)['nodes'][0]['id'] == node['id']
            cells = request(base + '/workspace')
            key = 'draft:legacy-finding-' + finding['id']
            assert cells[key]['value']['data']['content']['body'] == draft['content']['body']
            assert cells['knowledge:finding']['value']['data']['draft_id'] == key[6:]
            assert request(base + '/drafts/finding:' + finding['id']) == legacy
            boundary = 'dragontrip-old-archive'
            old_file = f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="previous.dtproj"\r\nContent-Type: application/zip\r\n\r\n'.encode() + baseline_archive + f'\r\n--{boundary}--\r\n'.encode()
            old_copy = request('/imports', 'POST', old_file, content_type='multipart/form-data; boundary=' + boundary)
            assert old_copy['goal'] == ''
            old_findings = request('/projects/' + old_copy['id'] + '/knowledge?kind=finding')
            assert old_findings[0]['content']['retests'] == finding['content']['retests']
            exported = request(base + '/export', 'POST', {})
            archive = Path(exported['path']).read_bytes()
            Path(exported['path']).unlink()
            manifest = json.loads(zipfile.ZipFile(io.BytesIO(archive)).read('manifest.json'))
            assert manifest['version'] == 6 and key in manifest['workspace']
            print(f'PASS: {args.baseline_version} → current frozen backend: records, retests, evidence, objects, encrypted vault, draft migration and v6 archive')
        finally:
            proc.terminate()
            proc.wait(timeout=15)


if __name__ == '__main__':
    main()
