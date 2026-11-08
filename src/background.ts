import { askModel } from './shared/chat';
import { asksAboutBaleen } from './shared/help';
import { readApiKey } from './shared/key';
import { readSettings, sanitizeSettings, writeSettings } from './shared/settings';
import { DEFAULT_MODEL, MODELS, PROVIDER_LABELS, providerForModel } from './shared/types';
import type { AskAction, AskResult, ChatTurn, Model } from './shared/types';

const ASK_ACTIONS = new Set<string>(['chat', 'talk', 'summarize', 'keywords', 'title']);
const MODEL_IDS = new Set<string>(MODELS);
const MAX_INPUT = 12000;
const MAX_PROMPT = 2000;
const MAX_IMAGES = 6;
const MAX_HISTORY = 6;
const MAX_HISTORY_ITEM = 2000;
const MAX_NOTES = 3000;
const RAW_TTL = 15_000;
/** PDF URLs the reader was explicitly asked to hand back to Chrome's own viewer. */
const rawBypass = new Map<string, number>();
const TIMEOUTS: Record<Model, number> = {
  'deepseek-flash': 90_000,
  'deepseek-v4-pro': 120_000,
  'kimi-k3.1-pro': 180_000,
  'kimi-k3': 180_000,
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function historyFrom(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  const turns: ChatTurn[] = [];
  for (const item of value) {
    const turn = object(item);
    const role = turn.role === 'user' || turn.role === 'assistant' ? turn.role : null;
    const content = typeof turn.content === 'string' ? turn.content.trim() : '';
    if (!role || !content) continue;
    turns.push({ role, content: content.slice(0, MAX_HISTORY_ITEM) });
  }
  return turns.slice(-MAX_HISTORY);
}
let writes: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const job = writes.catch(() => undefined).then(operation);
  writes = job;
  return job;
}

