import './wiki.css';
import { renderMarkdown } from '../content/render/markdown';
import { readNotes, type NoteEntry } from '../shared/notes';
import { readSettings, watchSettings } from '../shared/settings';
import { MODEL_SHORT, type AskResult } from '../shared/types';
import {
  buildWikiRequest,
  pageFolderName,
  parseCompilation,
  renderWiki,
  sessionIndexFile,
  type Compilation,
  type ExistingPage,
  type PreviousState,
  type RawPage,
  type RenderedFile,
  type RenderResult,
  type WikiContext,
} from '../shared/wiki';
import {
  canWrite,
  isVaultRoot,
  loadVault,
  pageFolder,
  parsePageState,
  pickVault,
  readExistingPages,
  readPrevious,
  rememberVault,
  writeWiki,
  type EarlierRead,
} from './vault';

const must = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

const modelChip = must('#model-chip');
const banner = must('#page-error');
const stepCaption = must('#step-caption');
const stepItems = [...document.querySelectorAll<HTMLElement>('.step-item')];
const view = must('.view');
const compileStep = must('#step-compile');
const sourceTitle = must('#source-title');
const sourceUrl = must('#source-url');
const sourceStats = must('#source-stats');
const compileButton = must<HTMLButtonElement>('#compile');
const memoryNote = must('#memory-note');
const compileStatus = must('#compile-status');
const review = must('#review');
const reviewTopic = must('#review-topic');
const reviewSummary = must('#review-summary');
const pageList = must('#page-list');
const questions = must('#questions');
const questionList = must('#question-list');
const reviewBack = must<HTMLButtonElement>('#review-back');
const reviewNext = must<HTMLButtonElement>('#review-next');
const saveStep = must('#save-step');
const saveActions = must('#save-actions');
const saveBack = must<HTMLButtonElement>('#save-back');
const vaultRow = must('#vault-row');
const vaultName = must('#vault-name');
const vaultLine = must('#vault-line');
const pickButton = must<HTMLButtonElement>('#pick');
const saveButton = must<HTMLButtonElement>('#save');
const saveStatus = must('#save-status');
const saved = must('#saved');
const savedPath = must('#saved-path');
const savedCounts = must('#saved-counts');
const openVault = must<HTMLAnchorElement>('#open-vault');
const savedNote = must('#saved-note');
const doneButton = must<HTMLButtonElement>('#done');

const tabId = Number(new URLSearchParams(location.search).get('tab')) || 0;
const MAX_PAGES = 5;

interface SessionDraft {
  context: WikiContext;
  compilation: Compilation;
  hash: string;
}

interface SessionRender {
  combined: RenderResult;
  results: RenderResult[];
}

let queue: chrome.tabs.Tab[] = [];
let selected = new Set<number>();
let drafts: SessionDraft[] = [];
let combined: RenderResult | null = null;
let vault: FileSystemDirectoryHandle | null = null;
let noteCount = 0;
let compiling = false;
let saving = false;
let unsaved = false;

const sourceCard = must('.source');
const queueBox = must('#queue');
const queueList = must('#queue-list');
const queueHint = must('#queue-hint');

function reason(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function setStatus(node: HTMLElement, text: string, tone: 'info' | 'error' = 'info') {
  node.textContent = text;
  node.dataset.tone = tone;
}

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

const CAPTIONS = ['Compile this page', 'Review the drafts', 'Save to your vault'];
const WIDTH = 420;
const MIN_HEIGHT = 240;
const MAX_HEIGHT = 600;
let currentStep: 1 | 2 | 3 = 1;

/** The height the step wants at the current width, with no flex filler and no scroll. */
function naturalHeight(step: 1 | 2 | 3, frame = 0): number {
  const section = [compileStep, review, saveStep][step - 1];
  const scroll = section.querySelector<HTMLElement>('.step-scroll');
  const bar = [...section.children].find(
    (node): node is HTMLElement =>
      node instanceof HTMLElement && node.classList.contains('bar') && !node.hidden,
  );
  // The scroll area fills whatever height the window has; release it to read the real content.
  let content = 0;
  if (scroll) {
    const style = scroll.style.cssText;
    scroll.style.flex = 'none';
    scroll.style.overflow = 'visible';
    content = scroll.offsetHeight;
    scroll.style.cssText = style;
  }
  const chrome = window.innerHeight - view.clientHeight;
  const notice = banner.hidden ? 0 : banner.offsetHeight + 10;
  return Math.ceil(chrome + notice + content + (bar?.offsetHeight ?? 0) + frame + 1);
}

/** The window belongs to one step at a time; its height follows the content, like a dialog. */
async function fitWindow(step: 1 | 2 | 3) {
  try {
    const current = await chrome.windows.getCurrent();
    if (!current?.id || current.type !== 'popup') return;
    // Window height counts the title bar while innerHeight does not. Without this, the
    // viewport comes out shorter than the measured body and the draft scrolls under the bar.
    const outer = current.height ?? window.outerHeight;
    const frame = Math.max(0, Math.round(outer - window.innerHeight));
    const height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, naturalHeight(step, frame)));
    await chrome.windows.update(current.id, {
      state: 'normal',
      width: WIDTH,
      height,
      left: current.left,
      top: current.top,
    });
  } catch {
    // A tab or an environment without window access: the page still lays out on its own.
  }
}

