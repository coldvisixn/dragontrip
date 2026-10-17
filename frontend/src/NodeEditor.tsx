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
  const [x, setX] = useState(String(Math.round(node.x)));
  const [y, setY] = useState(String(Math.round(node.y)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <details className="inspector-section">
      <summary>Position on map</summary>
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
            X coordinate
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
            Y coordinate
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
            {error}
          </p>
        )}
        <button disabled={busy}>Save position</button>
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
        Object label
        <input
          autoFocus
          required
          maxLength={120}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What does this object represent?"
        />
      </label>
      <div className="form-pair">
        <label>
          Category
          <select
            aria-label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Investigation status
          <select
            aria-label="Investigation status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Description
        <textarea
          aria-label="Description"
          maxLength={8000}
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Purpose, context, observations and next steps…"
        />
      </label>
      <label>
        Tags
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="web, follow-up (comma separated)"
        />
        <small>Up to 10 tags, 30 characters each.</small>
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="primary" disabled={busy || !label.trim()}>
          {busy ? 'Saving…' : node ? 'Save object' : 'Add object'}
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
            <h3>{String(node.attrs.category || 'hypothesis')}</h3>
            <button onClick={() => setEditing(true)}>Edit object</button>
          </div>
          <span className="badge">{String(node.attrs.status || 'idea')}</span>
          <p className="object-description">
            {String(
              node.attrs.description ||
                'Add a description to explain this object and your next steps.',
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
        Relationship label
        <input
          required
          maxLength={80}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="depends on, investigate, related to…"
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button disabled={busy || !value.trim()} className="primary">
        Save relationship
      </button>
    </form>
  );
}
