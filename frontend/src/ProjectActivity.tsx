import { useEffect, useState } from 'react';
import { Clock3, Search as SearchIcon } from 'lucide-react';
import { api } from './api';
import { useProjectState } from './workspace';

export type SearchResult = {
  id: string;
  title: string;
  kind: 'object' | 'knowledge' | 'scan' | 'attachment' | 'event';
  subtype: string;
};
export function SearchResults({
  pid,
  query,
  onOpen,
  compact = false,
}: {
  pid: string;
  query: string;
  onOpen: (item: SearchResult) => void;
  compact?: boolean;
}) {
  const [items, setItems] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [category, setCategory] = useProjectState(pid, 'search_category', 'all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setOffset(0), [query, category]);
  useEffect(() => {
    if (!query.trim()) {
      setItems([]);
      setTotal(0);
      return;
    }
    let disposed = false;
    const timer = setTimeout(() => {
      setLoading(true);
      api<{ total: number; items: SearchResult[] }>(
        `/projects/${pid}/search?q=${encodeURIComponent(query.trim())}&category=${category}&offset=${offset}&limit=${compact ? 10 : 30}`,
      )
        .then((value) => {
          if (!disposed) {
            setItems(value.items);
            setTotal(value.total);
            setError('');
          }
        })
        .catch((e) => {
          if (!disposed) setError(e.message);
        })
        .finally(() => {
          if (!disposed) setLoading(false);
        });
    }, 180);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [pid, query, category, offset, compact]);
  return (
    <div className={'project-search-results ' + (compact ? 'compact-results' : '')}>
      {!compact && (
        <div className="section-actions">
          <select
            aria-label="Search category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {['all', 'objects', 'knowledge', 'scans', 'evidence', 'events'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <span className="muted" aria-live="polite">
            {loading ? 'Searching…' : total + ' results'}
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {items.map((item) => (
        <button
          className="search-result"
          key={item.kind + ':' + item.id}
          onClick={() => onOpen(item)}
        >
          <SearchIcon size={15} />
          <span>
            <strong>{item.title}</strong>
            <small>
              {item.kind} · {item.subtype}
            </small>
          </span>
        </button>
      ))}
      {!loading && !items.length && query.trim() && (
        <p className="knowledge-empty">No matching project knowledge.</p>
      )}
      {!compact && total > 30 && (
        <div className="pagination">
          <button
            disabled={offset === 0 || loading}
            onClick={() => setOffset((v) => Math.max(0, v - 30))}
          >
            Previous
          </button>
          <span>
            {offset + 1}–{Math.min(total, offset + 30)} of {total}
          </span>
          <button
            disabled={offset + 30 >= total || loading}
            onClick={() => setOffset((v) => v + 30)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export function ProjectSearch({
  pid,
  onOpen,
}: {
  pid: string;
  onOpen: (item: SearchResult) => void;
}) {
  const [query, setQuery] = useProjectState(pid, 'search_query', '');
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Project search</h1>
          <p>Search objects, Markdown notes, findings, paths, evidence names, scans and events.</p>
        </div>
      </div>
      <label className="search-field panel">
        <SearchIcon size={18} />
        <input
          autoFocus
          aria-label="Search project knowledge"
          value={query}
          maxLength={100}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search this project's knowledge…"
        />
      </label>
      <section className="panel">
        <SearchResults pid={pid} query={query} onOpen={onOpen} />
      </section>
    </div>
  );
}

export function Timeline({ pid }: { pid: string }) {
  const [query, setQuery] = useProjectState(pid, 'search_query', '');
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<{ id: string; message: string; created: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => setOffset(0), [query]);
  useEffect(() => {
    let disposed = false;
    const timer = setTimeout(() => {
      setLoading(true);
      api<{ total: number; items: typeof items }>(
        `/projects/${pid}/timeline?q=${encodeURIComponent(query)}&offset=${offset}&limit=50`,
      )
        .then((value) => {
          if (!disposed) {
            setItems(value.items);
            setTotal(value.total);
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
  }, [pid, query, offset, revision]);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Timeline</h1>
          <p>Project history in chronological context, with newest events first.</p>
        </div>
        <button disabled={loading} onClick={() => setRevision((v) => v + 1)}>
          Refresh timeline
        </button>
      </div>
      <section className="panel">
        <input
          aria-label="Filter timeline"
          placeholder="Filter activity…"
          value={query}
          maxLength={100}
          onChange={(e) => setQuery(e.target.value)}
        />
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <ol className="timeline" aria-label="Project timeline">
          {items.map((item) => (
            <li key={item.id}>
              <Clock3 size={16} />
              <div>
                <p>{item.message}</p>
                <time dateTime={item.created}>{new Date(item.created).toLocaleString()}</time>
              </div>
            </li>
          ))}
        </ol>
        {!items.length && (
          <p className="knowledge-empty">
            {loading ? 'Loading history…' : 'No matching activity.'}
          </p>
        )}
        <div className="pagination">
          <button
            disabled={!offset || loading}
            onClick={() => setOffset((v) => Math.max(0, v - 50))}
          >
            Previous
          </button>
          <span aria-live="polite">
            {total ? offset + 1 : 0}–{Math.min(total, offset + 50)} of {total}
          </span>
          <button
            disabled={offset + 50 >= total || loading}
            onClick={() => setOffset((v) => v + 50)}
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