function showStep(next: 1 | 2 | 3) {
  currentStep = next;
  compileStep.hidden = next !== 1;
  review.hidden = next !== 2;
  saveStep.hidden = next !== 3;
  stepCaption.textContent =
    next === 3 && !saved.hidden ? 'Saved to your vault' : CAPTIONS[next - 1];
  for (const item of stepItems) {
    const step = Number(item.dataset.step) as 1 | 2 | 3;
    item.classList.toggle('is-current', step === next);
    item.classList.toggle('is-done', step < next);
    if (step === next) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  }
  void fitWindow(next);
}

async function paintTheme() {
  const settings = await readSettings();
  const root = document.documentElement;
  if (settings.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  modelChip.textContent = MODEL_SHORT[settings.model];
}

async function digest(value: WikiContext): Promise<string> {
  const data = new TextEncoder().encode(`${value.url}\n${value.passages.join('\n\n')}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function prettyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname).replace(/\/$/, '');
    const short = `${parsed.hostname}${path}`;
    return short.length > 96 ? `${short.slice(0, 95)}…` : short;
  } catch {
    return url;
  }
}

function questionCount(value: WikiContext): number {
  let count = value.talk.filter((turn) => turn.role === 'user').length;
  for (const chat of value.study)
    count += chat.turns.filter((turn) => turn.role === 'user').length;
  return count;
}

function paintSource(value: WikiContext) {
  sourceTitle.textContent = value.title || 'Untitled page';
  sourceUrl.textContent = prettyUrl(value.url);
  sourceUrl.title = value.url;
  const parts = [`${value.passages.length} passage${value.passages.length === 1 ? '' : 's'}`];
  const asked = questionCount(value);
  if (asked) parts.push(`${asked} question${asked === 1 ? '' : 's'}`);
  if (noteCount) parts.push(`${noteCount} memor${noteCount === 1 ? 'y' : 'ies'}`);
  sourceStats.textContent = parts.join(' · ');
  memoryNote.hidden = noteCount === 0;
  memoryNote.textContent = noteCount
    ? `${noteCount} memor${noteCount === 1 ? 'y' : 'ies'} shape the pages.`
    : '';
  document.title = `${value.title} · Wiki · Baleen`;
}

/** The content script may be orphaned by an extension reload; re-inject and ask once more. */
async function pageCall<T>(tab: number, message: Record<string, unknown>): Promise<T> {
  const missing = (error: unknown) =>
    error instanceof Error && /Receiving end|Could not establish/i.test(error.message);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const reply = (await chrome.tabs.sendMessage(tab, message)) as
        | { ok?: boolean; data?: T; error?: string }
        | undefined;
      if (!reply?.ok) throw new Error(reply?.error ?? 'Baleen did not answer.');
      return reply.data as T;
    } catch (error) {
      if (!missing(error) || attempt === 2) {
        if (missing(error)) throw new Error('Reload the page, then open Wiki again.');
        throw error;
      }
      await chrome.runtime.sendMessage({ type: 'fg:ensure' }).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error('Reload the page, then open Wiki again.');
}

async function loadContext(tab: number): Promise<WikiContext> {
  return pageCall<WikiContext>(tab, { type: 'fg:wiki-context' });
}

function fail(text: string) {
  banner.hidden = false;
  banner.textContent = text;
  compileButton.disabled = true;
}

/** One session folder: the first page's folder, plus how many others joined it. */
function folderFor(list: WikiContext[]): string {
  const first = pageFolderName(list[0]);
  return list.length > 1 ? `${first} +${list.length - 1}` : first;
}

function titleFor(list: WikiContext[]): string {
  const first = list[0]?.title || 'Untitled page';
  return list.length > 1 ? `${first} + ${list.length - 1} more` : first;
}

/** Two tabs can share a title; a suffix keeps their source files and citations apart. */
function dedupeTitles(list: WikiContext[]): void {
  const seen = new Set<string>();
  for (const value of list) {
    const base = value.title;
    if (!seen.has(base.toLowerCase())) {
      seen.add(base.toLowerCase());
      continue;
    }
    for (let n = 2; ; n += 1) {
      const candidate = `${base} (${n})`;
      if (!seen.has(candidate.toLowerCase())) {
        value.title = candidate;
        seen.add(candidate.toLowerCase());
        break;
      }
    }
  }
}

function stateAfter(state: PreviousState, result: RenderResult): PreviousState {
  const concepts = { ...state.concepts };
  const sources = { ...(state.sources ?? {}) };
  for (const file of result.files) {
    if (file.role === 'concept') concepts[file.name] = parsePageState(file.content);
    else if (file.role === 'source') sources[file.name] = parsePageState(file.content);
  }
  return { ...state, concepts, sources };
}

/** The next compile in the session sees this compile's pages as pages to merge with. */
function existingAfter(existing: ExistingPage[], result: RenderResult): ExistingPage[] {
  const next = existing.map((page) => ({ ...page }));
  for (const page of result.pages) {
    const file = result.files.find((item) => item.role === 'concept' && item.name === page.title);
    const value: ExistingPage = {
      title: page.title,
      summary: page.summary,
      aliases: page.aliases,
      ...(file ? { body: parsePageState(file.content).body } : {}),
    };
    const index = next.findIndex((item) => item.title.toLowerCase() === page.title.toLowerCase());
    if (index >= 0) next[index] = value;
    else next.push(value);
  }
  return next;
}

/** One folder, one index: each source keeps its own files, concepts are updated in place. */
function combineSession(results: RenderResult[], list: WikiContext[]): RenderResult {
  const files = new Map<string, RenderedFile>();
  const pages = new Map<string, RawPage>();
  const order: string[] = [];
  const contexts: string[] = [];
  const questions: string[] = [];
  let links = 0;
  for (const result of results) {
    links += result.linkCount;
    for (const page of result.pages) {
      const key = page.title.toLowerCase();
      if (!pages.has(key)) order.push(key);
      pages.set(key, page);
    }
    for (const question of result.openQuestions)
      if (!questions.some((item) => item.toLowerCase() === question.toLowerCase()))
        questions.push(question);
    for (const file of result.files) {
      if (file.role === 'index') continue;
      let name = file.name;
      if (file.role === 'context')
        for (let n = 2; contexts.some((item) => item.toLowerCase() === name.toLowerCase()); n += 1)
          name = `${file.name} (${n})`;
      if (file.role === 'context') contexts.push(name);
      files.set(`${file.dir}/${name.toLowerCase()}`, name === file.name ? file : { ...file, name });
    }
  }
  const pageList = order.map((key) => pages.get(key)!);
  const orphans = results.reduce((total, result) => total + result.orphans, 0);
  const index = sessionIndexFile({
    title: titleFor(list),
    date: today(),
    sources: results.map((result, i) => ({ title: result.sourceTitle, url: list[i].url })),
    concepts: pageList.map((page) => ({ title: page.title, summary: page.summary })),
    contexts,
    openQuestions: questions,
    orphans,
  });
  files.set('/index', index);
  return {
    files: [...files.values()],
    logEntry: results.map((result) => result.logEntry).join('\n'),
    folder: folderFor(list),
    sourceTitle: results[0].sourceTitle,
    topic: results[0].topic,
    pageCount: pageList.length,
    linkCount: links,
    orphans,
    carried: results.at(-1)?.carried ?? 0,
    merges: pageList.filter((page) => page.merged).length,
    pages: pageList,
    openQuestions: questions,
  };
}

/** Render every draft against the same earlier folder, accumulating state between pages. */
function renderSession(
  list: SessionDraft[],
  notes: NoteEntry[],
  date: string,
  earlier: EarlierRead,
): SessionRender {
  let state = earlier.state;
  let existing = earlier.pages;
  const results: RenderResult[] = [];
  for (const draft of list) {
    const result = renderWiki({
      context: draft.context,
      compilation: draft.compilation,
      notes,
      hash: draft.hash,
      date,
      previous: { ...state, existing },
    });
    results.push(result);
    state = stateAfter(state, result);
    existing = existingAfter(existing, result);
  }
  return {
    combined: combineSession(
      results,
      list.map((draft) => draft.context),
    ),
    results,
  };
}

function paintQueue() {
  const many = queue.length > 1;
  queueBox.hidden = !many;
  sourceCard.hidden = many;
  if (!many) return;
  queueList.replaceChildren(
    ...queue.map((tab, index) => {
      const id = tab.id as number;
      const item = document.createElement('li');
      const label = document.createElement('label');
      label.className = 'queue-item';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = String(id);
      input.checked = selected.has(id);
      input.setAttribute('aria-label', tab.title || `Page ${index + 1}`);
      const text = document.createElement('span');
      text.className = 'queue-text';
      const title = document.createElement('span');
      title.className = 'queue-title';
      title.textContent = tab.title || 'Untitled page';
      const url = document.createElement('span');
      url.className = 'queue-url';
      url.textContent = prettyUrl(tab.url ?? '');
      text.append(title, url);
      label.append(input, text);
      item.append(label);
      return item;
    }),
  );
  queueHint.textContent = `Choose up to ${MAX_PAGES} pages in this window.`;
  paintQueueButton();
}

function paintQueueButton() {
  const count = selected.size;
  compileButton.textContent = compiling
    ? 'Compiling…'
    : count > 1
      ? `Compile ${count} pages`
      : 'Compile';
  if (currentStep === 1)
    stepCaption.textContent = count > 1 ? 'Compile these pages' : 'Compile this page';
}

function paintReview(session: SessionRender, list: SessionDraft[]) {
  const result = session.combined;
  const multi = session.results.length > 1;
  reviewTopic.textContent = multi
    ? titleFor(list.map((draft) => draft.context))
    : list[0].compilation.topic || 'This page';
  const parts = [
    `${result.pages.length} page${result.pages.length === 1 ? '' : 's'}`,
    `${result.linkCount} link${result.linkCount === 1 ? '' : 's'}`,
  ];
  if (result.merges) parts.push(`${result.merges} merged`);
  if (result.orphans)
    parts.push(`${result.orphans} with no inbound link${result.orphans === 1 ? '' : 's'}`);
  if (result.carried) parts.push(`${result.carried} earlier kept`);
  reviewSummary.textContent = parts.join(' · ');

  const sourceOf = new Map<string, string>();
  for (const [index, rendered] of session.results.entries())
    for (const page of rendered.pages)
      sourceOf.set(page.title.toLowerCase(), rendered.sourceTitle || list[index].context.url);

  pageList.replaceChildren();
  for (const page of result.pages) {
    const item = document.createElement('li');
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const title = document.createElement('span');
    title.className = 'page-title';
    title.textContent = page.title;
    const meta = document.createElement('span');
    meta.className = 'page-meta';
    const label = page.merged ? 'merge' : page.confidence;
    meta.textContent = multi ? sourceOf.get(page.title.toLowerCase()) ?? label : label;
    if (multi) meta.title = `${label} · from this page’s source`;
    if (page.merged && page.mergeInto) meta.title = `Adds a section to “${page.mergeInto}”`;
    const chev = document.createElement('span');
    chev.className = 'chev';
    summary.append(title, meta, chev);
    details.append(summary);
    if (page.summary) {
      const text = document.createElement('p');
      text.className = 'page-summary';
      text.textContent = page.summary;
      details.append(text);
    }
    if (page.merged && page.mergeInto) {
      const note = document.createElement('p');
      note.className = 'merge-note';
      note.textContent = 'Appends this reading as a new section. The page’s current text and citations stay.';
      details.append(note);
    }
    const body = document.createElement('div');
    body.className = 'prose';
    body.append(renderMarkdown(page.body));
    details.append(body);
    if (page.related.length) {
      const related = document.createElement('ul');
      related.className = 'related';
      for (const link of page.related) {
        const row = document.createElement('li');
        row.textContent = link.why ? `${link.to} — ${link.why}` : link.to;
        related.append(row);
      }
      details.append(related);
    }
    item.append(details);
    pageList.append(item);
  }

  questions.hidden = result.openQuestions.length === 0;
  questionList.replaceChildren(
    ...result.openQuestions.map((question) => {
      const item = document.createElement('li');
      item.textContent = question;
      return item;
    }),
  );
}

async function refreshVault() {
  if (!vault) vault = await loadVault();
  if (vault) {
    vaultName.textContent = vault.name;
    vaultLine.textContent = drafts.length
      ? `Baleen / ${folderFor(drafts.map((draft) => draft.context))}`
      : 'Saving under the Baleen folder.';
    pickButton.textContent = 'Change';
    saveButton.disabled = !combined || !unsaved;
  } else {
    vaultName.textContent = 'No vault chosen';
    vaultLine.textContent = 'Pick your Obsidian vault folder once.';
    pickButton.textContent = 'Choose';
    saveButton.disabled = true;
  }
}

async function compile() {
  if (compiling) return;
  const ids = queue.map((tab) => tab.id as number).filter((id) => selected.has(id));
  if (!ids.length) return;
  compiling = true;
  compileButton.disabled = true;
  paintQueueButton();
  saved.hidden = true;
  saveActions.hidden = false;
  unsaved = false;
  vaultRow.hidden = false;
  setStatus(
    compileStatus,
    ids.length > 1
      ? `Reading ${ids.length} pages, then drafting each. This can take a few minutes.`
      : 'Reading the page and drafting pages. This can take a minute.',
  );
  try {
    const list: WikiContext[] = [];
    for (const [index, id] of ids.entries()) {
      if (ids.length > 1)
        setStatus(compileStatus, `Reading page ${index + 1} of ${ids.length}…`);
      list.push(await loadContext(id));
    }
    dedupeTitles(list);
    const notes = await readNotes();
    noteCount = notes.length;
    if (list.length === 1) paintSource(list[0]);
    else document.title = `${titleFor(list)} · Wiki · Baleen`;
    const folderName = folderFor(list);
    const earlier = vault
      ? await readExistingPages(vault, folderName)
      : { pages: [], state: { concepts: {} } };
    const model = (await readSettings()).model;
    let existing = earlier.pages;
    let state = earlier.state;
    const next: SessionDraft[] = [];
    const results: RenderResult[] = [];
    for (const [index, value] of list.entries()) {
      setStatus(
        compileStatus,
        `Drafting ${index + 1} of ${list.length}: ${value.title || 'untitled page'}`,
      );
      const reply = (await chrome.runtime.sendMessage({
        type: 'fg:ask',
        request: {
          action: 'wiki',
          model,
          text: buildWikiRequest(value, notes, today(), existing),
          title: '',
        },
      })) as { ok?: boolean; data?: AskResult; error?: string } | undefined;
      if (!reply?.ok || !reply.data) throw new Error(reply?.error ?? 'Compile failed.');
      const compilation = parseCompilation(reply.data.text);
      const hash = await digest(value);
      const result = renderWiki({
        context: value,
        compilation,
        notes,
        hash,
        date: today(),
        previous: { ...state, existing },
      });
      next.push({ context: value, compilation, hash });
      results.push(result);
      state = stateAfter(state, result);
      existing = existingAfter(existing, result);
    }
    drafts = next;
    combined = combineSession(results, list);
    paintReview({ combined, results }, next);
    unsaved = true;
    await refreshVault();
    showStep(2);
    setStatus(
      compileStatus,
      `Drafted ${combined.pageCount} concept page${combined.pageCount === 1 ? '' : 's'}. Review them, then save.`,
    );
  } catch (error) {
    setStatus(compileStatus, reason(error), 'error');
  } finally {
    compiling = false;
    compileButton.disabled = !selected.size;
    paintQueueButton();
    if (currentStep === 1) void fitWindow(1);
  }
}

async function chooseVault() {
  try {
    const picked = await pickVault();
    vault = picked;
    await rememberVault(picked);
    await refreshVault();
    setStatus(saveStatus, '');
    void fitWindow(3);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    setStatus(saveStatus, reason(error), 'error');
  }
}

async function save() {
  if (!vault || !drafts.length || saving) return;
  saving = true;
  saveButton.disabled = true;
  saveButton.textContent = 'Saving…';
  setStatus(saveStatus, '');
  try {
    if (!(await canWrite(vault, true)))
      throw new Error('Baleen needs permission to write in that folder.');
    const list = drafts.map((draft) => draft.context);
    const folder = await pageFolder(vault, folderFor(list));
    const previous = await readPrevious(folder);
    const notes = await readNotes();
    const session = renderSession(drafts, notes, today(), {
      pages: previous.pages,
      state: previous.state,
    });
    const result = session.combined;
    const report = await writeWiki(
      folder,
      result,
      previous.pages.map((page) => page.title),
    );
    combined = result;
    unsaved = false;
    saved.hidden = false;
    saveActions.hidden = true;
    vaultRow.hidden = true;
    stepCaption.textContent = 'Saved to your vault';
    savedPath.textContent = report.folderPath;
    const counts = [`${report.written.length} file${report.written.length === 1 ? '' : 's'} written`];
    if (report.skipped.length) counts.push(`${report.skipped.length} kept because you own them`);
    if (result.carried)
      counts.push(`${result.carried} earlier page${result.carried === 1 ? '' : 's'} kept`);
    if (report.left.length) counts.push(`${report.left.length} earlier file${report.left.length === 1 ? '' : 's'} left in place`);
    savedCounts.textContent = counts.join(' · ');
    const root = await isVaultRoot(vault);
    openVault.hidden = !root;
    if (root) {
      openVault.href = `obsidian://open?vault=${encodeURIComponent(vault.name)}&file=${encodeURIComponent(`${report.folderPath}/index`)}`;
      savedNote.textContent = 'Obsidian may ask once before opening the vault.';
    } else {
      savedNote.textContent =
        'This folder is not an Obsidian vault root, so open the index from Obsidian yourself.';
    }
    setStatus(saveStatus, '');
    setStatus(compileStatus, '');
    void fitWindow(3);
  } catch (error) {
    setStatus(saveStatus, reason(error), 'error');
  } finally {
    saving = false;
    saveButton.textContent = 'Save to vault';
    saveButton.disabled = !combined || !unsaved;
  }
}

