import { DEFAULT_MODEL, DEEPSEEK_MODELS, THEMES } from './types';
import type { DeepSeekModel, Settings, Theme } from './types';

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const model = (v: unknown): DeepSeekModel =>
  typeof v === 'string' && (DEEPSEEK_MODELS as readonly string[]).includes(v)
    ? (v as DeepSeekModel)
    : DEFAULT_MODEL;
const theme = (v: unknown): Theme =>
  typeof v === 'string' && (THEMES as readonly string[]).includes(v) ? (v as Theme) : 'system';
export function sanitizeSettings(raw: unknown): Settings {
  const v = record(raw);
  const p = record(v.position);
  return {
    version: 5,
    theme: theme(v.theme),
    scale: finite(v.scale) ? Math.max(0.6, Math.min(1.6, v.scale)) : 1,
    hidden: bool(v.hidden, false),
    position:
      finite(p.x) && finite(p.y)
        ? { x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) }
        : null,
    model: model(v.model),
  };
}
// Deliberately unchanged across the rename: the key is what keeps an existing install's
// preferences alive, and the sanitizer simply drops the per-site fields an older build wrote.
const KEY = 'fungusan-gal.settings.v2';
export const isExtension = () => typeof chrome !== 'undefined' && !!chrome.runtime?.id;
export async function readSettings(): Promise<Settings> {
  if (isExtension()) return sanitizeSettings((await chrome.storage.local.get(KEY))[KEY]);
  try {
    return sanitizeSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return sanitizeSettings(null);
  }
}
export async function writeSettings(settings: Settings): Promise<void> {
  const value = sanitizeSettings(settings);
  if (isExtension()) await chrome.storage.local.set({ [KEY]: value });
  else {
    localStorage.setItem(KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(KEY, { detail: value }));
  }
}
export function watchSettings(listener: (settings: Settings) => void): () => void {
  if (isExtension()) {
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[KEY]) listener(sanitizeSettings(changes[KEY].newValue));
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }
  const local = (event: Event) =>
    listener(sanitizeSettings((event as CustomEvent<unknown>).detail));
  window.addEventListener(KEY, local);
  return () => window.removeEventListener(KEY, local);
}
