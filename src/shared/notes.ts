import { isExtension } from '../shared/settings';

/**
 * Baleen's memory: one editable key-value store shared by every tab and the popup. She writes an
 * entry when the reader asks her to remember something, or when their own messages reveal a durable
 * preference, interest, goal, or personal fact. A value may hold a paragraph of related details.
 */
export interface NoteEntry {
  key: string;
  value: string;
  at: number;
}

const NOTES_KEY = 'fungusan-gal.notes.v2';
const MAX_NOTES = 100;
const MAX_KEY = 60;
const MAX_VALUE = 2000;
/** How much of the memory reaches a chat request, newest keys first. */
export const NOTES_BUDGET = 3000;

const storage = () =>
  isExtension() && typeof chrome !== 'undefined' && chrome.storage?.local
    ? chrome.storage.local
    : null;

function tidy(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max)
    : '';
}

function entriesFrom(value: unknown): NoteEntry[] {
  if (!Array.isArray(value)) return [];
  const notes: NoteEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const note = item as Partial<NoteEntry>;
    const key = tidy(note.key, MAX_KEY);
    const text = tidy(note.value, MAX_VALUE);
    if (!key || !text) continue;
    notes.push({
      key,
      value: text,
      at: typeof note.at === 'number' && Number.isFinite(note.at) ? note.at : 0,
    });
  }
  // Earlier builds kept reader notes and learned memory in two lists; they are one now, so the
  // newest entry wins when the same key existed in both.
  notes.sort((a, b) => b.at - a.at);
  const seen = new Set<string>();
  return notes
    .filter((note) => {
      const lower = note.key.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    })
    .slice(0, MAX_NOTES);
}

async function readAll(): Promise<NoteEntry[]> {
  const store = storage();
  if (!store) return [];
  try {
    return entriesFrom((await store.get(NOTES_KEY))[NOTES_KEY]);
  } catch {
    return [];
  }
}

async function writeAll(notes: NoteEntry[]): Promise<boolean> {
  const store = storage();
  if (!store) return false;
  try {
    const next = [...notes].sort((a, b) => b.at - a.at).slice(0, MAX_NOTES);
    await store.set({ [NOTES_KEY]: next });
    return true;
  } catch {
    return false;
  }
}

// Read-modify-write is serialized in this tab; storage itself is shared by every tab.
let writes: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const job = writes.catch(() => undefined).then(operation);
  writes = job;
  return job;
}

export function readNotes(): Promise<NoteEntry[]> {
  return readAll();
}

/** Upserts by key (case-insensitive), so editing or re-learning replaces instead of duplicating. */
export async function saveNote(key: string, value: string): Promise<boolean> {
  const cleanKey = tidy(key, MAX_KEY);
  const cleanValue = tidy(value, MAX_VALUE);
  if (!cleanKey) return false;
  return enqueue(async () => {
    const notes = await readAll();
    const index = notes.findIndex((note) => note.key.toLowerCase() === cleanKey.toLowerCase());
    const next: NoteEntry = { key: cleanKey, value: cleanValue, at: Date.now() };
    if (!cleanValue) {
      if (index >= 0) notes.splice(index, 1);
    } else if (index >= 0) notes[index] = next;
    else notes.unshift(next);
    return writeAll(notes);
  });
}

export async function deleteNote(key: string): Promise<boolean> {
  const cleanKey = tidy(key, MAX_KEY);
  if (!cleanKey) return false;
  return enqueue(async () => {
    const notes = await readAll();
    return writeAll(notes.filter((note) => note.key.toLowerCase() !== cleanKey.toLowerCase()));
  });
}

export interface MergeReport {
  added: number;
  updated: number;
}

/**
 * An import merges instead of replacing: a key in the file is taken only when its copy is newer,
 * so importing an old file cannot silently undo something learned since.
 */
export async function mergeNotes(entries: NoteEntry[]): Promise<MergeReport> {
  return enqueue(async () => {
    const incoming = entriesFrom(entries);
    const report: MergeReport = { added: 0, updated: 0 };
    if (!incoming.length) return report;
    const current = await readAll();
    const byKey = new Map(current.map((note) => [note.key.toLowerCase(), note]));
    for (const note of incoming) {
      const key = note.key.toLowerCase();
      const existing = byKey.get(key);
      if (existing && note.at < existing.at) continue;
      if (existing) report.updated += 1;
      else report.added += 1;
      byKey.set(key, note);
    }
    await writeAll([...byKey.values()]);
    return report;
  });
}

