import type { NoteEntry } from '../shared/notes';
import type { PreviousPage, PreviousState, RenderResult } from '../shared/wiki';

/**
 * Writes compiled pages into a folder the reader picks once. No Obsidian plugin, server, or API
 * key is involved; the file handle is remembered so later compiles skip the picker.
 */

const DB_NAME = 'baleen-wiki';
const STORE = 'vault';

type PermissionDescription = { mode: 'read' | 'readwrite' };
type PermissionAnswer = 'granted' | 'denied' | 'prompt';
type PermissionHandle = FileSystemDirectoryHandle & {
  queryPermission?: (description: PermissionDescription) => Promise<PermissionAnswer>;
  requestPermission?: (description: PermissionDescription) => Promise<PermissionAnswer>;
};

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function loadVault(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await withStore<FileSystemDirectoryHandle | undefined>('readonly', (store) =>
      store.get('vault'),
    );
    return handle ?? null;
  } catch {
    return null;
  }
}

export async function rememberVault(handle: FileSystemDirectoryHandle): Promise<void> {
  await withStore('readwrite', (store) => store.put(handle, 'vault'));
}

interface PickerWindow extends Window {
  showDirectoryPicker?: (options: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: string;
  }) => Promise<FileSystemDirectoryHandle>;
}

/** The picker must run inside the click that asked for it. */
export async function pickVault(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error('This browser cannot open a folder.');
  return picker({ id: 'baleen-vault', mode: 'readwrite', startIn: 'documents' });
}

