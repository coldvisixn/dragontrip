import { t as tr, useLocale, localeTag } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { Download, Image, Paperclip, Upload } from 'lucide-react';
import { api, fetchEvidence, uploadFile } from './api';

export type Attachment = {
  id: string;
  filename: string;
  media_type: string;
  size: number;
  sha256: string;
  created: string;
};
const accept =
  'image/png,image/jpeg,image/webp,application/pdf,text/plain,application/json,application/xml,text/xml';
const size = (value: number) =>
  value < 1024
    ? value + ' B'
    : value < 1048576
      ? (value / 1024).toFixed(1) + ' KiB'
      : (value / 1048576).toFixed(1) + ' MiB';

export function EvidencePreview({ pid, attachment }: { pid: string; attachment: Attachment }) {
  useLocale();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!attachment.media_type.startsWith('image/')) return;
    let disposed = false;
    let resource = '';
    fetchEvidence(pid, attachment.id)
      .then((blob) => {
        if (disposed) return;
        resource = URL.createObjectURL(blob);
        setUrl(resource);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
      if (resource) URL.revokeObjectURL(resource);
    };
  }, [pid, attachment.id, attachment.media_type]);
  return (
    <>
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
      {url && <img className="evidence-image" src={url} alt={attachment.filename} loading="lazy" />}
    </>
  );
}