export interface NoteDraft {
  key: string;
  value: string;
}

/**
 * The hidden final line a reply may carry. It is split off before the reply reaches a chat, so the
 * marker can never render.
 */
export interface TakenNote {
  text: string;
  note: NoteDraft | null;
}

function parseDraft(raw: string): NoteDraft | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const key = typeof value.key === 'string' ? value.key.replace(/\s+/g, ' ').trim() : '';
    const text = typeof value.value === 'string' ? value.value.trim() : '';
    if (!key || !text) return null;
    return { key: key.slice(0, MAX_KEY), value: text.slice(0, MAX_VALUE) };
  } catch {
    return null;
  }
}

const MARKER = /\[\[\s*BALEEN-(?:NOTE|MEMORY)\s*\]\]/gi;
/** Only whitespace, a Markdown wrapper, or a code fence may sit between the marker and its JSON. */
const MARKER_GAP = /^[\s`~*_]*(?:json)?[\s`~*_]*$/i;

/** The end of the first balanced JSON object after `from`, or -1 when there is none. */
function jsonEndAt(text: string, from: number): number {
  const start = text.indexOf('{', from);
  if (start < 0 || start - from > 4000) return -1;
  if (!MARKER_GAP.test(text.slice(from, start))) return -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') depth += 1;
    else if (char === '}' && (depth -= 1) === 0) return index + 1;
  }
  return -1;
}

export function takeNote(reply: string): TakenNote {
  let note: NoteDraft | null = null;
  let text = reply;
  MARKER.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKER.exec(text))) {
    const after = MARKER.lastIndex;
    const end = jsonEndAt(text, after);
    let draft: NoteDraft | null = null;
    if (end > 0) draft = parseDraft(text.slice(after, end));
    let start = match.index;
    if (draft) {
      // A bullet, bold wrapper, or fence around the marker is part of the hidden line too.
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      if (/^[ \t]*(?:[-*+][ \t]+|[*_`]{1,3}[ \t]*)*$/.test(text.slice(lineStart, start)))
        start = lineStart;
      let cut = end;
      // Trailing punctuation the model added after the object belongs to the hidden line.
      const tail = text.slice(cut).match(/^[ \t]*[.。,;:!?]/);
      if (tail) cut += tail[0].length;
      if (!note) note = draft;
      text = `${text.slice(0, start)}${text.slice(cut)}`;
      MARKER.lastIndex = start;
    } else {
      // An unreadable marker is still hidden so it cannot leak into the chat.
      text = `${text.slice(0, start)}${text.slice(after)}`;
      MARKER.lastIndex = start;
    }
  }
  if (!note) return { text: text.trim(), note };
  return {
    text: text
      .replace(/^[ \t]*(?:```|~~~)[a-z0-9-]*[ \t]*$/gim, '')
      .replace(/^[ \t]*[-*+][ \t]*$/gm, '')
      .replace(/^[ \t]*[*_`]{1,3}[ \t]*$/gm, '')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    note,
  };
}

/** Re-render the notes list when another surface (a page chat, another popup) writes one. */
export function watchNotes(listener: () => void): () => void {
  if (!isExtension() || !chrome.storage?.onChanged) return () => {};
  const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[NOTES_KEY]) listener();
  };
  chrome.storage.onChanged.addListener(onChange);
  return () => chrome.storage.onChanged.removeListener(onChange);
}

/**
 * The memory block attached to conversational requests, bounded so a long list cannot crowd out the
 * page. Newest keys first; `contextBlock` supplies the surrounding label.
 */
export function notesContext(notes: NoteEntry[]): string {
  const ordered = [...notes].sort((a, b) => b.at - a.at);
  const lines: string[] = [];
  let used = 0;
  for (const note of ordered) {
    const line = `- ${note.key}: ${note.value.replace(/\s*\n\s*/g, ' ')}`;
    const room = NOTES_BUDGET - used;
    if (room <= 1) break;
    if (line.length + 1 <= room) {
      lines.push(line);
      used += line.length + 1;
      continue;
    }
    // A single long entry is clipped rather than dropped: the key still carries the context.
    lines.push(`${line.slice(0, room - 2).trimEnd()}\u2026`);
    break;
  }
  return lines.join('\n');
}
