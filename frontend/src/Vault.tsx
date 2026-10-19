import { t as tr, useLocale } from './i18n';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, LockKeyhole, Plus } from 'lucide-react';
import { api, type Detail } from './api';
import { ObjectLinks } from './Knowledge';

type Credential = {
  id: string;
  title: string;
  username: string;
  notes: string;
  node_ids: string[];
};
type VaultStatus = { initialized: boolean; unlocked: boolean; idle_seconds: number };

function CredentialEditor({
  detail,
  entry,
  onSave,
  onCancel,
}: {
  detail: Detail;
  entry?: Credential;
  onSave: (value: Omit<Credential, 'id'> & { secret?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  useLocale();
  const [title, setTitle] = useState(entry?.title || '');
  const [username, setUsername] = useState(entry?.username || '');
  const [secret, setSecret] = useState('');
  const [notes, setNotes] = useState(entry?.notes || '');
  const [ids, setIds] = useState(entry?.node_ids || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave({
        title: title.trim(),
        username,
        notes,
        node_ids: ids,
        ...(secret ? { secret } : {}),
      });
      setSecret('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="knowledge-editor" onSubmit={submit}>
      <h2>{entry ? tr('Edit credential') : tr('New credential')}</h2>
      <label>
        {tr('Credential title')}
        <input
          autoFocus
          required
          maxLength={160}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoComplete="off"
        />
      </label>
      <label>
        {tr('Username')}
        <input
          value={username}
          maxLength={500}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
        />
      </label>
      <label>
        {entry ? tr('Replacement secret') : tr('Secret')}
        <input
          type="password"
          required={!entry}
          maxLength={8000}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoComplete="new-password"
          placeholder={
            entry ? tr('Leave empty to keep the stored secret') : tr('Password, token or key')
          }
        />
      </label>
      <label>
        {tr('Private notes')}
        <textarea
          aria-label={tr('Private notes')}
          maxLength={4000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <ObjectLinks detail={detail} ids={ids} onChange={setIds} />
      {error && (
        <p className="form-error" role="alert">
          {tr(error)}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" onClick={onCancel} disabled={busy}>
          {tr('Cancel')}
        </button>
        <button className="primary" disabled={busy || !title.trim()}>
          {busy ? tr('Saving…') : tr('Save credential')}
        </button>
      </div>
    </form>
  );
}

export default function Vault({
  detail,
  onNode,
}: {
  detail: Detail;
  onNode: (id: string) => void;
}) {
  useLocale();
  const pid = detail.project.id;
  const [status, setStatus] = useState<VaultStatus>();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [items, setItems] = useState<Credential[]>([]);
  const [selected, setSelected] = useState<Credential>();
  const [editing, setEditing] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const [revealed, setRevealed] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const version = useRef(0);
  function clear(clearPassword = true) {
    version.current++;
    setItems([]);
    setSelected(undefined);
    setEditing(false);
    setRevealed('');
    if (clearPassword) {
      setPassword('');
      setConfirmation('');
    }
  }
  useEffect(() => {
    const onLock = () => {
      clear();
      setStatus((current) => (current ? { ...current, unlocked: false } : current));
    };
    window.addEventListener('dragontrip:vault-locked', onLock);
    return () => window.removeEventListener('dragontrip:vault-locked', onLock);
  }, []);
  useEffect(() => {
    let disposed = false;
    async function check() {
      try {
        const current = await api<VaultStatus>('/vault');
        if (disposed) return;
        setStatus(current);
        if (!current.unlocked) clear(false);
      } catch (e) {
        if (!disposed) {
          clear();
          setStatus(undefined);
          setError((e as Error).message);
        }
      }
    }
    void check();
    const timer = setInterval(() => void check(), 5000);
    return () => {
      disposed = true;
      version.current++;
      clearInterval(timer);
    };
  }, [pid]);
  useEffect(() => {
    if (!status?.unlocked) return;
    let disposed = false;
    const expected = version.current;
    api<Credential[]>(`/projects/${pid}/credentials`)
      .then((rows) => {
        if (!disposed && expected === version.current) setItems(rows);
      })
      .catch((e) => {
        if (!disposed) {
          clear();
          setStatus((s) => (s ? { ...s, unlocked: false } : s));
          setError(e.message);
        }
      });
    return () => {
      disposed = true;
    };
  }, [pid, status?.unlocked]);
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(''), 30000);
    return () => clearTimeout(timer);
  }, [revealed]);
  async function unlock(e: FormEvent) {
    e.preventDefault();
    if (!status) return;
    if (!status.initialized && password !== confirmation) {
      setError(tr('Passwords do not match'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(status.initialized ? '/vault/unlock' : '/vault/setup', 'POST', { password });
      setPassword('');
      setConfirmation('');
      setStatus({ initialized: true, unlocked: true, idle_seconds: 600 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function lock() {
    clear();
    setBusy(true);
    setError('');
    try {
      await api('/vault/lock', 'POST');
      setStatus((s) => (s ? { ...s, unlocked: false } : s));
    } catch (e) {
      setError(tr('Lock could not be confirmed: ') + (e as Error).message);
      setStatus(undefined);
    } finally {
      setBusy(false);
    }
  }
  async function reveal() {
    if (revealed) {
      setRevealed('');
      return;
    }
    if (!selected) return;
    const expected = version.current;
    setBusy(true);
    try {
      const value = await api<Credential & { secret: string }>(
        `/projects/${pid}/credentials/${selected.id}`,
      );
      if (expected === version.current) setRevealed(value.secret);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!selected || !window.confirm(tr('Delete this encrypted credential?'))) return;
    setBusy(true);
    try {
      await api(`/projects/${pid}/credentials/${selected.id}`, 'DELETE');
      setItems((rows) => rows.filter((r) => r.id !== selected.id));
      setSelected(undefined);
      setRevealed('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page knowledge-page">
      <div className="page-heading">
        <div>
          <h1>{tr('Credentials Vault')}</h1>
          <p>{tr("Encrypted storage for this project's sensitive values.")}</p>
        </div>
        {status?.unlocked && (
          <button onClick={() => void lock()} disabled={busy}>
            <LockKeyhole size={15} />
            {tr('Lock vault')}
          </button>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {tr(error)}
        </p>
      )}
      {!status ? (
        <p>{tr('Checking vault…')}</p>
      ) : !status.unlocked ? (
        <section className="panel vault-unlock">
          <div className="empty-icon">
            <LockKeyhole size={28} />
          </div>
          <h2>{status.initialized ? tr('Vault locked') : tr('Create your encrypted vault')}</h2>
          <p>
            {status.initialized
              ? tr('Unlock with your master password to access credentials.')
              : tr(
                  'Choose a master password of at least 12 characters. Keep it safe: it cannot be recovered.',
                )}
          </p>
          <form onSubmit={unlock}>
            <label>
              {tr('Master password')}
              <input
                autoFocus
                type="password"
                minLength={12}
                maxLength={1024}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={status.initialized ? 'current-password' : 'new-password'}
              />
            </label>
            {!status.initialized && (
              <label>
                {tr('Confirm master password')}
                <input
                  type="password"
                  minLength={12}
                  maxLength={1024}
                  required
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
            )}
            <button className="primary" disabled={busy}>
              {busy
                ? tr('Unlocking…')
                : status.initialized
                  ? tr('Unlock vault')
                  : tr('Create vault')}
            </button>
          </form>
        </section>
      ) : (
        <>
          <p className="muted vault-hint">
            {tr(
              'AES-256-GCM · Locks after 10 minutes without credential changes or reveals, and on application exit. Revealed secrets hide after 30 seconds.',
            )}
          </p>
          <div className="knowledge-layout">
            <section className="panel knowledge-list">
              <div className="knowledge-filters">
                <input
                  aria-label={tr('Search credentials')}
                  placeholder={tr('Search credentials…')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  className="primary"
                  onClick={() => {
                    if (editing && !window.confirm(tr('Discard unsaved credential changes?')))
                      return;
                    version.current++;
                    setEditorVersion((v) => v + 1);
                    setSelected(undefined);
                    setRevealed('');
                    setEditing(true);
                  }}
                >
                  <Plus size={14} />
                  {tr('New credential')}
                </button>
              </div>
              {items
                .filter((r) =>
                  (r.title + ' ' + r.username).toLowerCase().includes(query.toLowerCase()),
                )
                .map((entry) => (
                  <button
                    className={'knowledge-card ' + (entry.id === selected?.id ? 'active' : '')}
                    key={entry.id}
                    onClick={() => {
                      version.current++;
                      setSelected(entry);
                      setEditing(false);
                      setRevealed('');
                    }}
                  >
                    <KeyRound size={17} />
                    <strong>{entry.title}</strong>
                    <small>
                      {entry.username || tr('No username')} · {entry.node_ids.length}
                      {tr(' linked objects')}
                    </small>
                  </button>
                ))}
              {!items.length && (
                <div className="knowledge-empty">
                  <KeyRound size={28} />
                  <h2>{tr('No credentials yet')}</h2>
                  <p>{tr('Add a password, token or key. Titles and notes are encrypted too.')}</p>
                </div>
              )}
            </section>
            <section className="panel knowledge-detail">
              {editing ? (
                <CredentialEditor
                  key={selected?.id || 'new-' + editorVersion}
                  entry={selected}
                  detail={detail}
                  onCancel={() => setEditing(false)}
                  onSave={async (value) => {
                    const expected = version.current;
                    const row = await api<Credential>(
                      `/projects/${pid}/credentials` + (selected ? '/' + selected.id : ''),
                      selected ? 'PUT' : 'POST',
                      value,
                    );
                    if (expected !== version.current) return;
                    setItems((rows) => [...rows.filter((r) => r.id !== row.id), row]);
                    setSelected(row);
                    setEditing(false);
                    setRevealed('');
                  }}
                />
              ) : selected ? (
                <article className="knowledge-article">
                  <div className="section-actions">
                    <span className="badge success">{tr('Encrypted')}</span>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setRevealed('');
                        setEditing(true);
                      }}
                    >
                      {tr('Edit credential')}
                    </button>
                  </div>
                  <h2>{selected.title}</h2>
                  <h3>{tr('Username')}</h3>
                  <p className="prose">{selected.username || '—'}</p>
                  <h3>{tr('Secret')}</h3>
                  <div className="secret-box">
                    <code>{revealed || '••••••••••••'}</code>
                    <button
                      aria-label={revealed ? tr('Hide secret') : tr('Reveal secret')}
                      disabled={busy}
                      onClick={() => void reveal()}
                    >
                      {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <h3>{tr('Private notes')}</h3>
                  <p className="prose">{selected.notes || tr('No notes.')}</p>
                  <h3>{tr('Linked objects')}</h3>
                  <div className="linked-items">
                    {selected.node_ids.map((id) =>
                      detail.nodes.some((n) => n.id === id) ? (
                        <button key={id} onClick={() => onNode(id)}>
                          {detail.nodes.find((n) => n.id === id)?.label}
                        </button>
                      ) : (
                        <small key={id}>
                          {tr('Deleted object · ')}
                          {id}
                        </small>
                      ),
                    )}
                  </div>
                  <div className="dialog-actions">
                    <button className="danger-button" disabled={busy} onClick={() => void remove()}>
                      {tr('Delete credential')}
                    </button>
                  </div>
                </article>
              ) : (
                <div className="knowledge-empty">
                  <KeyRound size={32} />
                  <h2>{tr('Select a credential')}</h2>
                  <p>{tr('Secrets stay hidden until you reveal them.')}</p>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