export function AttachmentLinks({
  pid,
  ids,
  onChange,
  onBusyChange,
}: {
  pid: string;
  ids: string[];
  onChange: (ids: string[]) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  useLocale();
  const [items, setItems] = useState<Attachment[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const current = useRef({ ids, onChange, onBusyChange });
  current.current = { ids, onChange, onBusyChange };
  const alive = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let disposed = false;
    api<Attachment[]>(`/projects/${pid}/attachments`)
      .then((v) => {
        if (!disposed) setItems(v);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
    };
  }, [pid]);
  async function upload(file?: File) {
    if (!file || inFlight.current || !alive.current) return;
    if (current.current.ids.length >= 30) {
      setError(tr('A record supports up to 30 linked files'));
      return;
    }
    if (file.size > 10 * 1048576) {
      setError(tr('The maximum attachment size is 10 MiB'));
      return;
    }
    inFlight.current = true;
    setBusy(true);
    current.current.onBusyChange?.(true);
    setError('');
    try {
      const item = await uploadFile<Attachment>(`/projects/${pid}/attachments`, file);
      if (!alive.current) return;
      setItems((rows) => [item, ...rows]);
      const next = [...new Set([...current.current.ids, item.id])];
      current.current.ids = next;
      current.current.onChange(next);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      inFlight.current = false;
      if (alive.current) {
        setBusy(false);
        current.current.onBusyChange?.(false);
        if (input.current) input.current.value = '';
      }
    }
  }
  return (
    <fieldset
      className="reference-picker"
      tabIndex={0}
      aria-label={tr('Evidence upload: paste a screenshot or drop files')}
      onPaste={(event) => {
        const files = Array.from(event.clipboardData.files).filter((file) =>
          file.type.startsWith('image/'),
        );
        if (files.length) {
          event.preventDefault();
          void (async () => {
            for (const file of files) await upload(file);
          })();
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        void (async () => {
          for (const file of Array.from(event.dataTransfer.files)) await upload(file);
        })();
      }}
    >
      <legend>{tr('Evidence and screenshots')}</legend>
      <p className="muted">
        {tr(
          'PNG, JPEG, WebP, PDF or UTF-8 text/JSON/XML · 10 MiB per file. Files are retained in the project when you cancel editing. Paste a screenshot here or drop files to attach them.',
        )}
      </p>
      <label className="file-button">
        <Upload size={14} />
        {busy ? tr('Uploading…') : tr('Upload evidence')}
        <input
          ref={input}
          aria-label={tr('Upload evidence')}
          type="file"
          accept={accept}
          disabled={busy}
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
      <div className="reference-options">
        {items.map((item) => (
          <label className="check-row" key={item.id}>
            <input
              type="checkbox"
              checked={ids.includes(item.id)}
              onChange={(e) =>
                onChange(e.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))
              }
            />
            <span>
              {item.filename}
              <small>{size(item.size)}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function LinkedEvidence({ pid, ids }: { pid: string; ids: string[] }) {
  useLocale();
  const [items, setItems] = useState<Attachment[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    let disposed = false;
    api<Attachment[]>(`/projects/${pid}/attachments`)
      .then((v) => {
        if (!disposed) setItems(v);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
    };
  }, [pid, ids]);
  return (
    <section className="linked-evidence">
      <h3>{tr('Evidence and screenshots')}</h3>
      {notice && (
        <p role="status" className="success-message">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
      {!ids.length && <p className="muted">{tr('No attachments linked.')}</p>}
      {ids.map((id) => {
        const item = items.find((row) => row.id === id);
        return item ? (
          <div className="attachment-card" key={id}>
            <div className="section-actions">
              <span>
                <Paperclip size={14} /> {item.filename}
                <small>
                  {size(item.size)}
                  {tr(' · SHA-256 ')}
                  {item.sha256.slice(0, 12)}…
                </small>
              </span>
              <div className="step-actions">
                {item.media_type.startsWith('image/') && (
                  <button
                    aria-label={tr('Preview {0}', [item.filename])}
                    onClick={() => setPreview(preview === id ? undefined : id)}
                  >
                    <Image size={15} />
                  </button>
                )}
                <button
                  aria-label={tr('Save {0}', [item.filename])}
                  onClick={() =>
                    void api<{ path: string }>(`/projects/${pid}/attachments/${id}/export`, 'POST')
                      .then((value) => {
                        setError('');
                        setNotice(tr('Saved: ') + value.path);
                      })
                      .catch((e) => setError(e.message))
                  }
                >
                  <Download size={15} />
                </button>
              </div>
            </div>
            {preview === id && <EvidencePreview pid={pid} attachment={item} />}
          </div>
        ) : (
          <small key={id}>
            {tr('Missing attachment · ')}
            {id}
          </small>
        );
      })}
    </section>
  );
}

export default function Evidence({ pid, focusId }: { pid: string; focusId?: string }) {
  useLocale();
  const [items, setItems] = useState<Attachment[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string | undefined>(focusId);
  useEffect(() => {
    let disposed = false;
    api<Attachment[]>(`/projects/${pid}/attachments`)
      .then((rows) => {
        if (!disposed) setItems(rows);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
    };
  }, [pid, revision]);
  const entry = items.find((row) => row.id === selected);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>{tr('Evidence')}</h1>
          <p>{tr('Original attachments, screenshots and integrity digests.')}</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
      {notice && (
        <p role="status" className="success-message">
          {notice}
        </p>
      )}
      <AttachmentLinks
        key={revision}
        pid={pid}
        ids={[]}
        onChange={() => setRevision((v) => v + 1)}
      />
      <div className="knowledge-layout">
        <section className="panel knowledge-list">
          {items.map((item) => (
            <button
              className={'knowledge-card ' + (item.id === selected ? 'active' : '')}
              key={item.id}
              onClick={() => setSelected(item.id)}
            >
              <Paperclip size={17} />
              <strong>{item.filename}</strong>
              <small>
                {size(item.size)} · {new Date(item.created).toLocaleDateString(localeTag())}
              </small>
            </button>
          ))}
          {!items.length && <p className="knowledge-empty">{tr('No evidence uploaded yet.')}</p>}
        </section>
        <section className="panel knowledge-detail">
          {entry ? (
            <>
              <h2>{entry.filename}</h2>
              <p className="muted">
                {entry.media_type} · {size(entry.size)}
              </p>
              <code className="integrity-digest">
                {tr('SHA-256 ')}
                {entry.sha256}
              </code>
              <EvidencePreview pid={pid} attachment={entry} />
              <div className="dialog-actions">
                <button
                  onClick={() =>
                    void api<{ path: string }>(
                      `/projects/${pid}/attachments/${entry.id}/export`,
                      'POST',
                    )
                      .then((value) => {
                        setError('');
                        setNotice(tr('Saved: ') + value.path);
                      })
                      .catch((e) => setError(e.message))
                  }
                >
                  <Download size={14} />
                  {tr('Save original')}
                </button>
                <button
                  className="danger-button"
                  onClick={() => {
                    if (
                      !window.confirm(
                        tr('Delete this evidence file? Linked files must be unlinked first.'),
                      )
                    )
                      return;
                    void api(`/projects/${pid}/attachments/${entry.id}`, 'DELETE')
                      .then(() => {
                        setSelected(undefined);
                        setRevision((v) => v + 1);
                      })
                      .catch((e) => setError(e.message));
                  }}
                >
                  {tr('Delete evidence')}
                </button>
              </div>
            </>
          ) : (
            <p className="knowledge-empty">{tr('Select evidence to inspect it.')}</p>
          )}
        </section>
      </div>
    </div>
  );
}
