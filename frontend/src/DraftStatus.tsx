import {
  putWorkspace,
  getWorkspace,
  workspaceDrafts,
  retryWorkspace,
  workspaceStatus,
} from './workspace';
export function downloadText(value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'dragontrip-draft.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function DraftStatus({
  pid,
  draftKey,
  value,
  onRestore,
}: {
  pid: string;
  draftKey: string;
  value: unknown;
  onRestore?: (value: unknown) => void;
}) {
  return (
    <div className="draft-status" role="status">
      <span>{workspaceStatus(pid, draftKey)}</span>
      <button type="button" onClick={() => void retryWorkspace(pid, draftKey)}>
        Retry sync
      </button>
      <button type="button" onClick={() => downloadText(value)}>
        Download draft
      </button>
      <details>
        <summary>Recover earlier text</summary>
        {workspaceDrafts(pid).map((row) => (
          <div key={row.key}>
            <span>
              {(row.data as { title?: string }).title || 'Untitled'} ·{' '}
              {row.closed ? 'saved / closed' : 'draft'}
            </span>
            {onRestore && (
              <button type="button" onClick={() => onRestore(row.data)}>
                Use text in current editor
              </button>
            )}
            <button type="button" onClick={() => downloadText(row.data)}>
              Download retained text
            </button>
          </div>
        ))}
      </details>
    </div>
  );
}
export function closeDraft(pid: string, key: string) {
  putWorkspace(pid, key, getWorkspace(pid, key, null), true);
}
