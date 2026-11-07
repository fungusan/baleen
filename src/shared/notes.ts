import { isExtension } from '../shared/settings';

/**
 * Reader notes: a small, editable key-value store shared by every tab and the popup. Keys name a
 * preference or a fact ("tone", "thesis"); values hold the text. Baleen reads them as context, but
 * never writes them: only the reader adds, edits or deletes an entry.
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
/** How much of the notes reaches a chat request, newest keys first. */
export const NOTES_BUDGET = 2400;

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
  for (const item of value.slice(0, MAX_NOTES)) {
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
  return notes;
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
    await store.set({ [NOTES_KEY]: notes.slice(0, MAX_NOTES) });
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

/** Upserts by key (case-insensitive), so editing a note replaces it instead of duplicating it. */
export async function saveNote(key: string, value: string): Promise<boolean> {
  const cleanKey = tidy(key, MAX_KEY);
  const cleanValue = tidy(value, MAX_VALUE);
  if (!cleanKey) return false;
  return enqueue(async () => {
    const notes = await readAll();
    const index = notes.findIndex((note) => note.key.toLowerCase() === cleanKey.toLowerCase());
    const next: NoteEntry = { key: cleanKey, value: cleanValue, at: Date.now() };
    if (!cleanValue) notes.splice(index, 1);
    else if (index >= 0) notes[index] = next;
    else notes.unshift(next);
    return writeAll(notes);
  });
}

export async function deleteNote(key: string): Promise<boolean> {
  const cleanKey = tidy(key, MAX_KEY);
  if (!cleanKey) return false;
  return enqueue(async () => {
    const notes = await readAll();
    return writeAll(
      notes.filter((note) => note.key.toLowerCase() !== cleanKey.toLowerCase()),
    );
  });
}

/**
 * The hidden line a reply appends when the reader asks Baleen to remember something. It is split
 * off before the reply reaches a chat, so the marker never renders.
 */
const NOTE_TAG = '[[BALEEN-NOTE]]';

export interface NoteDraft {
  key: string;
  value: string;
}

/** True when the reader's own message asks for something to be remembered. */
export function asksToRemember(prompt: unknown): boolean {
  if (typeof prompt !== 'string' || !prompt.trim()) return false;
  return /\b(?:remember|memorize|note|save|store|keep in mind|don'?t forget)\b/i.test(prompt);
}

/**
 * Separate a reply from its note directive. The marker is always removed from the visible answer,
 * even when the payload will not parse, so it can never leak into a chat or a transcript.
 */
export function takeNote(reply: string): { text: string; note: NoteDraft | null } {
  const at = reply.lastIndexOf(NOTE_TAG);
  if (at < 0) return { text: reply, note: null };
  const cleaned = reply.slice(0, at).trim();
  const tail = reply.slice(at + NOTE_TAG.length);
  const start = tail.indexOf('{');
  const end = tail.lastIndexOf('}');
  if (start < 0 || end <= start) return { text: cleaned || reply, note: null };
  try {
    const raw = JSON.parse(tail.slice(start, end + 1)) as Record<string, unknown>;
    const key = typeof raw.key === 'string' ? raw.key.replace(/\s+/g, ' ').trim() : '';
    const value = typeof raw.value === 'string' ? raw.value.trim() : '';
    if (!key || !value) return { text: cleaned || reply, note: null };
    return {
      text: cleaned || reply,
      note: { key: key.slice(0, MAX_KEY), value: value.slice(0, MAX_VALUE) },
    };
  } catch {
    return { text: cleaned || reply, note: null };
  }
}

/** Re-render a notes list when another surface (a page chat, another popup) writes one. */
export function watchNotes(listener: () => void): () => void {
  if (!isExtension() || !chrome.storage?.onChanged) return () => {};
  const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[NOTES_KEY]) listener();
  };
  chrome.storage.onChanged.addListener(onChange);
  return () => chrome.storage.onChanged.removeListener(onChange);
}

/** The notes block attached to conversational requests, bounded so a long list cannot crowd out
 * the page. Newest keys go first; each is rendered as one labelled entry. */
export function notesContext(notes: NoteEntry[]): string {
  const ordered = [...notes].sort((a, b) => b.at - a.at);
  const lines: string[] = [];
  let used = 0;
  for (const note of ordered) {
    const line = `${note.key}: ${note.value}`;
    if (used + line.length > NOTES_BUDGET) continue;
    lines.push(line);
    used += line.length + 1;
    if (used >= NOTES_BUDGET) break;
  }
  return lines.join('\n');
}