/** One explicit, user-triggered call. Nothing is sent until a menu action or Send is pressed. */
async function answer(raw: unknown, sender: chrome.runtime.MessageSender): Promise<AskResult> {
  const fromExtension = sender.url?.startsWith(chrome.runtime.getURL('')) ?? false;
  if (!sender.tab && !fromExtension) throw new Error('Open this from a web page.');
  const request = object(raw);
  if (typeof request.action !== 'string' || !ASK_ACTIONS.has(request.action))
    throw new Error('Unsupported action.');
  const action = request.action as AskAction;
  const model =
    typeof request.model === 'string' && MODEL_IDS.has(request.model)
      ? (request.model as Model)
      : DEFAULT_MODEL;
  const provider = providerForModel(model);
  const label = PROVIDER_LABELS[provider];
  const text = typeof request.text === 'string' ? request.text.trim() : '';
  if (text.length > MAX_INPUT) throw new Error('That passage is too long. Select less text.');
  const prompt =
    typeof request.prompt === 'string' ? request.prompt.trim().slice(0, MAX_PROMPT) : '';
  const images = Array.isArray(request.images)
    ? request.images
        .filter((image): image is string => typeof image === 'string' && !!image.trim())
        .map((image) => image.trim().slice(0, 240))
        .slice(0, MAX_IMAGES)
    : [];
  if (action === 'chat' || action === 'talk') {
    if (!prompt) throw new Error('Type a question first.');
    // A question about Baleen herself needs no page text; every other turn does.
    if (!text && !images.length && !asksAboutBaleen(prompt))
      throw new Error('Select a section first.');
  } else if (!text) {
    throw new Error('There was nothing to send.');
  }
  const title = typeof request.title === 'string' ? request.title.slice(0, 160) : '';
  const notes =
    typeof request.notes === 'string' ? request.notes.trim().slice(0, MAX_NOTES) : '';
  const conversational = action === 'chat' || action === 'talk';
  const thinking = conversational && request.thinking === true;
  const key = await readApiKey(provider);
  if (!key) throw new Error(`Add your ${label} API key in the popup first.`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUTS[model]);
  try {
    return await askModel(
      key,
      {
        action,
        model,
        text,
        title,
        prompt: conversational ? prompt : undefined,
        images: conversational ? images : undefined,
        history: conversational ? historyFrom(request.history) : undefined,
        notes: conversational ? notes : undefined,
        thinking,
      },
      controller.signal,
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      throw new Error(`${label} took too long. Try again.`);
    if (error instanceof TypeError)
      throw new Error(`Could not reach ${label}. Check your connection.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
const WEB_PAGE = /^https?:/;
let contentFiles: Promise<string[]> | undefined;
/**
 * The runtime manifest Chrome hands the worker omits `content_scripts`, so read the packaged
 * manifest to learn which loader file to inject.
 */
function loaderFiles() {
  contentFiles ??= (async () => {
    const response = await fetch(chrome.runtime.getURL('manifest.json'));
    const manifest = (await response.json()) as { content_scripts?: { js?: string[] }[] };
    return manifest.content_scripts?.[0]?.js ?? [];
  })().catch(() => []);
  return contentFiles;
}
/** A live content script answers and re-reconciles; an orphaned one cannot be reached at all. */
async function reach(tabId: number) {
  try {
    const reply = (await chrome.tabs.sendMessage(tabId, { type: 'fg:ensure' })) as
      | { ok?: boolean }
      | undefined;
    return !!reply?.ok;
  } catch {
    return false;
  }
}
/**
 * Reloading or updating an unpacked extension orphans the content scripts already in open tabs:
 * they keep their old card but every chrome.* call is dead. Re-inject the same loader registered
 * in the manifest so those tabs can mount again without a page reload.
 */
async function remount(tabId: number) {
  if (await reach(tabId)) return;
  const files = await loaderFiles();
  if (!files.length) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files });
  } catch {
    // Restricted pages (chrome://, the Web Store) refuse injection and need no companion.
  }
}
async function ensureEverywhere() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map((tab) => {
      if (tab.id == null) return;
      if (tab.url && !WEB_PAGE.test(tab.url)) return;
      return remount(tab.id);
    }),
  );
}
/** Preferences are validated once, here, so the popup and every mounted page agree on them. */
async function handle(message: unknown) {
  const m = object(message);
  if (m.type !== 'fg:update') throw new Error('Unsupported extension message.');
  const settings = await readSettings();
  await writeSettings(sanitizeSettings({ ...settings, ...object(m.patch) }));
}
chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  const m = object(message);
  const failed = (error: unknown) => {
    reply({
      ok: false,
      error: error instanceof Error ? error.message : 'Could not save.',
    });
  };
  if (m.type === 'fg:ask') {
    void answer(m.request, sender).then((data) => reply({ ok: true, data }), failed);
    return true;
  }
  if (m.type === 'fg:ensure') {
    void ensureEverywhere().then(() => reply({ ok: true }), failed);
    return true;
  }
  if (m.type === 'fg:raw-pdf') {
    // webRequest reports URLs without fragments, so key the bypass the same way.
    if (typeof m.url === 'string' && /^https?:/i.test(m.url))
      rawBypass.set(m.url.split('#')[0], Date.now());
    reply({ ok: true });
    return true;
  }
  void enqueue(() => handle(m)).then(() => reply({ ok: true }), failed);
  return true;
});
/** A top-level PDF navigation becomes a reader tab; the reader's own fetches are not main_frame. */
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return undefined;
    const headers = details.responseHeaders ?? [];
    const header = (name: string) =>
      headers.find((item) => item.name.toLowerCase() === name)?.value ?? '';
    if (!header('content-type').toLowerCase().includes('application/pdf')) return undefined;
    if (/attachment/i.test(header('content-disposition'))) return undefined;
    const allowed = rawBypass.get(details.url);
    if (allowed && Date.now() - allowed < RAW_TTL) {
      rawBypass.delete(details.url);
      return undefined;
    }
    for (const [url, at] of rawBypass) if (Date.now() - at > RAW_TTL) rawBypass.delete(url);
    const viewer = chrome.runtime.getURL(`viewer.html?file=${encodeURIComponent(details.url)}`);
    void chrome.tabs.update(details.tabId, { url: viewer }).catch(() => undefined);
    return undefined;
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
  ['responseHeaders'],
);
// Existing tabs keep the script they started with when the extension updates, so re-inject after
// every install or update instead of waiting for the user to reload each page.
chrome.runtime.onInstalled.addListener(() => {
  void ensureEverywhere().catch(() => undefined);
});
// The card's own Hide button writes the same flag, so this shortcut brings her back as well.
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-companion') return;
  void enqueue(async () => {
    const settings = await readSettings();
    const wasHidden = settings.hidden;
    await writeSettings({ ...settings, hidden: !wasHidden });
    return wasHidden;
  })
    .then((wasHidden) => {
      if (wasHidden) void ensureEverywhere();
    })
    .catch(() => undefined);
});
