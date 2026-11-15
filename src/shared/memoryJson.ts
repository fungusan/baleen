import type { NoteEntry } from './notes';

/**
 * A portable memory file for Download and Import. It deliberately contains only memory: settings
 * live in the popup and API keys stay in storage, so a shared file can never carry a secret.
 */
const APP = 'baleen';
const KIND = 'memory';
const VERSION = 1;
const MAX_FILE = 2_000_000;

function day(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${date}`;
}

export function memoryDownload(notes: NoteEntry[]): { text: string; name: string } {
  return {
    text: `${JSON.stringify(
      {
        app: APP,
        kind: KIND,
        version: VERSION,
        exportedAt: new Date().toISOString(),
        notes,
      },
      null,
      2,
    )}\n`,
    name: `baleen-memory-${day()}.json`,
  };
}

/** Accepts this file and an older Baleen JSON backup, of which only the memory is read. */
export function parseMemoryJson(text: string): NoteEntry[] {
  if (text.length > MAX_FILE) throw new Error('That file is too large to be a memory file.');
  let value: { app?: unknown; notes?: unknown };
  try {
    value = JSON.parse(text) as { app?: unknown; notes?: unknown };
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!value || value.app !== APP || !Array.isArray(value.notes))
    throw new Error('That is not a Baleen memory file.');
  const notes: NoteEntry[] = [];
  for (const item of value.notes) {
    if (!item || typeof item !== 'object') continue;
    const note = item as Partial<NoteEntry>;
    if (typeof note.key !== 'string' || typeof note.value !== 'string') continue;
    notes.push({
      key: note.key,
      value: note.value,
      at: typeof note.at === 'number' && Number.isFinite(note.at) ? note.at : Date.now(),
    });
  }
  if (!notes.length) throw new Error('That file has no memory entries.');
  return notes;
}
