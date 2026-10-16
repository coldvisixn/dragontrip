import { useEffect, useState, type FormEvent } from 'react';
import { api } from './api';

export type Appearance = {
  theme: 'dark' | 'light' | 'system';
  accent: 'purple' | 'cyan' | 'green';
  density: 'comfortable' | 'compact';
  reduced_motion: boolean;
  graph_detail: 'auto' | 'full' | 'compact';
};
export const defaults: Appearance = {
  theme: 'dark',
  accent: 'purple',
  density: 'comfortable',
  reduced_motion: false,
  graph_detail: 'auto',
};
export function useAppearance() {
  const [value, setValue] = useState<Appearance>(() => {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem('dragontrip.appearance') || '{}') };
    } catch {
      return defaults;
    }
  });
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: light)') || {
      matches: false,
      addEventListener: undefined,
      removeEventListener: undefined,
    };
    const apply = () => {
      const root = document.documentElement;
      root.dataset.theme =
        value.theme === 'system' ? (media.matches ? 'light' : 'dark') : value.theme;
      root.dataset.accent = value.accent;
      root.dataset.density = value.density;
      root.dataset.reducedMotion = String(value.reduced_motion);
    };
    apply();
    localStorage.setItem('dragontrip.appearance', JSON.stringify(value));
    media.addEventListener?.('change', apply);
    return () => media.removeEventListener?.('change', apply);
  }, [value]);
  return [value, setValue] as const;
}

export default function Preferences({
  appearance,
  onAppearance,
}: {
  appearance: Appearance;
  onAppearance: (value: Appearance) => void;
}) {
  const [draft, setDraft] = useState(appearance);
  const [paths, setPaths] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => setDraft(appearance), [appearance]);
  useEffect(() => {
    let disposed = false;
    api<{ tools: Record<string, string> }>('/settings')
      .then((value) => {
        if (!disposed) setPaths(value.tools || {});
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
    };
  }, []);
  async function save(e: FormEvent, type: 'appearance' | 'tools') {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');
    try {
      if (type === 'appearance') {
        const result = await api<Appearance>('/settings/appearance', 'PUT', draft);
        onAppearance(result);
      } else {
        await api('/settings/tools', 'PUT', { paths });
      }
      setMessage(type === 'appearance' ? 'Appearance saved' : 'Tool locations validated and saved');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const change = <K extends keyof Appearance>(key: K, value: Appearance[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <section className="panel product-settings">
      <h2>Appearance and graph</h2>
      {message && (
        <p role="status" className="success-message">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <form onSubmit={(e) => void save(e, 'appearance')}>
        <div className="recon-grid">
          <label>
            Theme
            <select
              aria-label="Theme"
              value={draft.theme}
              onChange={(e) => change('theme', e.target.value as Appearance['theme'])}
            >
              {['dark', 'light', 'system'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Accent
            <select
              aria-label="Accent"
              value={draft.accent}
              onChange={(e) => change('accent', e.target.value as Appearance['accent'])}
            >
              {['purple', 'cyan', 'green'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Density
            <select
              aria-label="Density"
              value={draft.density}
              onChange={(e) => change('density', e.target.value as Appearance['density'])}
            >
              {['comfortable', 'compact'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Graph detail
            <select
              aria-label="Graph detail"
              value={draft.graph_detail}
              onChange={(e) => change('graph_detail', e.target.value as Appearance['graph_detail'])}
            >
              {['auto', 'full', 'compact'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.reduced_motion}
            onChange={(e) => change('reduced_motion', e.target.checked)}
          />
          Reduce motion
        </label>
        <button className="primary" disabled={busy}>
          Save appearance
        </button>
      </form>
      <h2>Tool executable locations</h2>
      <p className="muted">
        Leave empty to use PATH detection. Locations are checked against each tool's version output
        before saving.
      </p>
      <form onSubmit={(e) => void save(e, 'tools')}>
        <div className="recon-grid">
          {['nmap', 'whatweb', 'httpx', 'ffuf'].map((tool) => (
            <label key={tool}>
              {tool}
              <input
                aria-label={`${tool} executable`}
                value={paths[tool] || ''}
                maxLength={500}
                onChange={(e) => setPaths((p) => ({ ...p, [tool]: e.target.value }))}
                placeholder="Automatic from PATH"
              />
            </label>
          ))}
        </div>
        <button className="primary" disabled={busy}>
          Save tool locations
        </button>
      </form>
      <h2>Keyboard shortcuts</h2>
      <dl className="shortcut-list">
        {[
          ['Ctrl/⌘ K', 'Open command palette'],
          ['Ctrl/⌘ Shift F', 'Search project knowledge'],
          ['Ctrl/⌘ Shift N', 'Create a custom object'],
          ['Ctrl/⌘ Shift S', 'Open scan dialog'],
          ['Alt ← / →', 'Back / forward navigation'],
          ['Escape', 'Close dialog, menu or Inspector'],
          ['Ctrl/⌘ Enter', 'Save the focused form'],
          ['↑ / ↓ / Enter', 'Navigate and choose palette commands'],
        ].map(([key, action]) => (
          <div key={key}>
            <dt>
              <kbd>{key}</kbd>
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
