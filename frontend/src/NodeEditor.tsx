import { t as tr, useLocale } from './i18n';
import { useState, type FormEvent } from 'react';
import type { ObjectNode } from './api';
import { useProjectState, putWorkspace } from './workspace';
import { DraftStatus } from './DraftStatus';

export type NodeContent = {
  label: string;
  category: string;
  description: string;
  status: string;
  tags: string[];
};
export const categories = ['note', 'asset', 'hypothesis', 'task', 'reference'];
export const statuses = ['idea', 'investigating', 'confirmed', 'dismissed', 'done'];

export function PositionEditor({
  node,
  onSave,
}: {
  node: ObjectNode;
  onSave: (x: number, y: number) => Promise<void>;
}) {
  useLocale();
  const [x, setX] = useState(String(Math.round(node.x)));
  const [y, setY] = useState(String(Math.round(node.y)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <details className="inspector-section">
      <summary>{tr('Position on map')}</summary>
      <form
        className="node-editor"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await onSave(Number(x), Number(y));
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-pair">
          <label>
            {tr('X coordinate')}
            <input
              type="number"
              required
              min={-1000000}
              max={1000000}
              value={x}
              onChange={(e) => setX(e.target.value)}
            />
          </label>
          <label>
            {tr('Y coordinate')}
            <input
              type="number"
              required
              min={-1000000}
              max={1000000}
              value={y}
              onChange={(e) => setY(e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {tr(error)}
          </p>
        )}
        <button disabled={busy}>{tr('Save position')}</button>
      </form>
    </details>
  );
}

export function NodeEditor({
  node,
  pid,
  onSave,
  onCancel,
}: {
  node?: ObjectNode;
  pid: string;
  onSave: (content: NodeContent) => Promise<void>;
  onCancel: () => void;
}) {
  useLocale();
  const draftKey = 'draft:object:' + (node?.id || 'new');
  const defaults = {
    kind: 'object',
    saved: true,
    node_id: node?.id,
    label: node?.label || '',
    category: String(node?.attrs.category || 'hypothesis'),
    description: String(node?.attrs.description || ''),
    status: String(node?.attrs.status || 'idea'),
    tags: (Array.isArray(node?.attrs.tags) ? node.attrs.tags : []).join(', '),
  };
  const [draft, setDraft] = useProjectState(pid, draftKey, defaults);
  const { label, category, description, status, tags } = draft;
  const setLabel = (label: string) => setDraft((old) => ({ ...old, label, saved: false }));
  const setCategory = (category: string) => setDraft((old) => ({ ...old, category, saved: false }));
  const setDescription = (description: string) =>
    setDraft((old) => ({ ...old, description, saved: false }));
  const setStatus = (status: string) => setDraft((old) => ({ ...old, status, saved: false }));
  const setTags = (tags: string) => setDraft((old) => ({ ...old, tags, saved: false }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave({
        label: label.trim(),
        category,
        description,
        status,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      putWorkspace(pid, draftKey, node ? { ...draft, label: label.trim(), saved: true } : defaults);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="node-editor" onSubmit={submit}>
      <DraftStatus pid={pid} draftKey={draftKey} value={draft} />
      <label>
        {tr('Object label')}
        <input
          autoFocus
          required
          maxLength={120}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={tr('What does this object represent?')}
        />
      </label>
      <div className="form-pair">
        <label>
          {tr('Category')}
          <select
            aria-label={tr('Category')}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {tr(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr('Investigation status')}
          <select
            aria-label={tr('Investigation status')}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {tr(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        {tr('Description')}
        <textarea
          aria-label={tr('Description')}
          maxLength={8000}
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={tr('Purpose, context, observations and next steps…')}
        />
      </label>
      <label>
        {tr('Tags')}
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder={tr('web, follow-up (comma separated)')}
        />
        <small>{tr('Up to 10 tags, 30 characters each.')}</small>
      </label>
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" onClick={onCancel} disabled={busy}>
          {tr('Cancel')}
        </button>
        <button className="primary" disabled={busy || !label.trim()}>
          {busy ? tr('Saving…') : node ? tr('Save object') : tr('Add object')}
        </button>
      </div>
    </form>
  );
}

export function CustomObjectDetails({
  node,
  pid,
  onSave,
}: {
  node: ObjectNode;
  pid: string;
  onSave: (content: NodeContent) => Promise<void>;
}) {
  useLocale();
  const [editing, setEditing] = useProjectState(pid, 'object_editing:' + node.id, false);
  return (
    <div className="inspector-section">
      {editing ? (
        <NodeEditor
          pid={pid}
          node={node}
          onCancel={() => setEditing(false)}
          onSave={async (content) => {
            await onSave(content);
            setEditing(false);
          }}
        />
      ) : (
        <>
          <div className="section-actions">
            <h3>{tr(String(node.attrs.category || 'hypothesis'))}</h3>
            <button onClick={() => setEditing(true)}>{tr('Edit object')}</button>
          </div>
          <span className="badge">{tr(String(node.attrs.status || 'idea'))}</span>
          <p className="object-description">
            {String(
              node.attrs.description ||
                tr('Add a description to explain this object and your next steps.'),
            )}
          </p>
          <div className="tag-list">
            {Array.isArray(node.attrs.tags) &&
              node.attrs.tags.map((t) => (
                <span key={String(t)} className="badge">
                  {String(t)}
                </span>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

export function RelationshipEditor({
  label,
  onSave,
}: {
  label: string;
  onSave: (label: string) => Promise<void>;
}) {
  useLocale();
  const [value, setValue] = useState(label);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="node-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await onSave(value.trim());
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        {tr('Relationship label')}
        <input
          required
          maxLength={80}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={tr('depends on, investigate, related to…')}
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
      <button disabled={busy || !value.trim()} className="primary">
        {tr('Save relationship')}
      </button>
    </form>
  );
}
