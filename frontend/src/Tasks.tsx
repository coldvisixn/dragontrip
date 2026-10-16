import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Search, ListChecks, X } from 'lucide-react';
import { api, type Detail } from './api';
import { ObjectLinks } from './Knowledge';
import Markdown from './Markdown';

const statuses = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
const names = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
};
type Status = (typeof statuses)[number];
type Task = {
  id: string;
  kind: 'task';
  title: string;
  content: {
    body: string;
    status: Status;
    priority: string;
    assignee: string;
    due_date: string | null;
    node_ids: string[];
    [key: string]: unknown;
  };
};
const empty = (): Task => ({
  id: '',
  kind: 'task',
  title: '',
  content: {
    body: '',
    status: 'todo',
    priority: 'medium',
    assignee: '',
    due_date: null,
    node_ids: [],
  },
});
const presets = [
  ['Custom task', '', ''],
  [
    'Review exposed services',
    'Review exposed services',
    'Review discovered services, confirm their purpose and document unnecessary exposure.',
  ],
  [
    'Validate a finding',
    'Validate finding and evidence',
    'Reproduce the observation in the authorized environment, attach evidence and assess impact.',
  ],
  [
    'Verify remediation',
    'Verify remediation',
    'Record the original finding, verify the fix and update its status with supporting evidence.',
  ],
] as const;
const overdue = (task: Task) =>
  Boolean(
    task.content.due_date &&
      task.content.due_date < new Date().toISOString().slice(0, 10) &&
      !['done', 'cancelled'].includes(task.content.status),
  );

