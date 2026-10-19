import { t as tr, useLocale } from './i18n';
import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { api, uploadFile, type Project } from './api';

export default function ProjectTransfer({
  project,
  onImported,
}: {
  project?: Project;
  onImported: (project: Project) => Promise<void>;
}) {
  useLocale();
  const [include, setInclude] = useState(false);
  const [password, setPassword] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  return (
    <section className="panel project-transfer">
      <h2>{tr('Project portability')}</h2>
      <p className="muted">
        {tr(
          'A .dtproj archive contains the graph, notes, findings, paths, tasks, Timeline, scan history and original evidence, including recoverable research drafts. Import creates a separate project.',
        )}
      </p>
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
      {message && (
        <p role="status" className="success-message">
          {message}
        </p>
      )}
      <div className="recon-grid">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!project) return;
            setBusy(true);
            setError('');
            setMessage('');
            try {
              const value = await api<{ path: string; sha256: string }>(
                `/projects/${project.id}/export`,
                'POST',
                { include_credentials: include, ...(include ? { password } : {}) },
              );
              setPassword('');
              setMessage(tr('Saved: ') + value.path + tr(' · SHA-256 ') + value.sha256);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>
            {tr('Export ')}
            {project?.name || tr('selected project')}
          </h3>
          <p className="muted">
            {project
              ? tr('Finish or cancel active scans first. Credentials are excluded by default.')
              : tr('Open a project to export it.')}
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={include}
              onChange={(e) => setInclude(e.target.checked)}
              disabled={!project}
            />
            {tr('Include encrypted credentials')}
          </label>
          {include && (
            <label>
              {tr('Archive encryption password')}
              <input
                type="password"
                required
                minLength={12}
                maxLength={1024}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <small>
                {tr(
                  'Unlock the local vault first. Choose an archive password of at least 12 characters.',
                )}
              </small>
            </label>
          )}
          <button disabled={!project || busy}>
            <Download size={15} />
            {tr('Export project')}
          </button>
        </form>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!file) return;
            setBusy(true);
            setError('');
            setMessage('');
            try {
              const value = await uploadFile<Project>(
                '/imports',
                file,
                importPassword ? { password: importPassword } : {},
              );
              setImportPassword('');
              setFile(undefined);
              await onImported(value);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>{tr('Import as a new project')}</h3>
          <label>
            {tr('Project archive')}
            <input
              type="file"
              required
              accept=".dtproj,.zip,application/zip"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected && selected.size > 128 * 1048576) {
                  setError(tr('Maximum archive size: 128 MiB'));
                  e.target.value = '';
                  setFile(undefined);
                } else setFile(selected);
              }}
            />
          </label>
          <label>
            {tr('Archive password (if credentials were included)')}
            <input
              type="password"
              maxLength={1024}
              value={importPassword}
              onChange={(e) => setImportPassword(e.target.value)}
              autoComplete="off"
            />
          </label>
          <p className="muted">
            {tr(
              'Importing credentials requires an unlocked local vault. Historical scans never resume automatically.',
            )}
          </p>
          <button disabled={!file || busy}>
            <Upload size={15} />
            {tr('Import project')}
          </button>
        </form>
      </div>
    </section>
  );
}