export async function canWrite(
  handle: FileSystemDirectoryHandle,
  request: boolean,
): Promise<boolean> {
  const scoped = handle as PermissionHandle;
  if (!scoped.queryPermission) return true;
  if ((await scoped.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  if (!request || !scoped.requestPermission) return false;
  return (await scoped.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export async function isVaultRoot(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    await handle.getDirectoryHandle('.obsidian');
    return true;
  } catch {
    return false;
  }
}

async function readFile(handle: FileSystemFileHandle): Promise<string | null> {
  try {
    return await (await handle.getFile()).text();
  } catch {
    return null;
  }
}

async function readIfExists(
  folder: FileSystemDirectoryHandle,
  name: string,
): Promise<string | null> {
  try {
    return await readFile(await folder.getFileHandle(`${name}.md`));
  } catch {
    return null;
  }
}

async function writeText(
  folder: FileSystemDirectoryHandle,
  name: string,
  text: string,
): Promise<void> {
  const file = await folder.getFileHandle(`${name}.md`, { create: true });
  const writable = await file.createWritable();
  await writable.write(text);
  await writable.close();
}

function field(text: string, key: string): string | undefined {
  const match = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(text);
  if (!match) return undefined;
  const value = match[1].trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

function historyOf(text: string): string[] {
  const at = text.lastIndexOf('## Revision history');
  if (at < 0) return [];
  return text
    .slice(at)
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function listOf(text: string, key: string): string[] {
  // A list item has a space after its dash; without one, a closing "---" fence reads as a list item.
  const match = new RegExp(`^${key}:\\s*\\n((?:[ \\t]*-[ \\t][^\\n]*\\n?)+)`, 'm').exec(text);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map((line) => line.replace(/^[ \t]*-\s*/, '').trim())
    .map((value) => {
      if (value.startsWith('"') && value.endsWith('"')) {
        try {
          return JSON.parse(value) as string;
        } catch {
          return value.slice(1, -1);
        }
      }
      return value;
    })
    .filter(Boolean);
}

/** The page text without frontmatter, heading, warning, history, or footnote definitions. */
function bodyOf(text: string): { body: string; footnotes: string } {
  const cleaned = text.replace(/^---\n[\s\S]*?\n---\n?/, '').trimStart();
  const plain = cleaned.replace(/^#\s+.*\n+/, '').trimStart();
  const start = plain.replace(/^>\s*\[!warning\][^\n]*\n(?:>[^\n]*\n)*\n?/, '').trimStart();
  const at = start.lastIndexOf('## Revision history');
  const body = (at >= 0 ? start.slice(0, at) : start).trim();
  const after = at >= 0 ? start.slice(at) : '';
  const footnotes = after
    .split('\n')
    .filter((line) => /^\[\^[^\]]+\]:/.test(line))
    .join('\n');
  return { body, footnotes };
}

/** The page as an earlier compile left it; the session's cumulative state reuses this parser. */
export function parsePageState(text: string): PreviousPage {
  const { body, footnotes } = bodyOf(text);
  return {
    revision: Number(field(text, 'revision') ?? '0') || 0,
    created: field(text, 'created') ?? '',
    history: historyOf(text),
    aliases: listOf(text, 'aliases'),
    sources: listOf(text, 'sources'),
    body,
    footnotes,
  };
}

/** True when a file is not ours to replace: a hand-written page, or one the reader has reviewed. */
function userOwned(text: string): boolean {
  return !/^generated:\s*true\s*$/m.test(text) || /^review:\s*reviewed\s*$/m.test(text);
}

async function markdownFiles(folder: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  const iterable = folder as unknown as {
    entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  };
  if (!iterable.entries) return names;
  for await (const [name, handle] of iterable.entries())
    if (handle.kind === 'file' && name.endsWith('.md')) names.push(name);
  return names;
}

export interface PreviousRead {
  state: PreviousState;
  /** Files that belong to the reader; the writer must leave them alone. */
  owned: Set<string>;
  /** Pages this folder's index.md lists and whose concept file still exists. */
  pages: IndexPage[];
}

export interface IndexPage {
  title: string;
  summary: string;
  aliases?: string[];
  body?: string;
}

/** The index is the folder's page registry: it decides what the next compile merges with. */
function indexPages(text: string): IndexPage[] {
  const out: IndexPage[] = [];
  const sections = text.split(/^## /m).filter((section) => /^Concepts\b/.test(section));
  for (const section of sections) {
    for (const line of section.split('\n').slice(1)) {
      const match = /^\s*-\s*\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\](?:\s*[\u2014-]\s*(.*))?$/.exec(line);
      if (!match) continue;
      const title = match[1].trim();
      const summary = (match[2] ?? '').replace(/\s+/g, ' ').trim();
      if (title && !out.some((page) => page.title.toLowerCase() === title.toLowerCase()))
        out.push({ title, summary });
    }
  }
  return out;
}

/** What an earlier compile left in this page's folder, so revisions continue instead of restarting. */
export async function readPrevious(folder: FileSystemDirectoryHandle): Promise<PreviousRead> {
  const state: PreviousState = { concepts: {} };
  const owned = new Set<string>();
  const present = new Map<string, string>();
  const written = new Set<string>();
  const byFile = new Map<string, PreviousPage>();
  for (const dirName of ['concepts', 'context', 'sources']) {
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await folder.getDirectoryHandle(dirName);
    } catch {
      continue;
    }
    for (const name of await markdownFiles(dir)) {
      const handle = await dir.getFileHandle(name);
      const text = await readFile(handle);
      if (text == null) continue;
      const fileTitle = name.replace(/\.md$/, '');
      const mine = !userOwned(text);
      if (!mine) owned.add(`${dirName}/${name}`);
      const title = field(text, 'title') ?? fileTitle;
      if (dirName === 'concepts') {
        state.concepts[title] = parsePageState(text);
        present.set(fileTitle.toLowerCase(), fileTitle);
        byFile.set(fileTitle.toLowerCase(), state.concepts[title]);
        if (mine) written.add(fileTitle.toLowerCase());
      } else if (dirName === 'context') state.context = parsePageState(text);
      else {
        const parsed = parsePageState(text);
        state.sources ??= {};
        state.sources[title] = parsed;
        if (!state.source || (parsed.revision ?? 0) >= state.source.revision) {
          state.source = parsed;
          const hash = field(text, 'sha256');
          if (hash) state.sourceHash = hash;
        }
      }
    }
  }
  const index = await readIfExists(folder, 'index');
  const listed = index ? indexPages(index) : [];
  const known = new Set(listed.map((page) => page.title.toLowerCase()));
  const withText = (page: IndexPage): IndexPage => {
    const earlier = byFile.get(page.title.toLowerCase());
    return earlier
      ? { ...page, aliases: earlier.aliases, body: earlier.body }
      : page;
  };
  const pages = listed.filter((page) => present.has(page.title.toLowerCase())).map(withText);
  // A generated page that fell out of the index is still part of this wiki. Adopt it rather
  // than abandon it, so a later compile keeps it listed and never sweeps it away.
  for (const [key, title] of present)
    if (!known.has(key) && written.has(key)) pages.push(withText({ title, summary: 'from an earlier compile.' }));
  return { state, owned, pages };
}

export interface EarlierRead {
  pages: IndexPage[];
  state: PreviousState;
}

/** What a page folder already holds, without creating anything in the vault. */
export async function readExistingPages(
  vault: FileSystemDirectoryHandle,
  name: string,
): Promise<EarlierRead> {
  try {
    const root = await vault.getDirectoryHandle('Baleen');
    const folder = await root.getDirectoryHandle(name || 'Untitled page');
    const read = await readPrevious(folder);
    return { pages: read.pages, state: read.state };
  } catch {
    return { pages: [], state: { concepts: {} } };
  }
}

export interface WriteReport {
  folderPath: string;
  written: string[];
  skipped: string[];
  left: string[];
}

/** The page's own folder inside `Baleen/`, so two readings never overwrite each other. */
export async function pageFolder(
  vault: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle> {
  const root = await vault.getDirectoryHandle('Baleen', { create: true });
  return root.getDirectoryHandle(name || 'Untitled page', { create: true });
}

export async function writeWiki(
  folder: FileSystemDirectoryHandle,
  result: RenderResult,
  keep: string[] = [],
): Promise<WriteReport> {
  const dirs = new Map<string, FileSystemDirectoryHandle>();
  const dirFor = async (name: string) => {
    let dir = dirs.get(name);
    if (!dir) {
      dir = await folder.getDirectoryHandle(name, { create: true });
      dirs.set(name, dir);
    }
    return dir;
  };
  const written: string[] = [];
  const skipped: string[] = [];
  for (const file of result.files) {
    const target = file.dir ? await dirFor(file.dir) : folder;
    const path = `${file.dir ? `${file.dir}/` : ''}${file.name}.md`;
    const existing = await readIfExists(target, file.name);
    if (existing != null && userOwned(existing)) {
      skipped.push(path);
      continue;
    }
    await writeText(target, file.name, file.content);
    written.push(path);
  }
  // Nothing is deleted. A generated file this compile did not produce is reported, never
  // removed, so the reader can review it in Obsidian and decide what to do with it.
  const kept = new Set(keep.map((title) => title.toLowerCase()));
  const left: string[] = [];
  for (const dirName of ['concepts', 'context', 'sources']) {
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await folder.getDirectoryHandle(dirName);
    } catch {
      continue;
    }
    const produced = new Set(
      result.files.filter((file) => file.dir === dirName).map((file) => `${file.name}.md`),
    );
    for (const name of await markdownFiles(dir)) {
      if (produced.has(name)) continue;
      if (dirName === 'concepts' && kept.has(name.replace(/\.md$/, '').toLowerCase())) continue;
      const handle = await dir.getFileHandle(name);
      const text = await readFile(handle);
      if (text == null || userOwned(text)) continue;
      left.push(`${dirName}/${name}`);
    }
  }
  const log = (await readIfExists(folder, 'log')) ?? '# Log\n';
  const extras: string[] = [];
  if (skipped.length) extras.push(`- left alone: ${skipped.join('; ')}`);
  if (left.length) extras.push(`- left in place: ${left.join('; ')}`);
  const entry = extras.length
    ? `${result.logEntry.trimEnd()}\n${extras.join('\n')}\n`
    : result.logEntry;
  await writeText(folder, 'log', `${log.trimEnd()}\n\n${entry}`);
  written.push('log.md');
  return { folderPath: `Baleen/${result.folder}`, written, skipped, left };
}

function dayStamp(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function memoryMarkdown(notes: NoteEntry[], date: string): string {
  const lines = [
    '---',
    'type: memory',
    'generated: true',
    'generator: baleen',
    `updated: ${date}`,
    `entries: ${notes.length}`,
    '---',
    '',
    '# Baleen memory',
    '',
    `A copy of what Baleen remembers on this device, written ${date}. Baleen keeps reading her own copy; editing this file does not change it, and the next save replaces this file.`,
    '',
  ];
  if (!notes.length) lines.push('_Nothing remembered yet._');
  for (const note of notes) {
    const key = note.key.replace(/([\\`*_\[\]<>])/g, '\\$1');
    lines.push(`- **${key}** — ${note.value.replace(/\r?\n/g, '\n  ')}`);
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** One readable Markdown file beside the wiki folders, overwritten on each save. */
export async function saveMemoryToVault(
  vault: FileSystemDirectoryHandle,
  notes: NoteEntry[],
): Promise<string> {
  const root = await vault.getDirectoryHandle('Baleen', { create: true });
  await writeText(root, 'memory', memoryMarkdown(notes, dayStamp()));
  return 'Baleen/memory.md';
}
