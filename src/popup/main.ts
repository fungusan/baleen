import './popup.css';
import { clearApiKey, keyPlaceholder, keyPreview, normalizeApiKey, readApiKey, writeApiKey } from '../shared/key';
import { readSettings, watchSettings } from '../shared/settings';
import { deleteNote, readNotes, saveNote, watchNotes, type NoteEntry } from '../shared/notes';
import { characterById, costumeFor, costumesFor } from '../shared/characters';
import { MODEL_META, MODEL_SHORT, PICKER_MODELS, PROVIDER_HOSTS, PROVIDER_LABELS, providerForModel } from '../shared/types';
import { modelIcon } from '../shared/modelIcon';
import type {
  CharacterId,
  ChatExportScope,
  Model,
  Provider,
  Settings,
  SettingsPatch,
  Theme,
} from '../shared/types';

const must = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const app = must('#app');
const version =
  typeof chrome !== 'undefined' && typeof chrome.runtime?.getManifest === 'function'
    ? chrome.runtime.getManifest().version
    : '';
const HIDDEN_HINT = 'Hidden on every page. Inline chat still works.';
const VISIBLE_HINT = 'Shown on every page. Drag her to move.';
const STUDY_HINT = 'Opens in a chat beside her, with no highlight.';
const modelOptionsHTML = PICKER_MODELS.map(
  (id) =>
    `<button type="button" role="option" class="drop-option" data-model="${id}" aria-selected="false"><span class="drop-name"><span class="model-glyph" aria-hidden="true">${modelIcon(id)}</span><span>${MODEL_SHORT[id]}</span></span><span class="drop-meta">${MODEL_META[id]}</span></button>`,
).join('');
app.innerHTML = `<header class="top"><img id="portrait" class="portrait" src="icons/128.png" alt="" width="28" height="28"><div class="identity"><h1>Baleen</h1><p class="tagline">Reading companion, on every page.</p></div>${version ? `<span class="version">v${version}</span>` : ''}</header>
<main id="view-main" class="view">
<p class="sec" id="appearance-label">Appearance</p>
<section class="card" aria-labelledby="appearance-label">
<div class="row"><span class="label" id="theme-label">Theme</span><div class="seg" id="theme" role="radiogroup" aria-labelledby="theme-label"><label><input type="radio" name="theme" value="system"><span>System</span></label><label><input type="radio" name="theme" value="light"><span>Light</span></label><label><input type="radio" name="theme" value="dark"><span>Dark</span></label></div></div>
<div class="row"><div class="row-pair"><span class="label" id="visible-label">Show on pages</span><button id="visible" class="switch" type="button" role="switch" aria-checked="true" aria-labelledby="visible-label" title="${VISIBLE_HINT}"></button></div><div class="row-pair"><span class="label" id="animate-label">Animate</span><button id="animate" class="switch" type="button" role="switch" aria-checked="true" aria-labelledby="animate-label"></button></div></div>
<div class="slider"><label class="label" for="scale">Size</label><output id="size-label" class="value" for="scale">100%</output><input id="scale" type="range" min="0.6" max="1.6" step="0.1" value="1"></div>
<div class="row" id="outfit-row" hidden><span class="label" id="outfit-label">Outfit</span><div class="seg" id="outfit" role="radiogroup" aria-labelledby="outfit-label"></div></div>
</section>
<p class="sec" id="connection-label">Connection</p>
<section class="card" aria-labelledby="connection-label">
<div class="row"><span class="label" id="key-label">API key</span><button id="key-edit" class="chip-button" type="button" aria-labelledby="key-label" aria-expanded="false">Add</button></div>
<form id="key-form" class="key-form" hidden><label class="sr-only" for="key-input">API key</label><div class="key-line"><input id="key-input" type="password" autocomplete="off" spellcheck="false" placeholder="sk-…"><button type="submit" class="primary">Save</button></div><div class="key-foot"><p class="hint" id="key-hint">Stored on this device. Sent only to the selected provider when you ask.</p><button type="button" id="key-cancel" class="text-button">Cancel</button><button type="button" id="key-remove" class="text-button" hidden>Remove</button></div></form>
<div class="row"><span class="label" id="model-label">Model</span><div class="dropdown" id="model-dropdown"><button id="model-button" class="field" type="button" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="model-label"><span id="model-icon" class="model-glyph" aria-hidden="true"></span><span id="model-value">DeepSeek V4 Pro</span><span class="chev" aria-hidden="true"></span></button><div id="model-menu" class="model-menu" role="listbox" aria-labelledby="model-label" hidden>${modelOptionsHTML}</div></div></div>
<button id="memory-open" class="row link-row" type="button" aria-controls="view-memory"><span class="label">Memory</span><span id="notes-count" class="count"></span><span class="chev" aria-hidden="true"></span></button>
</section>
<p class="sec">Reading</p>
<button id="study-open" class="study-row" type="button" aria-controls="view-study"><span class="booktile" aria-hidden="true"><svg viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.6C10.5 5.1 8.6 4.4 6 4.4H3.6v13.1H6c2.6 0 4.5.7 6 2.2 1.5-1.5 3.4-2.2 6-2.2h2.4V4.4H18c-2.6 0-4.5.7-6 2.2Z"/><path d="M12 6.6v13.1"/></g></svg></span><span class="study-text"><strong>Study</strong><small id="study-hint">Page tools &amp; chats</small></span><span class="chev" aria-hidden="true"></span></button>
</main>
<main id="view-memory" class="view" hidden>
<div class="view-head"><button id="memory-back" class="back" type="button"><span class="chev" aria-hidden="true"></span>Back</button><span class="view-title">Memory</span><button id="note-add" class="chip-button memory-add" type="button" aria-expanded="false" aria-controls="note-form">Add</button></div>
<form id="note-form" class="note-form" hidden><p id="note-form-title" class="note-form-title">New memory</p><div class="note-line"><label class="sr-only" for="note-key">Memory key</label><input id="note-key" type="text" maxlength="60" autocomplete="off" spellcheck="false" placeholder="Key"><label class="sr-only" for="note-value">Memory value</label><textarea id="note-value" rows="3" maxlength="2000" placeholder="Value — a line or a short paragraph"></textarea></div><div class="actions"><button id="note-save" class="primary" type="submit">Add memory</button><button id="note-cancel" class="text-button" type="button">Cancel</button></div></form>
<ul id="note-list" class="notes"></ul>
<div id="note-pager" class="notes-pager" hidden><button id="note-prev" class="text-button" type="button">Prev</button><span id="note-page" class="count"></span><button id="note-next" class="text-button" type="button">Next</button></div>
<p id="notes-empty" class="hint">Baleen remembers what you tell her.</p>
</main>
<main id="view-study" class="view" hidden>
<div class="view-head"><button id="study-back" class="back" type="button"><span class="chev" aria-hidden="true"></span>Back</button><span class="view-title">Study</span></div>
<button id="wiki-open" class="study-row" type="button"><span class="booktile" aria-hidden="true"><svg viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/><path d="M9 12h6M9 15.5h4"/></g></svg></span><span class="study-text"><strong>Wiki for Obsidian</strong><small>Compile this page into linked notes</small></span><span class="chev" aria-hidden="true"></span></button>
<div class="tools"><button id="study-summarize" class="chip-button" type="button">Summarize</button><button id="study-keywords" class="chip-button" type="button">Keywords</button></div>
<p id="study-status" class="hint" role="status">${STUDY_HINT}</p>
<p class="sec">Chats</p>
<section class="card list chat-menu" aria-label="Chats">
<div class="chat-group"><button id="reading-toggle" class="chat-toggle" type="button" aria-expanded="false" aria-controls="reading-actions"><span>Reading chat</span><span class="chev" aria-hidden="true"></span></button><div id="reading-actions" class="chat-actions" hidden><button id="export-talk" class="chat-action" type="button" aria-label="Export reading chat">Export</button><button id="clear-talk" class="chat-action" type="button" aria-label="Clear reading chat">Clear</button></div></div>
<div class="chat-group"><button id="study-toggle" class="chat-toggle" type="button" aria-expanded="false" aria-controls="study-actions"><span>Study chats</span><span class="chev" aria-hidden="true"></span></button><div id="study-actions" class="chat-actions" hidden><button id="export-chats" class="chat-action" type="button" aria-label="Export study chats">Export</button><button id="close-chats" class="chat-action" type="button" aria-label="Close study chats">Close</button></div></div>
</section>
</main>
<p id="status" role="status"></p>
<footer><span>Alt/Option + Shift + G toggles</span><span class="links"><a href="https://fungusan.com/baleen" target="_blank" rel="noreferrer">Privacy</a><span class="sep" aria-hidden="true">·</span><a href="https://www.pixiv.net/en/artworks/148186519" target="_blank" rel="noreferrer" title="Character art by ZipZipPipe, based on 上善's whale-girl OC (CC BY-NC-SA 4.0)">Art by ZipZipPipe</a></span></footer>`;

