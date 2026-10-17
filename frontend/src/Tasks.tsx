import { useEffect, useState } from 'react';
import { Plus, Search, ListChecks } from 'lucide-react';
import { api, type Detail } from './api';
import { Editor, type KnowledgeRecord } from './Knowledge';
import Markdown from './Markdown';
import { useProjectState, getWorkspace, isWorkspaceClosed } from './workspace';

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
  onSeedConsumed,
}: {
  detail: Detail;
  focusId?: string;
  onChanged: () => Promise<unknown>;
  onNode: (id: string) => void;
  onSeedConsumed?: () => void;
}) {
  const pid = detail.project.id;
  const [items, setItems] = useState<Task[]>([]);
  const [view, setView] = useProjectState(pid, 'tasks', {
    editing: false,
    record_id: focusId || '',
    draft_id: crypto.randomUUID(),
    query: '',
    status: 'all',
  });
  const [editor, setEditor] = useState<Task>();
  const { query, status } = view;
  const setQuery = (query: string) => setView((v) => ({ ...v, query }));
  const setStatus = (status: string) => setView((v) => ({ ...v, status }));
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (view.editing && isWorkspaceClosed(pid, 'draft:' + view.draft_id))
      setView((v) => ({ ...v, editing: false }));
  }, [pid, view.editing, view.draft_id]);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const busy = false;
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    const id = focusId || view.record_id;
    if (id)
      api<Task>(`/projects/${pid}/knowledge/${id}`)
        .then((row) => {
          if (!disposed && row.kind === 'task') {
            setEditor(row);
            if (focusId) {
              setView((v) => ({
                ...v,
                editing: true,
                record_id: row.id,
                draft_id:
                  v.record_id === row.id && getWorkspace(pid, 'draft:' + v.draft_id, null)
                    ? v.draft_id
                    : crypto.randomUUID(),
              }));
              onSeedConsumed?.();
            }
          }
        })
        .catch((e) => {
          if (!disposed) setError(e.message);
        });
    return () => {
      disposed = true;
    };
  }, [pid, focusId, view.record_id]);
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
    setEditor(structuredClone(row));
    setView((v) => ({ ...v, editing: true, record_id: row.id, draft_id: crypto.randomUUID() }));
    setError('');
  }
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
      {view.editing &&
        (!view.record_id ||
          editor?.id === view.record_id ||
          getWorkspace(pid, 'draft:' + view.draft_id, null)) && (
          <section className="panel task-editor">
            <Editor
              key={view.draft_id}
              draftId={view.draft_id}
              detail={detail}
              kind="task"
              record={editor?.id ? (editor as unknown as KnowledgeRecord) : undefined}
              onCancel={() => {
                setView((v) => ({ ...v, editing: false }));
                setRevision((v) => v + 1);
              }}
              onSave={() => {
                if (getWorkspace(pid, 'tasks', view).draft_id !== view.draft_id) return;
                setView((v) => ({ ...v, editing: false, record_id: '' }));
                setEditor(undefined);
                setOffset(0);
                setRevision((v) => v + 1);
                void onChanged().catch(() => setError('Task saved. Refresh failed; use Retry.'));
              }}
            />
          </section>
        )}
      {!view.editing && getWorkspace(pid, 'draft:' + view.draft_id, null) && (
        <button onClick={() => setView((v) => ({ ...v, editing: true }))}>Resume task draft</button>
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
