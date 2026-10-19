import { t as tr, useLocale, setLocale, type Locale } from './i18n';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from './api';
import { readLocal, writeLocal } from './workspace';
import { applyMotionPreference } from './motion';

export type Appearance = {
  theme: 'dark' | 'light' | 'system';
  accent: 'purple' | 'cyan' | 'green';
  density: 'comfortable' | 'compact';
  reduced_motion: boolean;
  graph_detail: 'auto' | 'full' | 'compact';
  performance_profile: 'low' | 'medium' | 'high';
};
export const defaults: Appearance = {
  theme: 'dark',
  accent: 'purple',
  density: 'comfortable',
  reduced_motion: false,
  graph_detail: 'auto',
  performance_profile: 'medium',
};
export function useAppearance() {
  const [value, setValue] = useState<Appearance>(() => {
    try {
      return { ...defaults, ...JSON.parse(readLocal('dragontrip.appearance') || '{}') };
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
      applyMotionPreference(value);
      root.dataset.theme =
        value.theme === 'system' ? (media.matches ? 'light' : 'dark') : value.theme;
      root.dataset.accent = value.accent;
      root.dataset.density = value.density;
    };
    apply();
    writeLocal('dragontrip.appearance', JSON.stringify(value));
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
  const locale = useLocale();
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
      setMessage(
        type === 'appearance' ? tr('Appearance saved') : tr('Tool locations validated and saved'),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const change = <K extends keyof Appearance>(key: K, value: Appearance[K]) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    applyMotionPreference(next);
  };
  // Preview motion changes immediately; unsaved changes revert on leaving settings.
  useEffect(() => () => applyMotionPreference(appearance), [appearance]);
  return (
    <section className="panel product-settings">
      <h2>{tr('Language')}</h2>
      <label>
        {tr('Interface language')}
        <select
          aria-label={tr('Interface language')}
          value={locale}
          onChange={(event) => setLocale(event.target.value as Locale)}
        >
          <option value="en" lang="en">
            English
          </option>
          <option value="ru" lang="ru">
            Русский
          </option>
        </select>
      </label>
      <p className="muted">
        {tr('The language is saved automatically and applies to all projects.')}
      </p>
      <h2>{tr('Appearance and graph')}</h2>
      {message && (
        <p role="status" className="success-message">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
      <form onSubmit={(e) => void save(e, 'appearance')}>
        <div className="recon-grid">
          <label>
            {tr('Performance profile')}
            <select
              aria-label={tr('Performance profile')}
              value={draft.performance_profile}
              onChange={(e) =>
                change('performance_profile', e.target.value as Appearance['performance_profile'])
              }
            >
              <option value="low">{tr('Low')}</option>
              <option value="medium">{tr('Medium')}</option>
              <option value="high">{tr('High')}</option>
            </select>
          </label>
          <label>
            {tr('Theme')}
            <select
              aria-label={tr('Theme')}
              value={draft.theme}
              onChange={(e) => change('theme', e.target.value as Appearance['theme'])}
            >
              {['dark', 'light', 'system'].map((value) => (
                <option key={value} value={value}>
                  {tr(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr('Accent')}
            <select
              aria-label={tr('Accent')}
              value={draft.accent}
              onChange={(e) => change('accent', e.target.value as Appearance['accent'])}
            >
              {['purple', 'cyan', 'green'].map((value) => (
                <option key={value} value={value}>
                  {tr(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr('Density')}
            <select
              aria-label={tr('Density')}
              value={draft.density}
              onChange={(e) => change('density', e.target.value as Appearance['density'])}
            >
              {['comfortable', 'compact'].map((value) => (
                <option key={value} value={value}>
                  {tr(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr('Graph detail')}
            <select
              aria-label={tr('Graph detail')}
              value={draft.graph_detail}
              onChange={(e) => change('graph_detail', e.target.value as Appearance['graph_detail'])}
            >
              {['auto', 'full', 'compact'].map((value) => (
                <option key={value} value={value}>
                  {tr(value)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted">
          {tr(
            'Low reduces motion and graph decoration. Medium keeps the standard balance. High retains detailed cards longer. Graph detail can override automatic card density; every profile keeps large-graph limits and all objects available.',
          )}
        </p>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.reduced_motion}
            onChange={(e) => change('reduced_motion', e.target.checked)}
          />
          {tr('Reduce motion')}
        </label>
        <p className="muted">
          {tr(
            'Motion changes preview immediately. Save appearance to keep them. System reduced motion and the Low profile also disable animations.',
          )}
        </p>
        <button className="primary" disabled={busy}>
          {tr('Save appearance')}
        </button>
      </form>
      <h2>{tr('Tool executable locations')}</h2>
      <p className="muted">
        {tr(
          "Leave empty to use PATH detection. Locations are checked against each tool's version output before saving.",
        )}
      </p>
      <form onSubmit={(e) => void save(e, 'tools')}>
        <div className="recon-grid">
          {['nmap', 'whatweb', 'httpx', 'ffuf'].map((tool) => (
            <label key={tool}>
              {tool}
              <input
                aria-label={tr('{0} executable', [tool])}
                value={paths[tool] || ''}
                maxLength={500}
                onChange={(e) => setPaths((p) => ({ ...p, [tool]: e.target.value }))}
                placeholder={tr('Automatic from PATH')}
              />
            </label>
          ))}
        </div>
        <button className="primary" disabled={busy}>
          {tr('Save tool locations')}
        </button>
      </form>
      <h2>{tr('Keyboard shortcuts')}</h2>
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
            <dd>{tr(action)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
