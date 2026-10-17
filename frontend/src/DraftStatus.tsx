import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  putWorkspace,
  getWorkspace,
  workspaceDrafts,
  retryWorkspace,
  workspaceStatus,
} from './workspace';
export async function downloadText(value: unknown) {
  if ('__TAURI_INTERNALS__' in window) {
    try {
      return await invoke<string>('export_recovery', {
        draftId: crypto.randomUUID(),
        content: JSON.stringify(value, null, 2),
      });
    } catch (error) {
      if (!String(error).includes('export_recovery')) throw error;
    }
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'dragontrip-draft.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'Recovery download started';
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
  const [message, setMessage] = useState('');
  const download = (data: unknown) =>
    void downloadText(data)
      .then(setMessage)
      .catch((e) =>
        setMessage('Download failed: ' + String(e) + '. Your text is retained in the editor.'),
      );
  return (
    <div className="draft-status" role="status">
      <span>{workspaceStatus(pid, draftKey)}</span>
      {message && <span>{message}</span>}
      <button type="button" onClick={() => void retryWorkspace(pid, draftKey)}>
        Retry sync
      </button>
      <button type="button" onClick={() => download(value)}>
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
            <button type="button" onClick={() => download(row.data)}>
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
