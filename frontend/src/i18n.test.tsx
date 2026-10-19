import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Preferences, { useAppearance } from './Preferences';
import { SectionTabs } from './WorkspaceNavigation';
import { api } from './api';
import { getLocale, setLocale, t } from './i18n';
import russian from './locales/ru.json';

vi.mock('./api', () => ({ api: vi.fn() }));
beforeEach(() => {
  setLocale('en');
  vi.mocked(api).mockImplementation(async (_path, method, body) =>
    method === 'PUT' ? body : { tools: {} },
  );
});
afterEach(() => {
  cleanup();
  setLocale('en');
  vi.restoreAllMocks();
});
function Settings() {
  const [appearance, setAppearance] = useAppearance();
  return <Preferences appearance={appearance} onAppearance={setAppearance} />;
}

it('switches live, retains unsaved fields, persists the language and keeps API values stable', async () => {
  const navigate = vi.fn();
  const view = render(
    <>
      <Settings />
      <SectionTabs page="Settings" onNavigate={navigate} />
    </>,
  );
  await waitFor(() => expect(api).toHaveBeenCalledWith('/settings'));
  const theme = screen.getByRole('combobox', { name: 'Theme' });
  fireEvent.change(theme, { target: { value: 'light' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Interface language' }), {
    target: { value: 'ru' },
  });
  expect(document.documentElement).toHaveAttribute('lang', 'ru');
  expect(localStorage.getItem('dragontrip.language')).toBe('ru');
  expect(screen.getByRole('combobox', { name: 'Тема' })).toBe(theme);
  expect(theme).toHaveValue('light');
  expect(screen.getByRole('option', { name: 'Светлая' })).toHaveValue('light');
  fireEvent.click(screen.getByRole('tab', { name: 'Инструменты' }));
  expect(navigate).toHaveBeenCalledWith('Tools');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить внешний вид' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      '/settings/appearance',
      'PUT',
      expect.objectContaining({ theme: 'light' }),
    ),
  );
  view.unmount();
  render(<Settings />);
  expect(screen.getByRole('combobox', { name: 'Язык интерфейса' })).toHaveValue('ru');
  fireEvent.change(screen.getByRole('combobox', { name: 'Язык интерфейса' }), {
    target: { value: 'en' },
  });
  expect(screen.getByRole('heading', { name: 'Appearance and graph' })).toBeInTheDocument();
});

it('uses English for invalid stored values and keeps switching usable without storage', () => {
  localStorage.setItem('dragontrip.language', 'invalid');
  expect(getLocale()).toBe('en');
  const save = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw Error('quota');
  });
  act(() => setLocale('ru'));
  expect(t('Settings')).toBe('Настройки');
  expect(t('Save {0}', ['Settings'])).toBe('Сохранить: Settings');
  expect(t('  Text from a future version  ')).toBe('  Text from a future version  ');
  expect(t('constructor')).toBe('constructor');
  expect(t('__proto__')).toBe('__proto__');
  save.mockRestore();
});

it('keeps interpolation placeholders intact in every Russian translation', () => {
  for (const [english, translation] of Object.entries(russian)) {
    expect(translation.trim(), english).not.toBe('');
    expect(translation.match(/\{\d+\}/g)?.sort() || [], english).toEqual(
      english.match(/\{\d+\}/g)?.sort() || [],
    );
  }
});

it('previews reduced motion immediately and saves the setting for the next launch', async () => {
  const view = render(<Settings />);
  const checkbox = screen.getByRole('checkbox', { name: 'Reduce motion' });
  fireEvent.click(checkbox);
  expect(document.documentElement.dataset.reducedMotion).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Save appearance' }));
  await waitFor(() =>
    expect(JSON.parse(localStorage.getItem('dragontrip.appearance') || '{}')).toEqual(
      expect.objectContaining({ reduced_motion: true }),
    ),
  );
  view.unmount();
  render(<Settings />);
  expect(screen.getByRole('checkbox', { name: 'Reduce motion' })).toBeChecked();
  expect(document.documentElement.dataset.reducedMotion).toBe('true');
});