export default function Tasks({
  detail,
  focusId,
  onChanged,
  onNode,
}: {
  detail: Detail;
  focusId?: string;
  onChanged: () => Promise<unknown>;
  onNode: (id: string) => void;
}) {
  const pid = detail.project.id;
  const [items, setItems] = useState<Task[]>([]);
  const [editor, setEditor] = useState<Task>();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [revision, setRevision] = useState(0);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    if (focusId)
      api<Task>(`/projects/${pid}/knowledge/${focusId}`)
        .then((row) => {
          if (!disposed && row.kind === 'task') setEditor(row);
        })
        .catch((e) => {
          if (!disposed) setError(e.message);
        });
    return () => {
      disposed = true;
    };
  }, [pid, focusId]);
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    const timer = setTimeout(() => {
      api<Task[]>(
        `/projects/${pid}/knowledge?kind=task&q=${encodeURIComponent(query)}&status=${status}&offset=${offset}&limit=100`,
      )
        .then((rows) => {
          if (!disposed) {
            setItems((old) =>
              offset ? [...old, ...rows.filter((r) => !old.some((o) => o.id === r.id))] : rows,
            );
            setMore(rows.length === 100);
            setError('');
          }
        })
        .catch((e) => {
          if (!disposed) setError(e.message);
        })
        .finally(() => {
          if (!disposed) setLoading(false);
        });
    }, 150);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [pid, query, status, offset, revision]);
  function edit(row: Task) {
    if (editor && !window.confirm('Discard unsaved task changes?')) return;
    setEditor(structuredClone(row));
    setError('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setBusy(true);
    setError('');
    try {
      await api(
        `/projects/${pid}/knowledge${editor.id ? '/' + editor.id : ''}`,
        editor.id ? 'PUT' : 'POST',
        { kind: 'task', title: editor.title, content: editor.content },
      );
      setEditor(undefined);
      setOffset(0);
      setRevision((v) => v + 1);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const change = (value: Partial<Task['content']>) =>
    setEditor((old) => (old ? { ...old, content: { ...old.content, ...value } } : old));
  return (
    <div className="page tasks-page">
      <div className="page-heading">
        <div>
          <h1>Task board</h1>
          <p>Plan investigations, assign work and track follow-up. Due dates use UTC.</p>
        </div>
        <button className="primary" disabled={busy} onClick={() => edit(empty())}>
          <Plus size={15} />
          New task
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
          <button onClick={() => setRevision((v) => v + 1)}>Retry</button>
        </p>
      )}
      <div className="knowledge-filters">
        <label className="search-field">
          <Search size={15} />
          <input
            aria-label="Search tasks"
            placeholder="Search tasks, owners or content…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <select
          aria-label="Task status filter"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setOffset(0);
          }}
        >
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {names[s]}
            </option>
          ))}
        </select>
      </div>
      {editor && (
        <form className="panel task-editor knowledge-editor" onSubmit={save}>
          <fieldset disabled={busy}>
            <div className="section-actions">
              <h2>{editor.id ? 'Edit task' : 'New task'}</h2>
              <button
                type="button"
                disabled={busy}
                aria-label="Close task editor"
                onClick={() => {
                  if (window.confirm('Discard unsaved task changes?')) setEditor(undefined);
                }}
              >
                <X size={16} />
              </button>
            </div>
            {!editor.id && (
              <label>
                Task template
                <select
                  aria-label="Task template"
                  defaultValue="0"
                  onChange={(e) => {
                    const preset = presets[Number(e.target.value)];
                    setEditor((old) =>
                      old
                        ? { ...old, title: preset[1], content: { ...old.content, body: preset[2] } }
                        : old,
                    );
                  }}
                >
                  {presets.map((p, i) => (
                    <option key={i} value={i}>
                      {p[0]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Title
              <input
                autoFocus
                required
                maxLength={160}
                value={editor.title}
                onChange={(e) => setEditor({ ...editor, title: e.target.value })}
              />
            </label>
            <div className="form-pair">
              <label>
                Status
                <select
                  aria-label="Status"
                  value={editor.content.status}
                  onChange={(e) => change({ status: e.target.value as Status })}
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {names[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select
                  aria-label="Priority"
                  value={editor.content.priority}
                  onChange={(e) => change({ priority: e.target.value })}
                >
                  {['low', 'medium', 'high', 'urgent'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-pair">
              <label>
                Owner
                <input
                  maxLength={100}
                  value={editor.content.assignee}
                  onChange={(e) => change({ assignee: e.target.value })}
                  placeholder="Unassigned"
                />
              </label>
              <label>
                Due date
                <input
                  type="date"
                  value={editor.content.due_date || ''}
                  onChange={(e) => change({ due_date: e.target.value || null })}
                />
              </label>
            </div>
            <label>
              Description
              <textarea
                rows={4}
                maxLength={12000}
                value={editor.content.body}
                onChange={(e) => change({ body: e.target.value })}
              />
            </label>
            <ObjectLinks
              detail={detail}
              ids={editor.content.node_ids}
              onChange={(node_ids) => change({ node_ids })}
            />
            <div className="dialog-actions">
              {editor.id && (
                <button
                  type="button"
                  className="danger-button"
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm('Delete this task?')) return;
                    setBusy(true);
                    try {
                      await api(`/projects/${pid}/knowledge/${editor.id}`, 'DELETE');
                      setEditor(undefined);
                      setOffset(0);
                      setRevision((v) => v + 1);
                      await onChanged();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Delete task
                </button>
              )}
              <button className="primary" disabled={busy || !editor.title.trim()}>
                {busy ? 'Saving…' : 'Save task'}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {loading && <p role="status">Loading tasks…</p>}
      <div className="task-board">
        {statuses
          .filter((s) => status === 'all' || status === s)
          .map((s) => {
            const rows = items
              .filter((t) => t.content.status === s)
              .sort(
                (a, b) =>
                  ['urgent', 'high', 'medium', 'low'].indexOf(a.content.priority) -
                    ['urgent', 'high', 'medium', 'low'].indexOf(b.content.priority) ||
                  (a.content.due_date || '9999').localeCompare(b.content.due_date || '9999'),
              );
            return (
              <section className="task-column panel" key={s}>
                <h2>
                  {names[s]} <span className="badge">{rows.length}</span>
                </h2>
                {rows.map((task) => (
                  <article
                    className={'task-card ' + (overdue(task) ? 'task-overdue' : '')}
                    key={task.id}
                  >
                    <span className={'badge priority-' + task.content.priority}>
                      {task.content.priority}
                    </span>
                    <button className="task-title" disabled={busy} onClick={() => edit(task)}>
                      {task.title}
                    </button>
                    <Markdown source={task.content.body.slice(0, 200)} />
                    <small>{task.content.assignee || 'Unassigned'}</small>
                    {task.content.due_date && (
                      <small className={overdue(task) ? 'form-error' : ''}>
                        {overdue(task) ? 'Overdue · ' : 'Due · '}
                        {task.content.due_date}
                      </small>
                    )}
                    <div className="linked-items">
                      {task.content.node_ids.map((id) => (
                        <button
                          key={id}
                          disabled={!detail.nodes.some((n) => n.id === id)}
                          onClick={() => onNode(id)}
                        >
                          {detail.nodes.find((n) => n.id === id)?.label || 'Deleted object'}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
                {!rows.length && (
                  <p className="muted">
                    <ListChecks size={18} /> No tasks in this column.
                  </p>
                )}
              </section>
            );
          })}
      </div>
      <p className="muted">
        {items.length} tasks loaded{query || status !== 'all' ? ' for these filters' : ''}.
      </p>
      {more && (
        <button disabled={loading} onClick={() => setOffset((v) => v + 100)}>
          Load more tasks
        </button>
      )}
    </div>
  );
}