compileButton.onclick = () => void compile();
pickButton.onclick = () => void chooseVault();
saveButton.onclick = () => void save();
reviewBack.onclick = () => {
  showStep(1);
  setStatus(compileStatus, '');
};
reviewNext.onclick = () => {
  if (combined) showStep(3);
};
saveBack.onclick = () => showStep(2);
doneButton.onclick = () => window.close();
const refit = () => {
  if (currentStep === 2) void fitWindow(2);
};
pageList.addEventListener('toggle', refit, true);
questions.addEventListener('toggle', refit, true);
queueList.addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement;
  if (!input.matches('input[type="checkbox"]')) return;
  const id = Number(input.value);
  if (input.checked) selected.add(id);
  else selected.delete(id);
  if (selected.size > MAX_PAGES) {
    input.checked = false;
    selected.delete(id);
    setStatus(compileStatus, `Choose up to ${MAX_PAGES} pages at a time.`, 'error');
  } else {
    setStatus(compileStatus, '');
  }
  // A different queue means the rendered review no longer describes what would be saved.
  drafts = [];
  combined = null;
  unsaved = false;
  saveButton.disabled = true;
  compileButton.disabled = !selected.size;
  paintQueueButton();
});

/** Read every page in this window so the reader can compile several in one pass. */
async function buildQueue(caller: chrome.tabs.Tab) {
  const win = Number(new URLSearchParams(location.search).get('win')) || caller.windowId;
  let tabs: chrome.tabs.Tab[] = [];
  try {
    tabs = await chrome.tabs.query({ windowId: win });
  } catch {
    tabs = [caller];
  }
  queue = tabs
    .filter((tab) => tab.id != null && /^https?:/i.test(tab.url ?? ''))
    .sort((a, b) =>
      a.id === tabId ? -1 : b.id === tabId ? 1 : (a.index ?? 0) - (b.index ?? 0),
    );
  if (!queue.some((tab) => tab.id === tabId)) queue.unshift(caller);
  selected = new Set([tabId]);
  paintQueue();
}

async function init() {
  showStep(1);
  await paintTheme();
  watchSettings(() => void paintTheme());
  if (!tabId) {
    fail('Open Wiki from the Study menu on the page you want to compile.');
    sourceTitle.textContent = 'No page connected';
    return;
  }
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = tab.url ?? '';
    const ownPage = url.startsWith(chrome.runtime.getURL(''));
    if (!/^https?:/i.test(url) && !ownPage)
      throw new Error('This tab is not a web page. Open a regular page first.');
    noteCount = (await readNotes()).length;
    // Reading the caller proves the content script is alive before anything is sent.
    const value = await loadContext(tabId);
    paintSource(value);
    await buildQueue(tab);
    compileButton.disabled = !selected.size;
    await refreshVault();
  } catch (error) {
    fail(reason(error));
    sourceTitle.textContent = 'Not connected';
  }
  void fitWindow(1);
}

void init();
