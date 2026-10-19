import { t as tr, useLocale } from './i18n';
import { useState } from 'react';
import { type Scan } from './api';
import { SourceActions } from './SourceActions';

export function BackgroundWork({
  pid,
  scans,
  scan,
  expanded,
  onExpand,
  onSelect,
  onCancel,
  onRetry,
  onResult,
  onExport,
}: {
  pid: string;
  scans: Scan[];
  scan: Scan | null;
  expanded: boolean;
  onExpand: (value: boolean) => void;
  onSelect: (id: string) => void;
  onCancel: (id: string) => Promise<void>;
  onRetry: (scan: Scan) => void;
  onResult: (scan: Scan) => Promise<void>;
  onExport: (scan: Scan) => Promise<void>;
}) {
  useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = scans.filter((s) => ['queued', 'running'].includes(s.status)).length;
  const result = scan?.options?.result;
  const hasObjects = !result || (result.objects ?? 0) > 0;
  const active = !!scan && ['queued', 'running'].includes(scan.status);
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={'background-work' + (expanded ? ' expanded' : '')}
      aria-label={tr('Background work')}
    >
      <button
        className="work-summary"
        aria-expanded={expanded}
        aria-controls="work-result"
        onClick={() => onExpand(!expanded)}
      >
        <strong>{tr('Background work')}</strong>
        <span>
          {running
            ? tr('{0} queued / running · You can keep working', [running])
            : scan
              ? `${scan.tool || 'nmap'} · ${tr(scan.status)}`
              : tr('No active jobs')}
        </span>
        <span>{expanded ? tr('Hide results') : tr('View results')}</span>
      </button>
      {expanded && (
        <div id="work-result" className="work-result">
          <label>
            {tr('Selected job')}
            <select
              value={scan?.id || ''}
              onChange={(e) => {
                setError('');
                onSelect(e.target.value);
              }}
            >
              {!scan && <option value="">{tr('Choose a job…')}</option>}
              {scans.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.tool || tr('nmap')} · {s.target} · {tr(s.status)}
                </option>
              ))}
              {scan && !scans.some((s) => s.id === scan.id) && (
                <option value={scan.id}>
                  {scan.target} · {tr(scan.status)}
                </option>
              )}
            </select>
          </label>
          {scan && (
            <>
              <div className="terminal-heading">
                <strong>{scan.target}</strong>
                <span className="badge">{tr(scan.status)}</span>
              </div>
              <p role="status">
                {active
                  ? scan.status === 'queued'
                    ? tr('Waiting for a queue slot. Other work remains available.')
                    : scan.options?.stage === 'saving'
                      ? tr('Saving observations and evidence…')
                      : tr('Tool is running. Results appear after they have been saved.')
                  : `${tr(result?.partial ? 'Partial result retained.' : scan.status === 'completed' ? 'Results saved.' : 'Execution stopped.')} ${result?.objects === undefined ? '' : tr('{0} objects · {1} observations.', [result.objects, result.observations || 0])}`}
              </p>
              {scan.error && <p className="form-error">{tr(scan.error)}</p>}
              {!active && !hasObjects && (
                <p>
                  {tr(
                    'No objects were saved from this attempt. Inspect the available evidence or review a new attempt.',
                  )}
                </p>
              )}
              {result?.projection_error && (
                <p>
                  {tr('Some output could not be interpreted. The original file is available:')}{' '}
                  {result.projection_error}
                </p>
              )}
              <div className="section-actions">
                {active ? (
                  <button disabled={busy} onClick={() => void perform(() => onCancel(scan.id))}>
                    {tr('Stop scan')}
                  </button>
                ) : (
                  <>
                    <button
                      className="primary"
                      disabled={busy || !hasObjects}
                      onClick={() => void perform(() => onResult(scan))}
                    >
                      {tr('Open saved results')}
                    </button>
                    <button onClick={() => onRetry(scan)}>{tr('Review new attempt')}</button>
                    {(result?.artifact_available || scan.status === 'completed') && (
                      <button disabled={busy} onClick={() => void perform(() => onExport(scan))}>
                        {tr('Export scan evidence')}
                      </button>
                    )}
                  </>
                )}
              </div>
              {!active && <SourceActions key={scan.id} pid={pid} source="scan" id={scan.id} />}
              <details className="work-technical">
                <summary>{tr('Technical output and exact command')}</summary>
                <pre className="terminal">
                  {scan.command.join(' ')}
                  {'\n\n'}
                  {scan.output ||
                    (active
                      ? tr('Waiting for tool output…')
                      : tr('No console output was produced.'))}
                </pre>
              </details>
            </>
          )}
          {error && (
            <p role="alert" className="form-error">
              {tr(error)} <button onClick={() => setError('')}>{tr('Dismiss')}</button>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
