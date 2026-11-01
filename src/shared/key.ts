import { isExtension } from './settings';

const KEY = 'fungusan-gal.deepseek.key';
/** DeepSeek keys are `sk-` followed by an opaque token. The check only rejects obvious typos. */
export function normalizeApiKey(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const key = input.trim();
  return /^sk-[A-Za-z0-9_-]{12,}$/.test(key) ? key : null;
}
export async function readApiKey(): Promise<string> {
  if (!isExtension()) return '';
  const value = (await chrome.storage.local.get(KEY))[KEY];
  return typeof value === 'string' ? value : '';
}
export async function writeApiKey(key: string): Promise<void> {
  if (!isExtension()) throw new Error('Open this popup from the installed extension.');
  await chrome.storage.local.set({ [KEY]: key });
}
export async function clearApiKey(): Promise<void> {
  if (!isExtension()) return;
  await chrome.storage.local.remove(KEY);
}
