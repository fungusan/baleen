import type { Provider } from './types';
import { isExtension } from './settings';

// One slot per provider: a DeepSeek key never travels to Kimi, and so on for every provider.
const KEYS: Record<Provider, string> = {
  deepseek: 'fungusan-gal.deepseek.key',
  moonshot: 'fungusan-gal.kimi.key',
  qwen: 'fungusan-gal.qwen.key',
  glm: 'fungusan-gal.glm.key',
  minimax: 'fungusan-gal.minimax.key',
};
// DeepSeek, Kimi, and Qwen issue `sk-` keys; GLM and MiniMax use opaque Bearer tokens.
const SK_PROVIDERS = new Set<Provider>(['deepseek', 'moonshot', 'qwen']);
const SK_KEY = /^sk-[A-Za-z0-9_-]{12,}$/;
const TOKEN_KEY = /^[A-Za-z0-9._-]{16,}$/;
/** The check only rejects obvious typos, so a paste with a stray character still works. */
export function normalizeApiKey(input: unknown, provider: Provider): string | null {
  if (typeof input !== 'string') return null;
  const key = input.trim();
  return (SK_PROVIDERS.has(provider) ? SK_KEY : TOKEN_KEY).test(key) ? key : null;
}
export const keyPlaceholder = (provider: Provider) =>
  SK_PROVIDERS.has(provider) ? 'sk-…' : 'Paste your key';
export const keyPreview = (provider: Provider, key: string) =>
  `${SK_PROVIDERS.has(provider) ? 'sk-…' : '…'}${key.slice(-4)}`;
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
