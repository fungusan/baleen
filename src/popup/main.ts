import './popup.css';
import { renderMarkdown } from '../content/render/markdown';
import { clearApiKey, normalizeApiKey, readApiKey, writeApiKey } from '../shared/key';
import { readSettings, watchSettings } from '../shared/settings';
import { deleteNote, readNotes, saveNote, watchNotes, type NoteEntry } from '../shared/notes';
import { DEEPSEEK_MODELS } from '../shared/types';
import type { DeepSeekModel, Settings, SettingsPatch, Theme } from '../shared/types';

const must = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const app = must('#app');
const version =
  typeof chrome !== 'undefined' && typeof chrome.runtime?.getManifest === 'function'
    ? chrome.runtime.getManifest().version
    : '';
const HIDDEN_HINT = 'Hidden on every page. Inline chat still works.';
const VISIBLE_HINT = 'Shown on every page. Drag her to move.';
const MODEL_SHORT: Record<DeepSeekModel, string> = {
  'deepseek-flash': 'Flash',
  'deepseek-v4-pro': 'V4 Pro',
};
const modelOptionsHTML = DEEPSEEK_MODELS.map(
  (id) =>
    `<button type="button" role="option" class="drop-option" data-model="${id}" aria-selected="false"><span>${MODEL_SHORT[id]}</span><span class="drop-meta">${id === 'deepseek-flash' ? 'Fast' : 'Stronger'}</span></button>`,
).join('');
app.innerHTML = `<header class="top"><img id="portrait" class="portrait" src="icons/128.png" alt="" width="28" height="28"><div class="identity"><h1>Baleen</h1><p class="tagline">Reading companion, on every page.</p></div>${version ? `<span class="menu-version">v${version}</span>` : ''}</header>
<main id="view-main" class="view">
<div class="rows">
<p class="group-label">Appearance</p>
<div class="row"><span class="label" id="theme-label">Theme</span><div class="seg" id="theme" role="radiogroup" aria-labelledby="theme-label"><label><input type="radio" name="theme" value="system"><span>System</span></label><label><input type="radio" name="theme" value="light"><span>Light</span></label><label><input type="radio" name="theme" value="dark"><span>Dark</span></label></div></div>
<div class="row"><span class="label" id="visible-label">Show on pages</span><button id="visible" class="switch" type="button" role="switch" aria-checked="true" aria-labelledby="visible-label" title="${VISIBLE_HINT}"></button></div>
<div class="row slider"><label class="label" for="scale">Size</label><output id="size-label" class="value" for="scale">100%</output><input id="scale" type="range" min="0.6" max="1.6" step="0.1" value="1"></div>
<div class="row"><span class="label" id="animate-label">Animate</span><button id="animate" class="switch" type="button" role="switch" aria-checked="true" aria-labelledby="animate-label"></button></div>
<p class="group-label">Connection</p>
<div class="row duo">
<div class="cell"><span class="label" id="key-label">DeepSeek API key</span><button id="key-edit" class="text-button" type="button" aria-labelledby="key-label" aria-expanded="false">Add</button></div>
<div class="cell"><span class="label" id="model-label">Model</span><div class="dropdown" id="model-dropdown"><button id="model-button" class="drop-button" type="button" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="model-label"><span id="model-value">Flash</span></button><div id="model-menu" class="drop-menu" role="listbox" aria-labelledby="model-label" hidden>${modelOptionsHTML}</div></div></div>
</div>
<form id="key-form" class="key-form" hidden><label class="sr-only" for="key-input">DeepSeek API key</label><div class="key-line"><input id="key-input" type="password" autocomplete="off" spellcheck="false" placeholder="sk-…"><button type="submit" class="primary">Save</button></div><div class="key-foot"><p class="hint" id="key-hint">Stored on this device. Sent only to api.deepseek.com when you ask.</p><button type="button" id="key-cancel" class="text-button">Cancel</button><button type="button" id="key-remove" class="text-button" hidden>Remove</button></div></form>
<p class="group-label">Reading</p>
<button id="study-open" class="submenu" type="button" aria-controls="view-study"><span class="trigger-label">Study</span><span id="study-hint" class="trigger-hint">Page tools &amp; notes</span><span class="chev" aria-hidden="true"></span></button>
</div>
</main>
<main id="view-study" class="view" hidden>
<div class="view-head"><button id="study-back" class="back" type="button" aria-label="Back to settings"><span class="chev" aria-hidden="true"></span>Back</button><span class="view-title">Study</span></div>
<div class="actions"><button id="study-keywords" class="primary" type="button">Keywords</button><button id="study-summarize" class="primary" type="button">Summarize</button></div>
<p id="study-status" class="hint" role="status">Reads the page on the tab you are on.</p>
<div id="study-result" class="result" hidden></div>
<div class="actions end"><button id="export-chats" class="text-button" type="button">Export chats</button><button id="close-chats" class="text-button" type="button">Close all chats</button></div>
<p class="group-label notes-label">Notes</p>
<form id="note-form" class="note-form"><div class="note-line"><label class="sr-only" for="note-key">Note key</label><input id="note-key" type="text" maxlength="60" autocomplete="off" spellcheck="false" placeholder="Key"><label class="sr-only" for="note-value">Note value</label><input id="note-value" type="text" maxlength="2000" autocomplete="off" spellcheck="false" placeholder="Value"></div><div class="actions"><button id="note-save" class="primary" type="submit">Add note</button><button id="note-cancel" class="text-button" type="button" hidden>Cancel</button></div></form>
<ul id="note-list" class="notes"></ul>
<p id="notes-empty" class="hint">Notes travel with your chats as reference. Ask Baleen to remember something and it lands here.</p>
</main>
<p id="status" role="status"></p>
<footer><span>Alt/Option + Shift + G toggles</span><span class="links"><a href="https://fungusan.com/baleen/privacy" target="_blank" rel="noreferrer">Privacy</a><span class="sep" aria-hidden="true">·</span><a href="https://www.pixiv.net/en/artworks/148186519" target="_blank" rel="noreferrer" title="Character art by ZipZipPipe, based on 上善's whale-girl OC (CC BY-NC-SA 4.0)">Art: ZipZipPipe</a></span></footer>`;

