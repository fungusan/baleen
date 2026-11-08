import type { Provider } from './types';
import { isExtension } from './settings';

// One slot per provider: a DeepSeek key never travels to Kimi, and vice versa.
const KEYS: Record<Provider, string> = {
  deepseek: 'fungusan-gal.deepseek.key',
  moonshot: 'fungusan-gal.kimi.key',
};
/** Both providers issue `sk-` keys; the check only rejects obvious typos. */
export function normalizeApiKey(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const key = input.trim();
  return /^sk-[A-Za-z0-9_-]{12,}$/.test(key) ? key : null;
}
export async function readApiKey(provider: Provider): Promise<string> {
  if (!isExtension()) return '';
  const storageKey = KEYS[provider];
  const value = (await chrome.storage.local.get(storageKey))[storageKey];
  return typeof value === 'string' ? value : '';
}
export async function writeApiKey(provider: Provider, key: string): Promise<void> {
  if (!isExtension()) throw new Error('Open this popup from the installed extension.');
  await chrome.storage.local.set({ [KEYS[provider]]: key });
}
export async function clearApiKey(provider: Provider): Promise<void> {
  if (!isExtension()) return;
  await chrome.storage.local.remove(KEYS[provider]);
}