async function main() {
  let settings = await readSettings();
  const status = (text: string, tone: 'info' | 'error' = 'info') => {
    const node = must('#status');
    node.textContent = text;
    node.dataset.tone = tone;
  };
  /** Study and Memory each open one level deep; every preference lives on the main one. */
  const views = {
    main: must<HTMLElement>('#view-main'),
    study: must<HTMLElement>('#view-study'),
    memory: must<HTMLElement>('#view-memory'),
  };
  type ViewName = keyof typeof views;
  let currentView: ViewName = 'main';
  const studyOpen = must<HTMLButtonElement>('#study-open');
  const memoryOpen = must<HTMLButtonElement>('#memory-open');
  function showView(view: ViewName) {
    currentView = view;
    for (const [name, node] of Object.entries(views)) node.hidden = name !== view;
    setModelOpen(false);
    // A message about the previous level would be noise in this one.
    status('');
    // An old page error should not greet a fresh visit to Study.
    must('#study-status').textContent = STUDY_HINT;
  }
  const returnFocus = { study: studyOpen, memory: memoryOpen };
  function goBack() {
    if (currentView === 'main') return;
    const opener = returnFocus[currentView];
    showView('main');
    opener.focus();
  }
  studyOpen.onclick = () => {
    showView('study');
    // Keyboard users land on the way back out of the level they just opened.
    must<HTMLButtonElement>('#study-back').focus();
  };
  must<HTMLButtonElement>('#study-back').onclick = goBack;
  memoryOpen.onclick = () => {
    notePageIndex = 0;
    showView('memory');
    void loadNotes();
    must<HTMLButtonElement>('#memory-back').focus();
  };
  must<HTMLButtonElement>('#memory-back').onclick = () => {
    if (!noteForm.hidden) stopEdit(false);
    goBack();
  };
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!modelMenu.hidden) {
      event.preventDefault();
      setModelOpen(false);
      modelButton.focus();
      return;
    }
    // The composer is the innermost level, so Escape closes it before the page it sits on.
    if (!noteForm.hidden) {
      event.preventDefault();
      stopEdit();
      return;
    }
    if (currentView === 'main') return;
    event.preventDefault();
    goBack();
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
  const modelDropdown = must<HTMLElement>('#model-dropdown');
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
      const model = choice.dataset.model as Model;
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
    const target = event.target as Node;
    if (!modelMenu.hidden && !modelDropdown.contains(target)) setModelOpen(false);
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
    must('#model-icon').innerHTML = modelIcon(value.model);
    for (const choice of modelChoices)
      choice.setAttribute('aria-selected', String(choice.dataset.model === value.model));
    paintOutfits(value);
    void loadKey();
  }
  const outfitGroup = must<HTMLElement>('#outfit');
  const outfitRow = must<HTMLElement>('#outfit-row');
  let outfitModel: Model | null = null;
  /** The outfit row only exists for a model with several drawings. */
  function paintOutfits(value: Settings) {
    const ids = costumesFor(value.model);
    outfitRow.hidden = ids.length < 2;
    if (outfitModel !== value.model) {
      outfitModel = value.model;
      outfitGroup.innerHTML = ids
        .map(
          (id) =>
            `<label><input type="radio" name="outfit" value="${id}"><span>${characterById(id).label}</span></label>`,
        )
        .join('');
    }
    const selected = costumeFor(value.model, value.outfits);
    for (const input of outfitGroup.querySelectorAll<HTMLInputElement>('input'))
      input.checked = input.value === selected;
  }
  outfitGroup.onchange = (event) => {
    const id = (event.target as HTMLInputElement).value as CharacterId;
    const outfits = { ...settings.outfits, [settings.model]: id };
    render({ ...settings, outfits });
    void send({ outfits }).catch((error) => {
      report(error);
      void readSettings().then(render);
    });
  };
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
  const studyButtons = [
    must<HTMLButtonElement>('#study-keywords'),
    must<HTMLButtonElement>('#study-summarize'),
  ];
  async function study(action: 'keywords' | 'summarize') {
    for (const button of studyButtons) button.disabled = true;
    studyStatus.textContent = 'Opening on the page…';
    try {
      await pageCall({ type: 'fg:study', action });
      // The page now owns the chat, so the popup gets out of the way.
      window.close();
    } catch (error) {
      studyStatus.textContent =
        error instanceof Error ? error.message : 'Could not read this page.';
    } finally {
      for (const button of studyButtons) button.disabled = false;
    }
  }
  must<HTMLButtonElement>('#study-keywords').onclick = () => void study('keywords');
  must<HTMLButtonElement>('#study-summarize').onclick = () => void study('summarize');
  must<HTMLButtonElement>('#wiki-open').onclick = () => {
    void (async () => {
      const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      const url = tab?.url ?? '';
      const ownPage = url.startsWith(chrome.runtime.getURL(''));
      if (!tab?.id || (!/^https?:/i.test(url) && !ownPage)) {
        studyStatus.textContent = 'Open a regular web page to compile a wiki.';
        return;
      }
      try {
        const width = 420;
        const height = 360;
        const caller = await chrome.windows.getCurrent();
        const left = Math.round((caller.left ?? 0) + ((caller.width ?? width) - width) / 2);
        const top = Math.round((caller.top ?? 0) + ((caller.height ?? height) - height) / 2);
        const created = await chrome.windows.create({
          url: chrome.runtime.getURL(`wiki.html?tab=${tab.id}`),
          type: 'popup',
          width,
          height,
          left,
          top,
          focused: true,
        });
        // macOS ignores the size on create and copies the caller's bounds; only an
        // update that carries position and size resizes it.
        if (created?.id) {
          await chrome.windows.update(created.id, { state: 'normal', width, height, left, top });
        }
        window.close();
      } catch (error) {
        studyStatus.textContent =
          error instanceof Error ? error.message : 'Could not open the wiki window.';
      }
    })();
  };
  function downloadMarkdown(text: string, name: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}-${new Date().toISOString().slice(0, 10)}.md`;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  function exportChats(scope: ChatExportScope) {
    void pageCall<{ text: string }>({ type: 'fg:export-chats', scope })
      .then(({ text }) => {
        if (!text) {
          status(
            scope === 'talk'
              ? 'No reading chat to export yet.'
              : 'No study chats to export yet.',
          );
          return;
        }
        downloadMarkdown(text, scope === 'talk' ? 'baleen-reading-chat' : 'baleen-study-chats');
        status('Saved as Markdown.');
      })
      .catch((error) => {
        status(error instanceof Error ? error.message : 'Could not export.', 'error');
      });
  }
  must<HTMLButtonElement>('#export-talk').onclick = () => exportChats('talk');
  must<HTMLButtonElement>('#export-chats').onclick = () => exportChats('study');
  must<HTMLButtonElement>('#clear-talk').onclick = () => {
    void pageCall<{ count: number }>({ type: 'fg:clear-talk' })
      .then(({ count }) => {
        status(count ? 'Reading chat cleared.' : 'The reading chat is already empty.');
      })
      .catch((error) => {
        status(
          error instanceof Error ? error.message : 'Could not clear the reading chat.',
          'error',
        );
      });
  };
  must<HTMLButtonElement>('#close-chats').onclick = () => {
    void pageCall<{ count: number }>({ type: 'fg:close-chats' })
      .then(({ count }) => {
        status(
          count
            ? `Closed ${count} study chat${count === 1 ? '' : 's'}.`
            : 'No study chats were open.',
        );
      })
      .catch((error) => {
        status(error instanceof Error ? error.message : 'Could not close study chats.', 'error');
      });
  };
  // Two choices, each revealing its own pair of actions, keep the level to two rows.
  const readingToggle = must<HTMLButtonElement>('#reading-toggle');
  const studyToggle = must<HTMLButtonElement>('#study-toggle');
  const readingActions = must('#reading-actions');
  const studyActions = must('#study-actions');
  function setChatGroup(open: 'reading' | 'study' | null) {
    readingToggle.setAttribute('aria-expanded', String(open === 'reading'));
    studyToggle.setAttribute('aria-expanded', String(open === 'study'));
    readingActions.hidden = open !== 'reading';
    studyActions.hidden = open !== 'study';
  }
  const toggleChatGroup = (group: 'reading' | 'study') => {
    const button = group === 'reading' ? readingToggle : studyToggle;
    setChatGroup(button.getAttribute('aria-expanded') === 'true' ? null : group);
  };
  readingToggle.onclick = () => toggleChatGroup('reading');
  studyToggle.onclick = () => toggleChatGroup('study');

  const noteForm = must<HTMLFormElement>('#note-form');
  const noteKey = must<HTMLInputElement>('#note-key');
  const noteValue = must<HTMLTextAreaElement>('#note-value');
  const noteSave = must<HTMLButtonElement>('#note-save');
  const noteFormTitle = must('#note-form-title');
  const noteCancel = must<HTMLButtonElement>('#note-cancel');
  const noteAdd = must<HTMLButtonElement>('#note-add');
  const noteList = must<HTMLUListElement>('#note-list');
  const notesEmpty = must('#notes-empty');
  const notesCount = must('#notes-count');
  const notePager = must('#note-pager');
  const notePage = must('#note-page');
  const notePrev = must<HTMLButtonElement>('#note-prev');
  const noteNext = must<HTMLButtonElement>('#note-next');
  const PAGE = 5;
  const PENCIL =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.2 2.5 13.5 4.8 6.2 12.1l-3 .8.8-3Z"/><path d="m10 3.7 2.3 2.3"/></svg>';
  const TRASH =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.9 4.4h10.2"/><path d="M6.3 4.4V2.9h3.4v1.5"/><path d="m4.4 4.4.6 8.7h6l.6-8.7"/><path d="M6.7 6.8v4M9.3 6.8v4"/></svg>';
  let editing: string | null = null;
  let noteTotal = 0;
  let notePageIndex = 0;
  let loadedNotes: NoteEntry[] = [];
  function noteRow(note: NoteEntry): HTMLLIElement {
    const row = document.createElement('li');
    const text = document.createElement('div');
    text.className = 'note-text';
    const key = document.createElement('strong');
    key.textContent = note.key;
    const value = document.createElement('p');
    value.textContent = note.value;
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'note-value-more';
    more.textContent = 'More';
    more.setAttribute('aria-expanded', 'false');
    more.hidden = true;
    more.onclick = () => {
      const open = value.classList.toggle('open');
      more.textContent = open ? 'Less' : 'More';
      more.setAttribute('aria-expanded', String(open));
    };
    text.append(key, value, more);
    const ops = document.createElement('div');
    ops.className = 'note-ops';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'icon-button';
    edit.title = 'Edit memory';
    edit.setAttribute('aria-label', `Edit memory ${note.key}`);
    edit.innerHTML = PENCIL;
    edit.onclick = () => startEdit(note);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-button danger';
    remove.title = 'Delete memory';
    remove.setAttribute('aria-label', `Delete memory ${note.key}`);
    remove.innerHTML = TRASH;
    remove.onclick = () => {
      void deleteNote(note.key)
        .then(() => {
          status('Memory deleted.');
          return loadNotes();
        })
        .catch(report);
    };
    ops.append(edit, remove);
    row.append(text, ops);
    return row;
  }
  function renderList(entries: NoteEntry[]) {
    loadedNotes = entries;
    const pages = Math.max(1, Math.ceil(entries.length / PAGE));
    notePageIndex = Math.min(notePageIndex, pages - 1);
    const start = notePageIndex * PAGE;
    const shown = entries.slice(start, start + PAGE);
    noteList.replaceChildren(...shown.map(noteRow));
    const paged = entries.length > PAGE;
    notePager.hidden = !paged || !noteForm.hidden;
    if (!paged) {
      notePage.textContent = '';
      return;
    }
    notePage.textContent = `${start + 1}\u2013${start + shown.length} of ${entries.length}`;
    notePrev.disabled = notePageIndex === 0;
    noteNext.disabled = notePageIndex >= pages - 1;
  }
  /** Only show More where the two-line clamp really hides something. */
  function fitNoteClamps() {
    for (const row of noteList.children) {
      const value = row.querySelector<HTMLParagraphElement>('.note-text p');
      const more = row.querySelector<HTMLButtonElement>('.note-value-more');
      if (!value || !more || value.classList.contains('open')) continue;
      more.hidden = value.scrollHeight <= value.clientHeight + 1;
    }
  }
  function showNoteForm(show: boolean) {
    noteForm.hidden = !show;
    // While composing, the composer is the whole panel: no redundant Add, no list to
    // scroll past, and Cancel owns the way out.
    noteAdd.hidden = show;
    noteList.hidden = show;
    notePager.hidden = show || noteTotal <= PAGE;
    notesEmpty.hidden = show || noteTotal > 0;
    noteAdd.setAttribute('aria-expanded', String(show));
    if (show) noteForm.scrollIntoView({ block: 'nearest' });
  }
  function startAdd() {
    editing = null;
    noteKey.disabled = false;
    noteKey.value = '';
    noteValue.value = '';
    noteFormTitle.textContent = 'New memory';
    noteSave.textContent = 'Add memory';
    showNoteForm(true);
    noteKey.focus();
  }
  function startEdit(note: NoteEntry) {
    editing = note.key;
    noteKey.value = note.key;
    noteKey.disabled = true;
    noteValue.value = note.value;
    noteFormTitle.textContent = 'Edit memory';
    noteSave.textContent = 'Save memory';
    showNoteForm(true);
    noteValue.focus();
  }
  function stopEdit(refocus = true) {
    editing = null;
    noteKey.disabled = false;
    noteKey.value = '';
    noteValue.value = '';
    noteFormTitle.textContent = 'New memory';
    noteSave.textContent = 'Add memory';
    showNoteForm(false);
    // The form just closed under the keyboard user, so bring focus back to its opener.
    if (refocus) noteAdd.focus();
  }
  async function loadNotes() {
    const notes = await readNotes();
    noteTotal = notes.length;
    renderList(notes);
    if (!noteForm.hidden) noteList.hidden = true;
    notesEmpty.hidden = notes.length > 0 || !noteForm.hidden;
    notesCount.textContent = notes.length ? String(notes.length) : '';
    if (editing && !notes.some((note) => note.key === editing)) stopEdit(false);
    if (currentView === 'memory') requestAnimationFrame(fitNoteClamps);
  }
  noteAdd.onclick = startAdd;
  function turnPage(step: number) {
    notePageIndex += step;
    renderList(loadedNotes);
    requestAnimationFrame(fitNoteClamps);
  }
  notePrev.onclick = () => {
    if (notePageIndex > 0) turnPage(-1);
  };
  noteNext.onclick = () => turnPage(1);
  noteForm.onsubmit = (event) => {
    event.preventDefault();
    const key = (editing ?? noteKey.value).trim();
    const value = noteValue.value.trim();
    if (!key) {
      status('Give the memory a key first.', 'error');
      return;
    }
    if (!value && editing == null) {
      status('Give the memory a value first.', 'error');
      return;
    }
    void saveNote(key, value)
      .then((saved) => {
        if (!saved) {
          status('Could not save that memory.', 'error');
          return;
        }
        stopEdit();
        status(value ? 'Memory saved.' : 'Memory deleted.');
        notePageIndex = 0;
        return loadNotes();
      })
      .catch(report);
  };
  noteCancel.onclick = () => stopEdit();
  await loadNotes();
  // A note Baleen adds from a page chat appears here without reopening the popup.
  const unwatchNotes = watchNotes(() => void loadNotes());

  const keyForm = must<HTMLFormElement>('#key-form');
  const keyInput = must<HTMLInputElement>('#key-input');
  const keyEdit = must<HTMLButtonElement>('#key-edit');
  const keyRemove = must<HTMLButtonElement>('#key-remove');
  const keyLabel = must('#key-label');
  const keyFieldLabel = must<HTMLLabelElement>('label[for="key-input"]');
  const keyHint = must('#key-hint');
  let apiKey = '';
  let keyToken = 0;
  const provider = (): Provider => providerForModel(settings.model);
  function showKeyForm(show: boolean) {
    keyForm.hidden = !show;
    keyEdit.setAttribute('aria-expanded', String(show));
    if (show) {
      keyInput.value = '';
      keyInput.focus();
    }
  }
  /** Each provider keeps its own key, so the row follows the selected model. */
  async function loadKey() {
    const token = ++keyToken;
    const forProvider = provider();
    const stored = await readApiKey(forProvider);
    if (token !== keyToken) return;
    apiKey = stored;
    const label = `${PROVIDER_LABELS[forProvider]} API key`;
    keyLabel.textContent = label;
    keyFieldLabel.textContent = label;
    keyEdit.textContent = apiKey ? 'Replace' : 'Add';
    keyRemove.hidden = !apiKey;
    keyInput.placeholder = keyPlaceholder(forProvider);
    const host = PROVIDER_HOSTS[forProvider];
    keyHint.textContent = apiKey
      ? `Saved ${keyPreview(forProvider, apiKey)}. Sent only to ${host} when you ask.`
      : `Stored on this device. Sent only to ${host} when you ask.`;
  }
  keyEdit.onclick = () => showKeyForm(keyForm.hidden);
  must<HTMLButtonElement>('#key-cancel').onclick = () => showKeyForm(false);
  keyRemove.onclick = () => {
    const forProvider = provider();
    void clearApiKey(forProvider)
      .then(loadKey)
      .then(() => {
        showKeyForm(false);
        status('Key removed.');
      })
      .catch(report);
  };
  keyForm.onsubmit = (event) => {
    event.preventDefault();
    const forProvider = provider();
    const key = normalizeApiKey(keyInput.value, forProvider);
    if (!key) {
      status(`That does not look like a ${PROVIDER_LABELS[forProvider]} API key.`, 'error');
      return;
    }
    void writeApiKey(forProvider, key)
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