async function main() {
  let settings = await readSettings();
  const status = (text: string, tone: 'info' | 'error' = 'info') => {
    const node = must('#status');
    node.textContent = text;
    node.dataset.tone = tone;
  };
  /**
   * A normal two-level menu: the settings stay on the first level, and Study opens a second level
   * in the same window. Only an explicit click changes the view; nothing opens on hover.
   */
  const mainView = must<HTMLElement>('#view-main');
  const studyView = must<HTMLElement>('#view-study');
  const studyOpen = must<HTMLButtonElement>('#study-open');
  const studyBack = must<HTMLButtonElement>('#study-back');
  function showView(view: 'main' | 'study') {
    mainView.hidden = view !== 'main';
    studyView.hidden = view !== 'study';
    (view === 'study' ? studyBack : studyOpen).focus();
  }
  studyOpen.onclick = () => showView('study');
  studyBack.onclick = () => showView('main');
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || studyView.hidden) return;
    event.preventDefault();
    showView('main');
  });

  const themeGroup = must<HTMLDivElement>('#theme');
  const themeInputs = [...themeGroup.querySelectorAll<HTMLInputElement>('input[name="theme"]')];
  const systemScheme = matchMedia('(prefers-color-scheme: dark)');
  const systemLabel = themeInputs.find((input) => input.value === 'system')?.closest('label');
  /** The System option shows which scheme the device is on right now. */
  function paintSystemTitle() {
    if (systemLabel)
      systemLabel.title = `Follow your device (currently ${systemScheme.matches ? 'dark' : 'light'})`;
  }
  themeGroup.addEventListener('change', (event) => {
    const theme = (event.target as HTMLInputElement).value as Theme;
    if (theme === settings.theme) return;
    render({ ...settings, theme });
    void send({ theme }).catch((error) => {
      report(error);
      void readSettings().then(render);
    });
  });
  systemScheme.addEventListener('change', paintSystemTitle);
  async function send(patch: SettingsPatch) {
    const reply = (await chrome.runtime.sendMessage({ type: 'fg:update', patch })) as {
      ok?: boolean;
      error?: string;
    };
    if (!reply?.ok) throw new Error(reply?.error ?? 'Could not save. Reload the extension.');
  }
  /** Re-inject her into tabs whose content script an extension reload has orphaned. */
  function ensureTabs() {
    void chrome.runtime.sendMessage({ type: 'fg:ensure' }).catch(() => undefined);
  }
  function report(error: unknown) {
    status(error instanceof Error ? error.message : 'Could not save.', 'error');
  }
  /** Paint the track up to the thumb; the slider spans 0.6–1.6. */
  function paintScale() {
    const scale = must<HTMLInputElement>('#scale');
    scale.style.setProperty('--fill', `${((Number(scale.value) - 0.6) / 1) * 100}%`);
  }
  const dropdown = must('#model-dropdown');
  const modelButton = must<HTMLButtonElement>('#model-button');
  const modelMenu = must<HTMLElement>('#model-menu');
  const modelValue = must('#model-value');
  const modelChoices = [...modelMenu.querySelectorAll<HTMLButtonElement>('.drop-option')];
  function setModelOpen(open: boolean) {
    modelMenu.hidden = !open;
    modelButton.setAttribute('aria-expanded', String(open));
    if (!open) return;
    const selected = modelChoices.find((choice) => choice.getAttribute('aria-selected') === 'true');
    (selected ?? modelChoices[0])?.focus();
  }
  modelButton.onclick = () => setModelOpen(modelMenu.hidden);
  modelButton.onkeydown = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    setModelOpen(true);
  };
  modelMenu.onkeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setModelOpen(false);
      modelButton.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const index = modelChoices.indexOf(document.activeElement as HTMLButtonElement);
    modelChoices[(index + step + modelChoices.length) % modelChoices.length].focus();
  };
  for (const choice of modelChoices) {
    choice.onclick = () => {
      const model = choice.dataset.model as DeepSeekModel;
      setModelOpen(false);
      modelButton.focus();
      if (model === settings.model) return;
      render({ ...settings, model });
      void send({ model }).catch((error) => {
        report(error);
        void readSettings().then(render);
      });
    };
  }
  document.addEventListener('pointerdown', (event) => {
    if (!modelMenu.hidden && !dropdown.contains(event.target as Node)) setModelOpen(false);
  });
  function render(value: Settings) {
    settings = value;
    const root = document.documentElement;
    if (value.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = value.theme;
    for (const input of themeInputs) input.checked = input.value === value.theme;
    paintSystemTitle();
    const scale = must<HTMLInputElement>('#scale');
    scale.value = String(value.scale);
    must('#size-label').textContent = `${Math.round(value.scale * 100)}%`;
    paintScale();
    const visible = must<HTMLButtonElement>('#visible');
    visible.setAttribute('aria-checked', String(!value.hidden));
    visible.title = value.hidden ? HIDDEN_HINT : VISIBLE_HINT;
    must('#animate').setAttribute('aria-checked', String(value.animate));
    modelValue.textContent = MODEL_SHORT[value.model];
    for (const choice of modelChoices)
      choice.setAttribute('aria-selected', String(choice.dataset.model === value.model));
  }
  const scale = must<HTMLInputElement>('#scale');
  scale.oninput = () => {
    must('#size-label').textContent = `${Math.round(Number(scale.value) * 100)}%`;
    paintScale();
  };
  scale.onchange = () => {
    void send({ scale: Number(scale.value) }).catch(report);
  };
  must<HTMLButtonElement>('#visible').onclick = () => {
    const hidden = !settings.hidden;
    render({ ...settings, hidden });
    void send({ hidden })
      .then(() => {
        if (!hidden) ensureTabs();
      })
      .catch((error) => {
        report(error);
        void readSettings().then(render);
      });
  };
  must<HTMLButtonElement>('#animate').onclick = () => {
    const animate = !settings.animate;
    render({ ...settings, animate });
    void send({ animate }).catch((error) => {
      report(error);
      void readSettings().then(render);
    });
  };

  /** Talk to the content script on the tab the popup was opened from. */
  async function pageCall<T>(message: Record<string, unknown>): Promise<T> {
    const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    const url = tab?.url ?? '';
    const ownPage = url.startsWith(chrome.runtime.getURL(''));
    if (!tab?.id || (!/^https?:/i.test(url) && !ownPage))
      throw new Error('Open a regular web page to use this.');
    const failing = (error: unknown) =>
      error instanceof Error && /Receiving end|Could not establish/i.test(error.message);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const reply = (await chrome.tabs.sendMessage(tab.id, message)) as
          | { ok?: boolean; data?: T; error?: string }
          | undefined;
        if (!reply?.ok) throw new Error(reply?.error ?? 'Baleen did not answer.');
        return reply.data as T;
      } catch (error) {
        if (!failing(error) || attempt === 2) {
          if (failing(error)) throw new Error('Reload this page, then try again.');
          throw error;
        }
        await chrome.runtime.sendMessage({ type: 'fg:ensure' }).catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    throw new Error('Reload this page, then try again.');
  }

  const studyStatus = must('#study-status');
  const studyResult = must<HTMLDivElement>('#study-result');
  const studyButtons = [
    must<HTMLButtonElement>('#study-keywords'),
    must<HTMLButtonElement>('#study-summarize'),
  ];
  async function study(action: 'keywords' | 'summarize') {
    for (const button of studyButtons) button.disabled = true;
    studyResult.hidden = true;
    studyStatus.textContent = action === 'keywords' ? 'Finding keywords…' : 'Summarizing…';
    try {
      const { text } = await pageCall<{ text: string }>({ type: 'fg:study', action });
      studyResult.replaceChildren(renderMarkdown(text));
      studyResult.hidden = false;
      studyStatus.textContent = 'Done.';
    } catch (error) {
      studyStatus.textContent =
        error instanceof Error ? error.message : 'Could not read this page.';
    } finally {
      for (const button of studyButtons) button.disabled = false;
    }
  }
  must<HTMLButtonElement>('#study-keywords').onclick = () => void study('keywords');
  must<HTMLButtonElement>('#study-summarize').onclick = () => void study('summarize');
  function downloadMarkdown(text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `baleen-chats-${new Date().toISOString().slice(0, 10)}.md`;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  must<HTMLButtonElement>('#export-chats').onclick = () => {
    void pageCall<{ text: string }>({ type: 'fg:export-chats' })
      .then(({ text }) => {
        if (!text) {
          studyStatus.textContent = 'No questions to export on this page yet.';
          return;
        }
        downloadMarkdown(text);
        studyStatus.textContent = 'Saved as Markdown.';
      })
      .catch((error) => {
        studyStatus.textContent =
          error instanceof Error ? error.message : 'Could not export.';
      });
  };
  must<HTMLButtonElement>('#close-chats').onclick = () => {
    void pageCall<{ count: number }>({ type: 'fg:close-chats' })
      .then(({ count }) => {
        studyStatus.textContent = count
          ? `Closed ${count} conversation${count === 1 ? '' : 's'}.`
          : 'No conversations were open.';
      })
      .catch((error) => {
        studyStatus.textContent =
          error instanceof Error ? error.message : 'Could not close chats.';
      });
  };

  const noteForm = must<HTMLFormElement>('#note-form');
  const noteKey = must<HTMLInputElement>('#note-key');
  const noteValue = must<HTMLInputElement>('#note-value');
  const noteSave = must<HTMLButtonElement>('#note-save');
  const noteCancel = must<HTMLButtonElement>('#note-cancel');
  const noteList = must<HTMLUListElement>('#note-list');
  const notesEmpty = must('#notes-empty');
  let editing: string | null = null;
  function noteRow(note: NoteEntry): HTMLLIElement {
    const row = document.createElement('li');
    const text = document.createElement('div');
    text.className = 'note-text';
    const key = document.createElement('strong');
    key.textContent = note.key;
    const value = document.createElement('p');
    value.textContent = note.value;
    text.append(key, value);
    const ops = document.createElement('div');
    ops.className = 'note-ops';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'text-button';
    edit.textContent = 'Edit';
    edit.onclick = () => startEdit(note);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'text-button';
    remove.textContent = 'Delete';
    remove.onclick = () => {
      void deleteNote(note.key)
        .then(() => {
          status('Note deleted.');
          return loadNotes();
        })
        .catch(report);
    };
    ops.append(edit, remove);
    row.append(text, ops);
    return row;
  }
  function startEdit(note: NoteEntry) {
    editing = note.key;
    noteKey.value = note.key;
    noteKey.disabled = true;
    noteValue.value = note.value;
    noteSave.textContent = 'Save note';
    noteCancel.hidden = false;
    noteValue.focus();
  }
  function stopEdit() {
    editing = null;
    noteKey.disabled = false;
    noteKey.value = '';
    noteValue.value = '';
    noteSave.textContent = 'Add note';
    noteCancel.hidden = true;
  }
  async function loadNotes() {
    const notes = await readNotes();
    noteList.replaceChildren(...notes.map(noteRow));
    notesEmpty.hidden = notes.length > 0;
    // The count on the Study row makes a saved note visible without opening the level.
    must('#study-hint').textContent = notes.length
      ? `Page tools · ${notes.length} note${notes.length === 1 ? '' : 's'}`
      : 'Page tools & notes';
    if (editing && !notes.some((note) => note.key === editing)) stopEdit();
  }
  noteForm.onsubmit = (event) => {
    event.preventDefault();
    const key = (editing ?? noteKey.value).trim();
    const value = noteValue.value.trim();
    if (!key) {
      status('Give the note a key first.', 'error');
      return;
    }
    if (!value && editing == null) {
      status('Give the note a value first.', 'error');
      return;
    }
    void saveNote(key, value)
      .then((saved) => {
        if (!saved) {
          status('Could not save that note.', 'error');
          return;
        }
        stopEdit();
        status(value ? 'Note saved.' : 'Note deleted.');
        return loadNotes();
      })
      .catch(report);
  };
  noteCancel.onclick = stopEdit;
  await loadNotes();
  // A note Baleen adds from a page chat appears here without reopening the popup.
  const unwatchNotes = watchNotes(() => void loadNotes());

  const keyForm = must<HTMLFormElement>('#key-form');
  const keyInput = must<HTMLInputElement>('#key-input');
  const keyEdit = must<HTMLButtonElement>('#key-edit');
  const keyRemove = must<HTMLButtonElement>('#key-remove');
  let apiKey = '';
  function showKeyForm(show: boolean) {
    keyForm.hidden = !show;
    keyEdit.setAttribute('aria-expanded', String(show));
    if (show) {
      keyInput.value = '';
      keyInput.focus();
    }
  }
  async function loadKey() {
    apiKey = await readApiKey();
    keyEdit.textContent = apiKey ? 'Replace' : 'Add';
    keyRemove.hidden = !apiKey;
    must('#key-hint').textContent = apiKey
      ? `Saved sk-…${apiKey.slice(-4)}. Sent only to api.deepseek.com when you ask.`
      : 'Stored on this device. Sent only to api.deepseek.com when you ask.';
  }
  keyEdit.onclick = () => showKeyForm(keyForm.hidden);
  must<HTMLButtonElement>('#key-cancel').onclick = () => showKeyForm(false);
  keyRemove.onclick = () => {
    void clearApiKey()
      .then(loadKey)
      .then(() => {
        showKeyForm(false);
        status('Key removed.');
      })
      .catch(report);
  };
  keyForm.onsubmit = (event) => {
    event.preventDefault();
    const key = normalizeApiKey(keyInput.value);
    if (!key) {
      status('That does not look like a DeepSeek key (sk-…).', 'error');
      return;
    }
    void writeApiKey(key)
      .then(loadKey)
      .then(() => {
        showKeyForm(false);
        status('Key saved.');
      })
      .catch(report);
  };
  const unwatch = watchSettings(render);
  render(await readSettings());
  // Inline chat runs without the character, so hidden pages still need a mounted content script.
  ensureTabs();
  await loadKey();
  window.addEventListener(
    'pagehide',
    () => {
      unwatch();
      unwatchNotes();
      systemScheme.removeEventListener('change', paintSystemTitle);
    },
    { once: true },
  );
}
void main().catch(() => {
  must('#status').textContent = 'Open this popup from the installed extension.';
});
