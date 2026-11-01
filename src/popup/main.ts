import './popup.css';
import { clearApiKey, normalizeApiKey, readApiKey, writeApiKey } from '../shared/key';
import { readSettings, watchSettings } from '../shared/settings';
import { DEEPSEEK_MODELS } from '../shared/types';
import type { DeepSeekModel, Settings, SettingsPatch, Theme } from '../shared/types';

const must = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const app = must('#app');
const version =
  typeof chrome !== 'undefined' && typeof chrome.runtime?.getManifest === 'function'
    ? chrome.runtime.getManifest().version
    : '';
const HIDDEN_HINT = 'Hidden on every page. Turn this on to bring her back.';
const VISIBLE_HINT = 'Shown on every page. Drag her to move.';
const MODEL_SHORT: Record<DeepSeekModel, string> = {
  'deepseek-flash': 'Flash',
  'deepseek-v4-pro': 'V4 Pro',
};
const modelOptionsHTML = DEEPSEEK_MODELS.map(
  (id) =>
    `<button type="button" role="option" class="drop-option" data-model="${id}" aria-selected="false"><span>${MODEL_SHORT[id]}</span><span class="drop-meta">${id === 'deepseek-flash' ? 'Fast' : 'Stronger'}</span></button>`,
).join('');
app.innerHTML = `<header class="top"><img id="portrait" class="portrait" src="icons/128.png" alt="" width="28" height="28"><div class="identity"><h1>Baleen</h1><p class="tagline">Whale companion, on every page.</p></div>${version ? `<span class="menu-version">v${version}</span>` : ''}</header>
<div class="rows">
<p class="group-label">Appearance</p>
<div class="row"><span class="label" id="theme-label">Theme</span><div class="seg" id="theme" role="radiogroup" aria-labelledby="theme-label"><label><input type="radio" name="theme" value="system"><span>System</span></label><label><input type="radio" name="theme" value="light"><span>Light</span></label><label><input type="radio" name="theme" value="dark"><span>Dark</span></label></div></div>
<div class="row"><span class="label" id="visible-label">Show on pages</span><button id="visible" class="switch" type="button" role="switch" aria-checked="true" aria-labelledby="visible-label" title="${VISIBLE_HINT}"></button></div>
<div class="row slider"><label class="label" for="scale">Size</label><output id="size-label" class="value" for="scale">100%</output><input id="scale" type="range" min="0.6" max="1.6" step="0.1" value="1"></div>
<p class="group-label">Connection</p>
<div class="row duo">
<div class="cell"><span class="label" id="key-label">DeepSeek API key</span><button id="key-edit" class="text-button" type="button" aria-labelledby="key-label" aria-expanded="false">Add</button></div>
<div class="cell"><span class="label" id="model-label">Model</span><div class="dropdown" id="model-dropdown"><button id="model-button" class="drop-button" type="button" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="model-label"><span id="model-value">Flash</span></button><div id="model-menu" class="drop-menu" role="listbox" aria-labelledby="model-label" hidden>${modelOptionsHTML}</div></div></div>
</div>
<form id="key-form" class="key-form" hidden><label class="sr-only" for="key-input">DeepSeek API key</label><div class="key-line"><input id="key-input" type="password" autocomplete="off" spellcheck="false" placeholder="sk-…"><button type="submit" class="primary">Save</button></div><div class="key-foot"><p class="hint" id="key-hint">Stored on this device. Sent only to api.deepseek.com when you ask.</p><button type="button" id="key-cancel" class="text-button">Cancel</button><button type="button" id="key-remove" class="text-button" hidden>Remove</button></div></form>
</div>
<p id="status" role="status"></p>
<footer><span>Alt/Option + Shift + G toggles</span><span class="sep" aria-hidden="true">·</span><a href="privacy.html" target="_blank">About Baleen</a></footer>`;

async function main() {
  let settings = await readSettings();
  const status = (text: string) => {
    must('#status').textContent = text;
  };
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
    status(error instanceof Error ? error.message : 'Could not save.');
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
      status('That does not look like a DeepSeek key (sk-…).');
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
  if (!settings.hidden) ensureTabs();
  await loadKey();
  window.addEventListener(
    'pagehide',
    () => {
      unwatch();
      systemScheme.removeEventListener('change', paintSystemTitle);
    },
    { once: true },
  );
}
void main().catch(() => {
  must('#status').textContent = 'Open this popup from the installed extension.';
});
