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

export function takeNote(reply: string): TakenNote {
  let note: NoteDraft | null = null;
  const kept: string[] = [];
  for (const line of reply.split('\n')) {
    // The memory marker is accepted too, so a reply from an older prompt still lands safely.
    const match = line.match(/^\s*\[\[BALEEN-(?:NOTE|MEMORY)\]\]\s*(\{.*\})\s*$/);
    if (!match) {
      kept.push(line);
      continue;
    }
    if (!note) note = parseDraft(match[1]);
  }
  let text = kept.join('\n').trim();
  // A provider that puts the marker mid-sentence still must never leak it into the chat.
  const leaked = text.search(/\[\[BALEEN-(?:NOTE|MEMORY)\]\]/);
  if (leaked >= 0) text = text.slice(0, leaked).trim();
  return { text, note };
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
