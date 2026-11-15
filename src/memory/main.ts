import '../wiki/wiki.css';
import './memory.css';
import { readNotes, type NoteEntry } from '../shared/notes';
import { readSettings, watchSettings } from '../shared/settings';
import {
  canWrite,
  isVaultRoot,
  loadVault,
  pickVault,
  rememberVault,
  saveMemoryToVault,
} from '../wiki/vault';

const must = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

const vaultName = must('#vault-name');
const vaultLine = must('#vault-line');
const pick = must<HTMLButtonElement>('#pick');
const memoryStats = must('#memory-stats');
const statusNode = must('#status');
const saved = must('#saved');
const savedPath = must('#saved-path');
const savedNote = must('#saved-note');
const openVault = must<HTMLAnchorElement>('#open-vault');
const done = must<HTMLButtonElement>('#done');
const actions = must('#actions');
const save = must<HTMLButtonElement>('#save');

let notes: NoteEntry[] = [];
let vault: FileSystemDirectoryHandle | null = null;
let writing = false;

function reason(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function cancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function setStatus(text: string, tone: 'info' | 'error' = 'info') {
  statusNode.textContent = text;
  statusNode.dataset.tone = tone;
}

async function paintTheme() {
  const settings = await readSettings();
  const root = document.documentElement;
  if (settings.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
}

function paintVault() {
  vaultName.textContent = vault?.name ?? 'No vault chosen';
  vaultLine.textContent = vault ? 'Baleen/memory.md' : 'Pick the same folder you use for Wiki.';
  pick.hidden = !vault;
  save.textContent = writing ? 'Saving…' : vault ? 'Save to vault' : 'Choose vault';
  save.disabled = writing;
}

async function write() {
  if (writing) return;
  writing = true;
  paintVault();
  setStatus('Writing Baleen/memory.md…');
  try {
    if (!vault) {
      vault = await pickVault();
      await rememberVault(vault);
    }
    if (!(await canWrite(vault, true)))
      throw new Error('Baleen needs permission to write in that folder.');
    savedPath.textContent = await saveMemoryToVault(vault, notes);
    saved.hidden = false;
    actions.hidden = true;
    setStatus('');
    const root = await isVaultRoot(vault);
    openVault.hidden = !root;
    if (root) {
      openVault.href = `obsidian://open?vault=${encodeURIComponent(vault.name)}&file=${encodeURIComponent('Baleen/memory')}`;
      savedNote.textContent = 'Obsidian may ask once before opening the vault.';
    } else {
      savedNote.textContent =
        'This folder is not an Obsidian vault root; open memory.md from Obsidian yourself.';
    }
  } catch (error) {
    actions.hidden = false;
    if (cancelled(error)) setStatus('No folder chosen.');
    else setStatus(reason(error), 'error');
  } finally {
    writing = false;
    paintVault();
  }
}

pick.onclick = () => {
  void (async () => {
    try {
      const picked = await pickVault();
      vault = picked;
      await rememberVault(picked);
      paintVault();
      setStatus('Press Save to write Baleen/memory.md.');
      save.focus();
    } catch (error) {
      if (!cancelled(error)) setStatus(reason(error), 'error');
    }
  })();
};
save.onclick = () => void write();
done.onclick = () => window.close();

async function init() {
  await paintTheme();
  watchSettings(() => void paintTheme());
  notes = await readNotes();
  memoryStats.textContent = notes.length
    ? `${notes.length} ${notes.length === 1 ? 'entry' : 'entries'} will be written.`
    : 'Nothing is remembered yet; the file will say so.';
  vault = await loadVault();
  paintVault();
  if (vault && (await canWrite(vault, false))) await write();
  else if (vault) setStatus('Press Save to allow writing in this folder.');
}

void init();
