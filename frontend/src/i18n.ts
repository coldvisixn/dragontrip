import { useSyncExternalStore } from 'react';
import russian from './locales/ru.json';

export type Locale = 'en' | 'ru';
const storageKey = 'dragontrip.language';
const listeners = new Set<() => void>();
let volatileLocale: Locale | undefined;
const dictionary: Readonly<Record<string, string>> = russian;

export function getLocale(): Locale {
  if (volatileLocale) return volatileLocale;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'en' || saved === 'ru') return saved;
  } catch {
    // Keep switching available when browser storage is unavailable.
  }
  return 'en';
}

export function setLocale(locale: Locale) {
  volatileLocale = locale;
  try {
    localStorage.setItem(storageKey, locale);
    volatileLocale = undefined;
  } catch {
    // The in-memory choice still applies for this session.
  }
  document.documentElement.lang = locale;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) {
      volatileLocale = undefined;
      document.documentElement.lang = getLocale();
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useLocale() {
  return useSyncExternalStore(subscribe, getLocale, () => 'en' as Locale);
}

/** Translate interface text only; never pass authored content or tool output here. */
export function t(english: string, values: readonly unknown[] = []): string {
  const key = english.trim();
  if (!key) return english;
  const translated = getLocale() === 'ru' && Object.hasOwn(dictionary, key) ? dictionary[key] : key;
  const formatted = translated.replace(/\{(\d+)\}/g, (match, index: string) =>
    Number(index) < values.length ? String(values[Number(index)] ?? '') : match,
  );
  return (
    english.slice(0, english.length - english.trimStart().length) +
    formatted +
    english.slice(english.trimEnd().length)
  );
}

export function localeTag() {
  return getLocale() === 'ru' ? 'ru-RU' : 'en-US';
}
