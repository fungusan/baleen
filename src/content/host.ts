import { characterCSS, createCharacter } from './render/compositor';
import { renderMarkdown } from './render/markdown';
import { captureSection, pagePassage, requestAsk, type SectionCapture } from './ask';
import { findPassages } from './retrieve';
import { asksToRemember, notesContext, readNotes, saveNote, takeNote } from '../shared/notes';
import { asksAboutBaleen } from '../shared/help';
import { characterById, characterForModel } from '../shared/characters';
import { DEEPSEEK_MODELS, DEEPSEEK_MODEL_LABELS } from '../shared/types';
import type {
  ChatTurn,
  DeepSeekModel,
  Look,
  Position,
  Settings,
  Theme,
} from '../shared/types';

export function clampPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  return {
    x: Math.max(8, Math.min(Math.max(8, viewportWidth - width - 8), x)),
    y: Math.max(8, Math.min(Math.max(8, viewportHeight - height - 8), y)),
  };
}
/**
 * The page holds exactly one card. A reloaded extension orphans its old content script, whose
 * chrome.* calls are already dead, so that script can never unmount its card and a new mount would
 * otherwise stack a second girl on top of it.
 */
export function clearStaleHosts() {
  for (const stale of document.querySelectorAll('#fungusan-gal, #fungusan-ask, [data-fg-chat]'))
    stale.remove();
}

/** Formatting shared by chat answers and Study results; the alias falls back across both palettes. */
const MARKDOWN_CSS = `
  .markdown {
    --md-ink:var(--ink, var(--fg-ink)); --md-sunken:var(--sunken, var(--fg-sunken));
    --md-line:var(--line, var(--fg-line)); --md-accent:var(--accent, var(--fg-accent));
    --md-muted:var(--muted, var(--fg-muted)); --md-faint:var(--faint, var(--fg-faint));
    --md-mono:var(--mono, var(--fg-mono));
    --md-sans:var(--sans, var(--fg-sans, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif));
    white-space:normal;
  }
  .markdown > :first-child { margin-top:0; }
  .markdown > :last-child { margin-bottom:0; }
  .markdown p,.markdown ul,.markdown ol,.markdown pre,.markdown table,
  .markdown blockquote,.markdown .math-display { margin:0 0 6px; }
  .markdown ul,.markdown ol { padding-left:16px; }
  .markdown li { margin:1px 0; }
  .markdown li > ul,.markdown li > ol { margin:2px 0; }
  .markdown strong { color:var(--md-ink); font-weight:600; }
  .markdown h1,.markdown h2,.markdown h3,.markdown h4,.markdown h5,.markdown h6 {
    margin:8px 0 4px; color:var(--md-ink); font:600 12px/1.4 var(--md-sans);
  }
  .markdown code {
    padding:1px 4px; border:1px solid var(--md-line); border-radius:3px;
    background:var(--md-sunken); color:var(--md-ink); font:10px/1.5 var(--md-mono);
  }
  .markdown pre {
    padding:7px 8px; border:1px solid var(--md-line); border-radius:3px;
    background:var(--md-sunken); overflow:auto; scrollbar-width:thin;
  }
  .markdown pre code {
    padding:0; border:0; background:none; white-space:pre;
    font:10px/1.55 var(--md-mono);
  }
  .markdown blockquote {
    padding-left:8px; border-left:2px solid var(--md-line); color:var(--md-muted);
  }
  .markdown blockquote p:last-child { margin-bottom:0; }
  .markdown a { color:var(--md-accent); text-decoration:underline; text-underline-offset:2px; }
  .markdown hr { margin:8px 0; border:0; border-top:1px solid var(--md-line); }
  .markdown table { width:100%; border-collapse:collapse; font-size:10px; }
  .markdown th,.markdown td {
    padding:3px 5px; border:1px solid var(--md-line); text-align:left; vertical-align:top;
  }
  .markdown th { background:var(--md-sunken); color:var(--md-ink); font-weight:600; }
  .markdown math { font-size:1.06em; }
  .markdown .math-display { overflow-x:auto; overflow-y:hidden; }
  .markdown .math-display math { display:block; margin:0 auto; }
`;

const CHAT_CSS = `
  :host { all:initial; display:block; pointer-events:auto; }
  * { box-sizing:border-box; }
  .wrap {
    --bg:light-dark(#ffffff,#000000); --sunken:light-dark(#fafafa,#111111); --ink:light-dark(#0a0a0a,#f5f5f5);
    --body:light-dark(#404040,#d4d4d4); --muted:light-dark(#737373,#a3a3a3); --faint:light-dark(#a3a3a3,#737373);
    --line:light-dark(#e5e5e5,#262626); --stone:light-dark(#d4d4d4,#404040);
    --accent:light-dark(#849f5d,#9ab86e); --accent-hover:light-dark(#728b4f,#adcb80);
    --accent-soft:light-dark(rgba(132,159,93,.08),rgba(154,184,110,.14));
    --accent-line:light-dark(rgba(132,159,93,.45),rgba(154,184,110,.5));
    --danger:light-dark(#b91c1c,#f87171); --on-accent:light-dark(#ffffff,#000000);
    --shadow:0 16px 40px light-dark(rgba(17,24,39,.16),rgba(0,0,0,.55));
    --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
    --sans:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
    color-scheme:light dark;
    position:relative; display:flex; flex-direction:column; overflow:clip; border:1px solid var(--line); border-radius:10px;
    background:var(--bg); box-shadow:var(--shadow); color:var(--body); text-align:left;
    font:11.5px/1.6 var(--sans);
  }
  :host([data-theme="light"]) .wrap { color-scheme:light; }
  :host([data-theme="dark"]) .wrap { color-scheme:dark; }
  button { font:inherit; color:inherit; cursor:pointer; border:0; background:transparent; }
  button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .head { display:flex; align-items:center; gap:4px; padding:7px 6px 7px 9px; cursor:grab; touch-action:none; }
  .head:active { cursor:grabbing; }
  .titles { flex:1; min-width:0; overflow:hidden; }
  .name { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--ink); font:600 12.5px/1.5 var(--sans); letter-spacing:.01em; }
  .close,.collapse,.color { flex:none; display:flex; align-items:center; justify-content:center; width:20px; height:20px; padding:0; border:0; border-radius:5px; color:var(--muted); font:13px/1 var(--sans); transition:background .15s,color .15s; }
  .color { width:18px; }
  .color::before { content:""; width:8px; height:8px; border-radius:50%; background:var(--section, var(--accent)); box-shadow:0 0 0 1px light-dark(rgba(0,0,0,.1),rgba(255,255,255,.16)); }
  .close:hover,.collapse:hover,.color:hover,.close:focus-visible,.collapse:focus-visible,.color:focus-visible { background:var(--sunken); color:var(--ink); }
  .palette { position:absolute; top:34px; left:7px; z-index:3; display:flex; align-items:center; gap:8px; padding:7px 9px; border:1px solid var(--line); border-radius:8px; background:var(--bg); box-shadow:var(--shadow); }
  .palette[hidden] { display:none!important; }
  .palette button { width:12px; height:12px; padding:0; border-radius:50%; background:var(--dot); box-shadow:inset 0 0 0 1px rgba(0,0,0,.16); transition:transform .12s; }
  .palette button:hover,.palette button:focus-visible { transform:scale(1.2); }
  .palette button[aria-pressed="true"] { box-shadow:0 0 0 1px var(--bg),0 0 0 2px var(--ink); }
  /* Collapsed, the window is just a bookmark in the section's colour: no name, no chrome. */
  .wrap.collapsed { border:0; background:transparent; box-shadow:none; overflow:visible; }
  .wrap.collapsed .head { width:100%; height:100%; padding:0; gap:0; cursor:grab; }
  .wrap.collapsed .titles,
  .wrap.collapsed .close,
  .wrap.collapsed .color,
  .wrap.collapsed .palette,
  .wrap.collapsed .thread,
  .wrap.collapsed .process,
  .wrap.collapsed .note,
  .wrap.collapsed .form,
  .wrap.collapsed .foot,
  .wrap.collapsed .grip { display:none!important; }
  .wrap.collapsed .collapse {
    display:block; width:18px; height:28px; margin:1px; padding:0; border:0;
    border-radius:3px 3px 1px 1px; background:var(--section, var(--accent));
    clip-path:polygon(0 0, 100% 0, 100% 100%, 50% 72%, 0 100%);
    box-shadow:0 2px 6px light-dark(rgba(17,24,39,.18), rgba(0,0,0,.45));
    color:transparent; font-size:0; line-height:0; cursor:grab;
  }
  .wrap.collapsed .collapse:hover { filter:brightness(1.1); }
  .wrap.collapsed .collapse:focus-visible { outline:2px solid var(--section, var(--accent)); outline-offset:2px; }
  .thread { flex:1 1 auto; min-height:0; display:flex; flex-direction:column; gap:10px; margin-right:14px; padding:9px 0 8px 12px; overflow:auto; scrollbar-width:thin; }
  .thread[hidden],.note[hidden],.copy[hidden] { display:none!important; }
  .msg-user { align-self:flex-end; max-width:86%; padding:6px 10px; border-radius:10px; background:color-mix(in srgb, var(--section, var(--accent)) 12%, transparent); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--section, var(--accent)) 28%, transparent); color:var(--ink); font:12px/1.55 var(--sans); white-space:pre-wrap; overflow-wrap:anywhere; }
  .msg-assistant { align-self:stretch; color:var(--ink); font:12.5px/1.7 var(--sans); overflow-wrap:anywhere; }
  .msg-assistant[data-kind] { white-space:pre-wrap; font:11.5px/1.6 var(--sans); }
  /* Work in progress has its own bubble between the thread and the composer, never a message. */
  .process {
    display:flex; align-items:center; gap:6px; align-self:flex-start;
    max-width:calc(100% - 26px); margin:0 14px 6px 12px; padding:5px 9px;
    border:1px solid var(--line); border-radius:10px;
    background:var(--sunken); color:var(--muted); font:11.5px/1.6 var(--sans);
  }
  .process[hidden] { display:none!important; }
  .process::before {
    content:""; flex:none; width:5px; height:5px; border-radius:50%;
    background:var(--section, var(--accent)); animation:fg-think 1.2s ease-in-out infinite;
  }
  @keyframes fg-think { 0%,100%{opacity:.35} 50%{opacity:1} }
  @media (prefers-reduced-motion:reduce) {
    .process::before { animation:none; }
  }
  .msg-assistant[data-kind="error"] { color:var(--danger); font-size:10.5px; }
  .msg-assistant.markdown h1,.msg-assistant.markdown h2,.msg-assistant.markdown h3,
  .msg-assistant.markdown h4,.msg-assistant.markdown h5,.msg-assistant.markdown h6 {
    font:600 13px/1.45 var(--sans);
  }
  .msg-assistant.markdown p,.msg-assistant.markdown li,
  .msg-assistant.markdown blockquote {
    font:12.5px/1.7 var(--sans);
  }
  .msg-assistant.markdown code { font:10.5px/1.6 var(--mono); }
  .msg-assistant.markdown { cursor:grab; }
  .msg-assistant.markdown a,.msg-assistant.markdown summary { cursor:pointer; }
  .wrap.moving,.wrap.moving * { user-select:none!important; }
  .thought { align-self:stretch; margin-bottom:4px; }
  .thought summary { display:flex; align-items:center; gap:5px; padding:0; color:var(--muted); font:10.5px/1.6 var(--sans); cursor:pointer; list-style:none; }
  .thought summary::-webkit-details-marker { display:none; }
  .thought summary::before { content:"\\25B8"; color:var(--faint); font-size:9px; transition:transform .15s; }
  .thought[open] summary::before { transform:rotate(90deg); }
  .thought-body { margin:3px 0 2px; padding-left:10px; border-left:2px solid var(--line); max-height:170px; overflow:auto; color:var(--muted); font:11.5px/1.65 var(--sans); overflow-wrap:anywhere; scrollbar-width:thin; }
  .thought-body.markdown p,.thought-body.markdown li { font:inherit; }
  /* Three grips mark how the window scales: the right edge stretches width, the bottom edge height,
     and the corner both at once. Arrows say which way each grip moves, so the edge grips do not read
     as scrollbars. The thread keeps a gutter on its right so the width grip clears its scrollbar. */
  .grip { position:absolute; z-index:2; padding:0; border:0; background:transparent; touch-action:none; opacity:.8; transition:opacity .15s,background .15s; }
  .grip::before { content:""; position:absolute; border-radius:2px; background:var(--muted); transition:background .15s,color .15s; }
  .grip:hover,.grip:focus-visible,.wrap:hover .grip { opacity:1; }
  .grip:hover::before,.grip:focus-visible::before { background:var(--accent); }
  .grip-x,.grip-y { display:flex; align-items:center; justify-content:center; border-radius:6px; color:var(--muted); }
  .grip-x:hover,.grip-y:hover,.grip-x:focus-visible,.grip-y:focus-visible { background:var(--sunken); }
  .grip-x::before,.grip-y::before { position:static; padding:2px 3px; border-radius:5px; background:var(--sunken); box-shadow:inset 0 0 0 1px var(--line); color:inherit; font:11px/1 var(--mono); }
  .grip-x::before { content:"\\2194"; padding:2px 3px; }
  .grip-y::before { content:"\\2195"; font-size:10px; padding:1px 3px; }
  .grip-x:hover::before,.grip-y:hover::before,.grip-x:focus-visible::before,.grip-y:focus-visible::before { background:var(--accent-soft); box-shadow:inset 0 0 0 1px var(--accent-line); color:var(--accent); }
  .grip-x { top:50%; right:1px; width:14px; height:40px; transform:translateY(-50%); cursor:ew-resize; }
  .grip-y { left:18px; right:28px; bottom:0; height:14px; cursor:ns-resize; }
  .grip-corner { right:1px; bottom:1px; width:24px; height:24px; cursor:nwse-resize; }
  .grip-corner::before { right:4px; bottom:4px; width:13px; height:13px; border-right:2px solid var(--muted); border-bottom:2px solid var(--muted); border-radius:0; background:none; }
  .grip-corner:hover::before,.grip-corner:focus-visible::before { border-color:var(--accent); background:none; }
  .wrap.collapsed .grip { display:none; }
  .note { margin:0; padding:0 12px 6px; color:var(--faint); font:9.5px/1.5 var(--sans); }
  .form { display:flex; align-items:flex-end; gap:6px; margin:0 10px; padding:5px 5px 5px 9px; border:1px solid var(--line); border-radius:10px; background:var(--sunken); transition:border-color .15s,box-shadow .15s; }
  .form:focus-within { border-color:color-mix(in srgb, var(--section, var(--accent)) 55%, transparent); box-shadow:0 0 0 2px color-mix(in srgb, var(--section, var(--accent)) 14%, transparent); }
  .input { flex:1; min-width:0; min-height:28px; max-height:110px; padding:3px 0; border:0; background:transparent; color:var(--ink); font:12px/1.5 var(--sans); resize:none; overflow-y:auto; scrollbar-width:thin; }
  .input::placeholder { color:var(--faint); }
  .input:focus-visible { outline:none; }
  .send { flex:none; display:flex; align-items:center; justify-content:center; width:26px; height:26px; padding:0; border:0; border-radius:50%; background:var(--section, var(--accent)); color:var(--on-accent); font:13px/1 var(--mono); transition:background .15s,color .15s; }
  .send:hover:not(:disabled) { filter:brightness(1.1); }
  .send:disabled { background:var(--sunken); color:var(--faint); cursor:default; }
  .foot { display:flex; align-items:center; gap:4px; padding:5px 28px 9px 10px; }
  .seg { display:inline-flex; gap:0; }
  .seg button { padding:2px 6px; border-radius:5px; color:var(--faint); font:9.5px/1.5 var(--sans); white-space:nowrap; transition:background .15s,color .15s; }
  .seg button:hover:not(:disabled) { color:var(--ink); }
  .seg button[aria-pressed="true"] { background:var(--sunken); color:var(--ink); }
  .seg button:disabled { opacity:.5; cursor:default; }
  .usage { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--faint); font:9px/1.5 var(--mono); text-align:right; }
  .copy { flex:none; padding:2px 5px; border-radius:5px; color:var(--muted); font:9.5px/1.5 var(--sans); transition:background .15s,color .15s; }
  .copy:hover { background:var(--sunken); color:var(--ink); }
  @media (max-width:640px) { .head { padding:6px 5px 6px 8px; } .thread { padding:8px 0 2px 10px; } .form { margin:0 8px; } .foot { padding:4px 26px 8px 8px; } }
  ${MARKDOWN_CSS}
`;

/** The pill that offers a conversation after a selection settles; it never mutates the page. */
const ASK_CSS = `
  :host { all:initial; }
  * { box-sizing:border-box; }
  button {
    display:flex; align-items:center; gap:6px; padding:5px 10px 5px 8px;
    border:1px solid light-dark(rgba(17,24,39,.1),rgba(255,255,255,.14)); border-radius:8px;
    background:light-dark(#ffffff,#1b1b1b); color:light-dark(#0a0a0a,#f5f5f5);
    box-shadow:0 1px 2px light-dark(rgba(17,24,39,.07),rgba(0,0,0,.45)),0 6px 20px light-dark(rgba(17,24,39,.1),rgba(0,0,0,.5));
    cursor:pointer; color-scheme:light dark;
    font:500 12px/1.4 ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
    letter-spacing:.005em; white-space:nowrap;
    transition:background .12s,border-color .12s,box-shadow .12s;
    animation:fg-ask-in .13s ease-out;
  }
  svg { flex:none; width:14px; height:14px; color:light-dark(#849f5d,#9ab86e); }
  button:hover {
    background:light-dark(#fbfcf8,#22261c); border-color:light-dark(rgba(132,159,93,.5),rgba(154,184,110,.55));
    box-shadow:0 1px 2px light-dark(rgba(17,24,39,.08),rgba(0,0,0,.5)),0 8px 24px light-dark(rgba(17,24,39,.13),rgba(0,0,0,.55));
  }
  button:active { transform:translateY(.5px); }
  button:focus-visible { outline:2px solid light-dark(#849f5d,#9ab86e); outline-offset:2px; }
  @keyframes fg-ask-in { from { opacity:0; transform:translateY(-3px); } to { opacity:1; transform:none; } }
  @media (prefers-reduced-motion: reduce) { button { animation:none; } }
  :host([data-theme="light"]) button { color-scheme:light; }
  :host([data-theme="dark"]) button { color-scheme:dark; }
`;

/** One color per open section, so overlapping conversations stay tellable apart. */
interface HighlightColor {
  id: string;
  label: string;
  dot: string;
  fill: string;
  media: string;
  line: string;
}

const HIGHLIGHT_COLORS: HighlightColor[] = [
  { id: 'olive', label: 'Olive', dot: '#849f5d', fill: 'rgba(132,159,93,.16)', media: 'rgba(132,159,93,.10)', line: 'rgba(132,159,93,.8)' },
  { id: 'amber', label: 'Amber', dot: '#d99a2b', fill: 'rgba(217,154,43,.18)', media: 'rgba(217,154,43,.10)', line: 'rgba(217,154,43,.8)' },
  { id: 'sky', label: 'Sky', dot: '#4d9fdc', fill: 'rgba(77,159,220,.16)', media: 'rgba(77,159,220,.10)', line: 'rgba(77,159,220,.8)' },
  { id: 'rose', label: 'Rose', dot: '#d9689b', fill: 'rgba(217,104,155,.16)', media: 'rgba(217,104,155,.10)', line: 'rgba(217,104,155,.8)' },
  { id: 'violet', label: 'Violet', dot: '#9a7bd1', fill: 'rgba(154,123,209,.16)', media: 'rgba(154,123,209,.10)', line: 'rgba(154,123,209,.8)' },
  { id: 'teal', label: 'Teal', dot: '#3fae9c', fill: 'rgba(63,174,156,.16)', media: 'rgba(63,174,156,.10)', line: 'rgba(63,174,156,.8)' },
  { id: 'indigo', label: 'Indigo', dot: '#5f6fd6', fill: 'rgba(95,111,214,.16)', media: 'rgba(95,111,214,.10)', line: 'rgba(95,111,214,.8)' },
  { id: 'lime', label: 'Lime', dot: '#8cb43a', fill: 'rgba(140,180,58,.16)', media: 'rgba(140,180,58,.10)', line: 'rgba(140,180,58,.8)' },
  { id: 'coral', label: 'Coral', dot: '#e07352', fill: 'rgba(224,115,82,.16)', media: 'rgba(224,115,82,.10)', line: 'rgba(224,115,82,.8)' },
  { id: 'plum', label: 'Plum', dot: '#b2599f', fill: 'rgba(178,89,159,.16)', media: 'rgba(178,89,159,.10)', line: 'rgba(178,89,159,.8)' },
];

const CHAT_WIDTH = 380;
const CHAT_HEIGHT = 320;
const CHAT_MIN_WIDTH = 280;
const CHAT_MIN_HEIGHT = 200;
const CHAT_MAX_WIDTH = 760;
const CHAT_MAX_HEIGHT = 900;
const COLLAPSED_WIDTH = 20;
const CHAT_SIZE_KEY = 'fg:chatSize:v1';

function highlightColor(value: unknown): HighlightColor | null {
  return typeof value === 'string'
    ? (HIGHLIGHT_COLORS.find((color) => color.id === value) ?? null)
    : null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  kind?: 'error';
  /** DeepSeek's chain of thought, only for answers asked with thinking enabled. */
  reasoning?: string;
  /** Milliseconds spent waiting on an answer that came with reasoning. */
  thoughtFor?: number;
}

interface ChatAnchor {
  /** Null after a reload: the conversation is restored from text, the live selection is not. */
  range: Range | null;
  text: string;
  images: string[];
  media: HTMLImageElement[];
  words: number;
  /** The block the conversation belongs to; null when the page changed and it could not be found. */
  element: Element | null;
  /** PDF page number, so the block can be reattached after the reader rebuilds its pages. */
  page: number | null;
}

interface StoredChat {
  id?: unknown;
  at?: unknown;
  name?: unknown;
  text?: unknown;
  images?: unknown;
  page?: unknown;
  path?: unknown;
  messages?: unknown;
  collapsed?: unknown;
  color?: unknown;
  dx?: unknown;
  dy?: unknown;
  x?: unknown;
  y?: unknown;
  w?: unknown;
  h?: unknown;
}

interface ChatModelSwitch {
  element: HTMLDivElement;
  buttons: HTMLButtonElement[];
  sync(): void;
}

/** Which dimension a resize grip drives: one edge, or both at once from the corner. */
type ResizeAxis = 'x' | 'y' | 'both';

interface ChatBlock {
  id: string;
  at: number;
  key: string;
  host: HTMLDivElement;
  root: ShadowRoot;
  anchor: ChatAnchor;
  messages: ChatMessage[];
  busy: boolean;
  closed: boolean;
  token: number;
  input: HTMLTextAreaElement;
  send: HTMLButtonElement;
  thread: HTMLDivElement;
  /** Work-in-progress bubble; sits between the thread and the composer, never in the transcript. */
  progress: HTMLDivElement;
  wrap: HTMLDivElement;
  usage: HTMLSpanElement;
  copy: HTMLButtonElement;
  collapse: HTMLButtonElement;
  color: HighlightColor;
  colorButton: HTMLButtonElement;
  palette: HTMLDivElement;
  /** Starts as "New Chat"; after the first exchange it becomes a short auto title. */
  name: string;
  nameEl: HTMLSpanElement;
  note: HTMLParagraphElement;
  model: ChatModelSwitch;
  collapsed: boolean;
  /** Where the user dragged the window, relative to its anchored position. */
  offsetX: number;
  offsetY: number;
  /** Absolute page spot of a bookmark chip, so it returns to exactly where it was dropped. */
  chipX: number | null;
  chipY: number | null;
  /** Window size in CSS pixels; kept even while the viewport is too small to draw it whole. */
  width: number;
  height: number;
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) {
  const node = document.createElement(tag);
  node.className = className;
  return node as HTMLElementTagNameMap[K];
}

function localId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

/** Focus inside a chat block lands on its shadow host in the light tree. */
function deepActiveElement(): Element | null {
  let active: Element | null = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

function elementPath(element: Element): string {
  const parts: string[] = [];
  let node: Element | null = element;
  while (node && node !== document.documentElement) {
    let index = 1;
    for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling)
      if (sibling.tagName === node.tagName && !sibling.hasAttribute('data-fg-chat')) index += 1;
    parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${index})`);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

function elementFromPath(path: string): Element | null {
  try {
    return document.querySelector(path);
  } catch {
    return null;
  }
}

/** Rebuild a live range from the saved quote so a restored block keeps its highlight. */
function rangeForQuote(scope: ParentNode, text: string): Range | null {
  const quote = text.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!quote) return null;
  // Scripts and styles can hold a copy of the article text (hydration data, JSON-LD) with no line
  // boxes; a range built there would restore a highlight that can never be drawn.
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      return parent && /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(parent.tagName)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  const characters: string[] = [];
  const positions: { node: Text; offset: number }[] = [];
  let spaced = true;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.textContent ?? '';
    for (let offset = 0; offset < value.length; offset += 1) {
      const character = value[offset];
      if (/\s/.test(character)) {
        if (spaced || !characters.length) continue;
        spaced = true;
        characters.push(' ');
        positions.push({ node: node as Text, offset });
      } else {
        spaced = false;
        characters.push(character.toLowerCase());
        positions.push({ node: node as Text, offset });
      }
    }
  }
  const joined = characters.join('');
  // Prefer the whole quote so the restored range ends where the section does; a page edited since
  // the chat was saved still restores from a prefix rather than losing the highlight entirely.
  const lengths = [...new Set([quote.length, 240, 120, 80])].filter(
    (length) => length > 0 && length <= quote.length,
  );
  const rangeAt = (start: number, length: number) => {
    const begin = positions[start];
    const end = positions[start + length - 1];
    const range = document.createRange();
    range.setStart(begin.node, begin.offset);
    range.setEnd(end.node, Math.min(end.node.textContent?.length ?? 0, end.offset + 1));
    return range;
  };
  const drawable = (range: Range) =>
    [...range.getClientRects()].some((rect) => rect.width > 1 && rect.height > 1);
  // Pages often keep a second, hidden copy of their text; a match inside it can never be drawn, so
  // the first match is only the fallback and a visible one anywhere wins.
  let fallback: Range | null = null;
  let attempts = 0;
  for (const length of lengths) {
    const needle = quote.slice(0, length).trimEnd();
    if (!needle) continue;
    for (
      let start = joined.indexOf(needle);
      start >= 0 && attempts < 12;
      start = joined.indexOf(needle, start + 1)
    ) {
      const range = rangeAt(start, needle.length);
      attempts += 1;
      if (!fallback) fallback = range;
      if (drawable(range)) return range;
    }
    if (attempts >= 12) break;
  }
  return fallback;
}

function elementAroundRange(range: Range): Element | null {
  const start =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  if (!start) return null;
  return (
    start.closest(
      'p, li, blockquote, figcaption, td, th, figure, pre, h1, h2, h3, h4, h5, h6, div, section, article',
    ) ?? start
  );
}

function elementHoldsQuote(element: Element, text: string): boolean {
  const needle = text.replace(/\s+/g, ' ').trim().slice(0, 80).toLowerCase();
  if (!needle) return false;
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase().includes(needle);
}

/** One tidy line that fits a chat header; long names end on a word boundary. */
function shortenName(value: string, max = 48): string {
  const text = value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s"'“”‘’(]+/, '')
    .replace(/[\s"'“”‘’.,;:!?)\]]+$/, '');
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).trimEnd()}\u2026`;
}

/** The last heading before the section, like the title DeepSeek gives a new conversation. */
function nearestHeading(anchor: ChatAnchor): string {
  const start = anchor.range?.startContainer ?? anchor.element;
  if (!start?.isConnected) return '';
  const probe = document.createRange();
  if (anchor.range) probe.setStart(anchor.range.startContainer, anchor.range.startOffset);
  else probe.setStart(start, 0);
  probe.collapse(true);
  const scope =
    anchor.element?.closest('article, main, [role="main"]') ??
    document.querySelector('article, main, [role="main"]') ??
    document.body;
  if (!scope) return '';
  let name = '';
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node as Element;
    if (!/^H[1-6]$/.test(element.tagName)) continue;
    const heading = document.createRange();
    heading.selectNodeContents(element);
    // Headings below the selection come later in the page; stop at the first of them.
    if (probe.compareBoundaryPoints(Range.START_TO_START, heading) < 0) break;
    const text = shortenName(element.textContent ?? '', 64);
    if (text) name = text;
  }
  return name;
}

function sectionName(anchor: ChatAnchor): string {
  return (
    nearestHeading(anchor) ||
    shortenName(anchor.text) ||
    shortenName(anchor.images[0] ?? '') ||
    shortenName(document.title, 48) ||
    (anchor.images.length ? 'Image' : 'Section')
  );
}

/** No attribute means System: the CSS `light-dark()` pairs follow the device. */
function applyTheme(element: Element, theme: Theme) {
  if (theme === 'system') element.removeAttribute('data-theme');
  else element.setAttribute('data-theme', theme);
}

export function createHost(
  initial: Settings,
  actions: {
    hide(): void;
    position(value: Position): void;
    model(value: DeepSeekModel): void;
  },
) {
  const element = document.createElement('div');
  element.id = 'fungusan-gal';
  element.style.cssText =
    'all:initial!important;position:absolute!important;top:0!important;left:0!important;width:0!important;height:0!important;z-index:2147483647!important;pointer-events:none!important;';
  const shadow = element.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `${characterCSS}
    :host { all: initial; } * { box-sizing:border-box; }
    .companion {
      --fg-bg:light-dark(#ffffff,#000000); --fg-sunken:light-dark(#fafafa,#111111);
      --fg-ink:light-dark(#0a0a0a,#f5f5f5); --fg-body:light-dark(#404040,#d4d4d4);
      --fg-muted:light-dark(#737373,#a3a3a3); --fg-faint:light-dark(#a3a3a3,#737373);
      --fg-line:light-dark(#e5e5e5,#262626); --fg-stone:light-dark(#d4d4d4,#404040);
      --fg-accent:#849f5d; --fg-accent-hover:light-dark(#728b4f,#9ab86e);
      --fg-accent-soft:light-dark(rgba(132,159,93,.08),rgba(132,159,93,.14));
      --fg-accent-line:rgba(132,159,93,.45);
      --fg-glass:light-dark(rgba(255,255,255,.95),rgba(0,0,0,.95));
      --fg-danger:light-dark(#b91c1c,#f87171); --fg-on-accent:#ffffff;
      --fg-shadow:0 16px 40px light-dark(rgba(17,24,39,.16),rgba(0,0,0,.55));
      --fg-soft-shadow:0 8px 24px light-dark(rgba(17,24,39,.14),rgba(0,0,0,.5));
      --fg-mono:ui-monospace,SFMono-Regular,Menlo,monospace;
      --fg-sans:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
      --fg-cute:ui-rounded,'SF Pro Rounded','Arial Rounded MT Bold','Nunito','Quicksand',system-ui,sans-serif;
      color-scheme:light dark; position:fixed; pointer-events:none;
      font:12px/1.5 var(--fg-sans); color:var(--fg-body);
    }
    .companion[data-theme="light"] { color-scheme:light; }
    .companion[data-theme="dark"] { color-scheme:dark; }
    /* Display off hides the character and her own chat, not the inline chat surfaces that live
       outside this wrapper: selections, the Ask chip, and open section windows keep working. */
    .companion[data-hidden="true"] .fg-character,
    .companion[data-hidden="true"] .grip,
    .companion[data-hidden="true"] .say,
    .companion[data-hidden="true"] .process { display:none!important; }
    button { font:inherit; color:inherit; cursor:pointer; border:0; }
    button:focus-visible { outline:2px solid var(--fg-accent); outline-offset:2px; }
    .grip { position:absolute; inset:0; width:100%; height:100%; background:transparent; pointer-events:auto; cursor:grab; touch-action:none; border-radius:12px; }
    .grip:active { cursor:grabbing; } .grip:focus-visible { outline:2px solid var(--fg-accent); outline-offset:3px; }
    .fg-emote { background:var(--fg-glass); color:var(--fg-ink); box-shadow:0 2px 8px rgba(0,0,0,.13); }
    .ask-highlight span[hidden] { display:none!important; }
    /* Her reading chat is one speech bubble over her head, never a chat window. Clicking her opens
       an obvious little field; once she answers, the field gives way to her sentence for a few
       seconds before the bubble leaves, so a reply is spoken once and not replayed later. */
    .say {
      position:absolute; bottom:calc(100% + 10px); left:50%;
      transform:translateX(calc(-50% + var(--say-shift, 0px)));
      width:max-content; max-width:min(260px, calc(100vw - 20px));
      pointer-events:auto; transition:opacity .2s ease;
    }
    .say[hidden] { display:none!important; }
    .say[data-leaving="true"] { opacity:0; pointer-events:none; }
    /* During a turn the bubble is only an anchor; the process bubble beside it carries the words. */
    .say[data-mode="process"] { visibility:hidden; }
    .say[data-mode="reply"] {
      display:flex; align-items:center; padding:6px 10px;
      border:1px solid var(--fg-accent-line); border-radius:14px;
      background:var(--fg-bg); box-shadow:var(--fg-soft-shadow);
    }
    .say[data-mode="reply"]::after {
      content:""; position:absolute; bottom:-5px; left:calc(50% - var(--say-shift, 0px));
      width:9px; height:9px; border-right:1px solid var(--fg-accent-line);
      border-bottom:1px solid var(--fg-accent-line); border-bottom-right-radius:2px;
      background:var(--fg-bg); transform:translateX(-50%) rotate(45deg);
    }
    .companion.below .say { top:calc(100% + 10px); bottom:auto; }
    .companion.below .say[data-mode="reply"]::after {
      top:-5px; bottom:auto; border:0; border-top:1px solid var(--fg-accent-line);
      border-left:1px solid var(--fg-accent-line); border-radius:0; border-top-left-radius:2px;
    }
    .say-reply {
      display:block; max-width:100%; padding:0; border:0; background:transparent;
      color:var(--fg-ink); text-align:left;
      font:500 13px/1.5 var(--fg-cute);
      white-space:pre-wrap; overflow-wrap:anywhere; cursor:text;
    }
    .say-reply[hidden],.say-form[hidden] { display:none!important; }
    .say-reply[data-kind="error"] { color:var(--fg-danger); }
    /* While she works, this bubble sits where her sentence will appear; her own bubble stays an
       empty, invisible anchor so opening and closing it keeps working. */
    .process {
      position:absolute; bottom:calc(100% + 10px); left:50%;
      transform:translateX(calc(-50% + var(--say-shift, 0px)));
      display:flex; align-items:center; gap:6px;
      width:max-content; max-width:min(260px, calc(100vw - 20px));
      padding:6px 10px; border:1px solid var(--fg-line); border-radius:14px;
      background:var(--fg-bg); box-shadow:var(--fg-soft-shadow);
      color:var(--fg-muted); font:500 12.5px/1.5 var(--fg-cute);
      pointer-events:none;
    }
    .process[hidden] { display:none!important; }
    .process::before {
      content:""; flex:none; width:5px; height:5px; border-radius:50%;
      background:var(--fg-accent); animation:fg-say-think 1.2s ease-in-out infinite;
    }
    .process::after {
      content:""; position:absolute; bottom:-5px; left:calc(50% - var(--say-shift, 0px));
      width:9px; height:9px; border-right:1px solid var(--fg-line);
      border-bottom:1px solid var(--fg-line); border-bottom-right-radius:2px;
      background:var(--fg-bg); transform:translateX(-50%) rotate(45deg);
    }
    .companion.below .process { top:calc(100% + 10px); bottom:auto; }
    .companion.below .process::after {
      top:-5px; bottom:auto; border:0; border-top:1px solid var(--fg-line);
      border-left:1px solid var(--fg-line); border-radius:0; border-top-left-radius:2px;
    }
    @keyframes fg-say-think { 0%,100%{opacity:.35} 50%{opacity:1} }
    @media (prefers-reduced-motion:reduce) {
      .process::before { animation:none; }
    }
    /* The field matches the section chat's composer: a hairline box on a sunken fill, with no
       decorative pen and no send button. Enter sends. */
    .say-form {
      display:flex; align-items:center; width:min(232px, calc(100vw - 20px));
      padding:6px 9px; border:1px solid var(--fg-line); border-radius:10px;
      background:var(--fg-sunken);
      transition:border-color .15s, box-shadow .15s;
    }
    .say-form:focus-within { border-color:var(--fg-accent); box-shadow:0 0 0 2px var(--fg-accent-soft); }
    .say-input { flex:1 1 auto; width:0; min-width:0; height:22px; padding:0; border:0; background:transparent; color:var(--fg-ink); font:12px/1.4 var(--fg-sans); }
    .say-input::placeholder { color:var(--fg-faint); }
    .say-input:focus-visible { outline:none; }
    /* Bands sit in document coordinates, so the page scrolls them natively with the text. Fixed
       positioning repainted on scroll trailed the compositor by a frame and read as drift. */
    .ask-highlight { position:absolute; top:0; left:0; pointer-events:none; }
    .ask-highlight span { position:absolute; border-radius:3px; background:var(--band-fill,rgba(132,159,93,.16)); box-shadow:inset 0 0 0 1px var(--band-line,rgba(132,159,93,.45)); }
    .ask-highlight span[data-media="true"] { background:var(--band-media,rgba(132,159,93,.1)); box-shadow:inset 0 0 0 2px var(--band-line,rgba(132,159,93,.8)); }
    ${MARKDOWN_CSS}
  `;
  const wrapper = document.createElement('div');
  wrapper.className = 'companion';
  const character = createCharacter(characterForModel(initial.model));
  const grip = document.createElement('button');
  grip.className = 'grip';
  grip.setAttribute(
    'aria-label',
    'Baleen. Click to talk with her about the page; drag or use arrow keys to move.',
  );
  grip.title = 'Click to talk · drag to move';
  const say = document.createElement('div');
  say.className = 'say';
  say.hidden = true;
  say.setAttribute('role', 'region');
  say.setAttribute('aria-label', 'Talk with Baleen');
  const sayReply = document.createElement('button');
  sayReply.type = 'button';
  sayReply.className = 'say-reply';
  sayReply.hidden = true;
  const processBubble = document.createElement('div');
  processBubble.className = 'process';
  processBubble.hidden = true;
  processBubble.setAttribute('role', 'status');
  processBubble.setAttribute('aria-live', 'polite');
  const talkForm = document.createElement('form');
  talkForm.className = 'say-form';
  const talkInput = document.createElement('input');
  talkInput.type = 'text';
  talkInput.className = 'say-input';
  talkInput.placeholder = 'Message Baleen\u2026';
  talkInput.setAttribute('aria-label', 'Message Baleen');
  talkInput.autocomplete = 'off';
  talkForm.append(talkInput);
  say.append(sayReply, talkForm);
  const highlightLayer = document.createElement('div');
  highlightLayer.className = 'ask-highlight';
  highlightLayer.setAttribute('aria-hidden', 'true');
  const highlightBoxes: HTMLSpanElement[] = [];
  wrapper.append(character.element, grip, say, processBubble);
  // The highlight layer lives outside the fixed card: the card stays pinned to the viewport, while
  // the bands are positioned against the document so scrolling moves them with the words.
  shadow.append(style, highlightLayer, wrapper);
  clearStaleHosts();
  document.documentElement.append(element);
  let current = initial,
    x = 0,
    y = 0,
    width = 150,
    height = 300;
  let drag: {
    id: number;
    x: number;
    y: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null = null;
  let modelChoice: DeepSeekModel = initial.model;
  let blocks: ChatBlock[] = [];
  let talkMessages: ChatMessage[] = [];
  let talkBusy = false;
  let talkToken = 0;
  let talkMode: 'ask' | 'reply' = 'ask';
  let sayHideTimer = 0;
  let highlightFrame = 0;
  let repairTimer = 0;
  let lookTimer = 0;
  let restTimer = 0;
  let toneUntil = 0;
  let restored = false;
  let pageWatcher: MutationObserver | null = null;
  const placeKey = () => `${location.origin}${location.pathname}${location.search}`;
  const storageKey = () => `fg:chats:v1:${placeKey()}`;
  const talkStorageKey = () => `fg:talk:v1:${placeKey()}`;
  /**
   * Conversations belong to the site, not the tab: they live in local storage so a reload, a new
   * tab and a browser restart all bring the windows and their bookmarks back. Returns null when the
   * page blocks storage, and the callers fall back to session storage.
   */
  function chatStore(): Storage | null {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }
  /**
   * The page is never read: every look comes from something the user does in her own panel.
   * `hold` returns to idle after that many ms; idle itself settles into the heavier rest sway.
   */
  function look(next: Look, hold = 0) {
    window.clearTimeout(lookTimer);
    window.clearTimeout(restTimer);
    character.setLook(next);
    if (hold) lookTimer = window.setTimeout(() => look('idle'), hold);
    else if (next === 'idle') restTimer = window.setTimeout(() => look('rest'), 45_000);
  }
  /** The arriving answer reads as spoken, then resolves into the exchange's tone. */
  function deliver(tone: 'happy' | 'sad') {
    toneUntil = Date.now() + 2100;
    look('speak');
    lookTimer = window.setTimeout(() => look(tone, 1400), 700);
  }
  function settleLook() {
    window.setTimeout(() => {
      if (!focusedBlock()) look('idle');
    }, 0);
  }
  function modelSwitch() {
    const group = document.createElement('div');
    group.className = 'seg';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'DeepSeek model');
    const buttons = DEEPSEEK_MODELS.map((id) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = id === 'deepseek-flash' ? 'Flash' : 'V4 Pro';
      button.title = DEEPSEEK_MODEL_LABELS[id];
      button.dataset.model = id;
      button.setAttribute('aria-pressed', 'false');
      button.onclick = () => chooseModel(id);
      group.append(button);
      return button;
    });
    return {
      element: group,
      buttons,
      sync() {
        for (const button of buttons)
          button.setAttribute('aria-pressed', String(button.dataset.model === modelChoice));
      },
    };
  }
  function syncModels() {
    for (const block of blocks) {
      block.model.sync();
      for (const button of block.model.buttons) button.disabled = block.busy;
    }
  }
  function focusedBlock(): ChatBlock | null {
    const active = deepActiveElement();
    if (!active) return null;
    for (const block of blocks) if (block.root.contains(active) || block.host === active) return block;
    return null;
  }
  function chooseModel(next: DeepSeekModel) {
    if (next === modelChoice) return;
    modelChoice = next;
    syncModels();
    actions.model(next);
  }
  function closeTalk() {
    stopSayHide();
    hideProcess();
    if (say.hidden) return;
    say.hidden = true;
    settleLook();
  }
  /** Keep the bubble above her unless there is more room below. */
  function fitPanel() {
    const below = y + height / 2 < innerHeight / 2;
    wrapper.classList.toggle('below', below);
    placeTalk();
  }
  /** Keep her whole speech bubble on screen; the tail follows the shift to stay on her head. */
  function placeTalk() {
    const bubble = processBubble.hidden ? say : processBubble;
    if (bubble.hidden) return;
    bubble.style.setProperty('--say-shift', '0px');
    const pill = bubble.getBoundingClientRect();
    const room = 8;
    const shift =
      pill.left < room
        ? room - pill.left
        : pill.right > innerWidth - room
          ? innerWidth - room - pill.right
          : 0;
    bubble.style.setProperty('--say-shift', `${Math.round(shift)}px`);
  }
  function formatUsage(usage?: { input: number; output: number }) {
    return usage
      ? `${usage.input.toLocaleString()} in \u00b7 ${usage.output.toLocaleString()} out`
      : '';
  }
  function lastReply(): ChatMessage | undefined {
    for (let index = talkMessages.length - 1; index >= 0; index -= 1)
      if (talkMessages[index].role === 'assistant') return talkMessages[index];
    return undefined;
  }
  /** One pill: the input before she speaks, her sentence after; history stays out of sight. */
  function renderTalk() {
    const reply = talkMode === 'reply' ? lastReply() : undefined;
    say.dataset.mode = talkBusy ? 'process' : reply ? 'reply' : 'ask';
    talkForm.hidden = talkBusy || !!reply;
    sayReply.hidden = talkBusy || !reply;
    if (reply && !talkBusy) {
      sayReply.textContent = reply.text;
      if (reply.kind) sayReply.dataset.kind = reply.kind;
      else delete sayReply.dataset.kind;
      sayReply.disabled = false;
    }
    placeTalk();
  }
  /** The process bubble is its own speech bubble; it never doubles as a chat message. */
  function showProcess(label: string) {
    // Keep the label current even while the surface is closed, so reopening shows the latest step.
    processBubble.textContent = label;
    if (say.hidden) return;
    processBubble.hidden = false;
    placeTalk();
  }
  function hideProcess() {
    processBubble.hidden = true;
    processBubble.textContent = '';
  }
  /** Her answer is spoken once: after a few seconds the bubble fades and leaves. */
  function stopSayHide() {
    window.clearTimeout(sayHideTimer);
    sayHideTimer = 0;
    delete say.dataset.leaving;
  }
  function hideSayAfterAnswer() {
    stopSayHide();
    sayHideTimer = window.setTimeout(() => {
      if (say.hidden || talkMode !== 'reply') return;
      say.dataset.leaving = 'true';
      sayHideTimer = window.setTimeout(() => {
        sayHideTimer = 0;
        closeTalk();
      }, 220);
    }, 6000);
  }
  function readTalk(): ChatMessage[] {
    try {
      const raw = JSON.parse(sessionStorage.getItem(talkStorageKey()) ?? '[]') as unknown;
      if (!Array.isArray(raw)) return [];
      const messages: ChatMessage[] = [];
      for (const value of raw) {
        if (!value || typeof value !== 'object') continue;
        const item = value as ChatMessage;
        if ((item.role !== 'user' && item.role !== 'assistant') || typeof item.text !== 'string')
          continue;
        const text = item.text.trim();
        // Older builds stored a "pending" placeholder in the transcript; drop it.
        if (!text || String(item.kind) === 'pending') continue;
        messages.push({
          role: item.role,
          text: text.slice(0, 8000),
          ...(item.kind === 'error' ? { kind: 'error' as const } : {}),
        });
      }
      return messages.slice(-24);
    } catch {
      return [];
    }
  }
  function saveTalk() {
    try {
      if (talkMessages.length)
        sessionStorage.setItem(talkStorageKey(), JSON.stringify(talkMessages.slice(-24)));
      else sessionStorage.removeItem(talkStorageKey());
    } catch {
      /* Session storage can be unavailable or full; the chat still works in memory. */
    }
  }
  function openTalk() {
    say.hidden = false;
    stopSayHide();
    // Her last sentence was said once; clicking her opens the field, never a replay of it.
    talkMode = talkBusy ? 'reply' : 'ask';
    fitPanel();
    renderTalk();
    if (talkBusy) showProcess(processBubble.textContent || 'Thinking\u2026');
    else {
      talkInput.focus({ preventScroll: true });
      look('listen');
    }
  }
  function toggleTalk() {
    if (say.hidden && processBubble.hidden) openTalk();
    else closeTalk();
  }
  async function sendTalk() {
    if (talkBusy) return;
    const prompt = talkInput.value.trim();
    if (!prompt) return;
    // A question about Baleen herself is answered from the built-in reference, not the page, so it
    // also works on pages with no readable text. Other messages carry only their matching passages.
    const currentHelp = asksAboutBaleen(prompt);
    const lastUser = talkMessages
      .filter((message) => message.role === 'user' && !message.kind)
      .pop();
    const help = currentHelp || asksAboutBaleen(lastUser?.text);
    const passages = currentHelp ? '' : findPassages(prompt);
    if (!passages && !help) {
      talkMessages.push({
        role: 'assistant',
        text: 'This page has no readable text to talk about.',
        kind: 'error',
      });
      talkMode = 'reply';
      renderTalk();
      saveTalk();
      hideSayAfterAnswer();
      return;
    }
    const history: ChatTurn[] = talkMessages
      .filter((message) => !message.kind)
      .slice(-6)
      .map((message) => ({ role: message.role, content: message.text.slice(0, 600) }));
    talkBusy = true;
    const token = ++talkToken;
    talkInput.value = '';
    talkMessages.push({ role: 'user', text: prompt });
    talkMode = 'reply';
    renderTalk();
    showProcess('Thinking\u2026');
    saveTalk();
    look('thinking');
    try {
      const notes = notesContext(await readNotes());
      const answer = await requestAsk({
        action: 'talk',
        model: modelChoice,
        text: passages,
        title: document.title,
        prompt,
        history,
        notes,
        thinking: false,
      });
      if (token !== talkToken) return;
      const reply = takeNote(answer.text);
      talkMessages.push({ role: 'assistant', text: reply.text });
      if (reply.note && asksToRemember(prompt))
        void saveNote(reply.note.key, reply.note.value);
      deliver('happy');
    } catch (error) {
      if (token !== talkToken) return;
      talkMessages.push({
        role: 'assistant',
        text: error instanceof Error ? error.message : 'Baleen did not answer.',
        kind: 'error',
      });
      deliver('sad');
    } finally {
      if (token === talkToken) {
        talkBusy = false;
        hideProcess();
        renderTalk();
        saveTalk();
        hideSayAfterAnswer();
      }
    }
  }
  sayReply.addEventListener('click', () => {
    if (talkBusy) return;
    stopSayHide();
    talkMode = 'ask';
    renderTalk();
    talkInput.focus({ preventScroll: true });
    look('listen');
  });
  talkForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void sendTalk();
  });
  talkInput.addEventListener('focus', () => {
    if (!talkBusy && Date.now() >= toneUntil) look('listen');
  });
  talkInput.addEventListener('blur', settleLook);
  say.addEventListener('keydown', (event) => event.stopPropagation());
  function sameBox(a: DOMRect, b: DOMRect) {
    return (
      Math.abs(a.left - b.left) < 2 &&
      Math.abs(a.top - b.top) < 2 &&
      Math.abs(a.width - b.width) < 3 &&
      Math.abs(a.height - b.height) < 3
    );
  }
  type Band = { left: number; top: number; right: number; bottom: number; media: boolean };
  /**
   * PDF equations arrive as many small, vertically staggered text spans, so one outline per
   * fragment reads as a staircase. Join touching rects that share a line into a single band.
   */
  function mergeBands(bands: Band[]) {
    const joined = (a: Band, b: Band) => {
      if (a.media !== b.media) return false;
      const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      const minHeight = Math.min(a.bottom - a.top, b.bottom - b.top);
      const gap = Math.max(a.left, b.left) - Math.min(a.right, b.right);
      return minHeight > 0 && overlap > minHeight * 0.25 && gap <= 8;
    };
    for (let pass = 0; pass < 4; pass += 1) {
      let changed = false;
      for (let i = 0; i < bands.length; i += 1) {
        for (let j = i + 1; j < bands.length; j += 1) {
          if (!joined(bands[i], bands[j])) continue;
          bands[i].left = Math.min(bands[i].left, bands[j].left);
          bands[i].top = Math.min(bands[i].top, bands[j].top);
          bands[i].right = Math.max(bands[i].right, bands[j].right);
          bands[i].bottom = Math.max(bands[i].bottom, bands[j].bottom);
          bands.splice(j, 1);
          j -= 1;
          changed = true;
        }
      }
      if (!changed) break;
    }
    return bands;
  }
  /**
   * Chrome adds a full-column rect for every block the range fully contains, so selecting a few
   * paragraphs paints solid boxes over all of them. Each text node's own line boxes hug the words
   * the reader actually selected.
   */
  function lineRects(range: Range): DOMRect[] {
    const root =
      range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentNode
        : range.commonAncestorContainer;
    if (!root) return [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const rects: DOMRect[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text;
      const start = text === range.startContainer ? range.startOffset : 0;
      const end = text === range.endContainer ? range.endOffset : text.data.length;
      if (end <= start || !range.intersectsNode(text)) continue;
      const line = document.createRange();
      line.setStart(text, start);
      line.setEnd(text, end);
      const boxes = line.getClientRects();
      for (let index = 0; index < boxes.length; index += 1) rects.push(boxes[index]);
    }
    return rects;
  }
  /** Each open block keeps an accent outline over its section, so scrolling never erases it. */
  function bandsFor(range: Range, media: Iterable<HTMLImageElement> = []): Band[] {
    if (!range.startContainer.isConnected) return [];
    const bandOf = (rect: DOMRect, isMedia: boolean): Band => ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      media: isMedia,
    });
    const bands: Band[] = [];
    const mediaRects: DOMRect[] = [];
    for (const image of media) {
      if (!image.isConnected) continue;
      const rect = image.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      mediaRects.push(rect);
      bands.push(bandOf(rect, true));
    }
    for (const rect of lineRects(range)) {
      if (rect.width < 2 || rect.height < 2) continue;
      if (mediaRects.some((box) => sameBox(box, rect))) continue;
      bands.push(bandOf(rect, false));
    }
    return mergeBands(bands);
  }
  function anchorBands(anchor: ChatAnchor): Band[] {
    return anchor.range ? bandsFor(anchor.range, anchor.media) : [];
  }
  function paintHighlights() {
    highlightFrame = 0;
    const merged: { band: Band; color: HighlightColor }[] = [];
    for (const block of blocks)
      for (const band of anchorBands(block.anchor)) merged.push({ band, color: block.color });
    const count = Math.min(merged.length, 240);
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    for (let index = 0; index < count; index += 1) {
      let box = highlightBoxes[index];
      if (!box) {
        box = document.createElement('span');
        highlightLayer.append(box);
        highlightBoxes.push(box);
      }
      const { band, color } = merged[index];
      box.hidden = false;
      box.dataset.media = String(band.media);
      box.style.setProperty('--band-fill', color.fill);
      box.style.setProperty('--band-media', color.media);
      box.style.setProperty('--band-line', color.line);
      box.style.left = `${band.left + scrollX}px`;
      box.style.top = `${band.top + scrollY}px`;
      box.style.width = `${band.right - band.left}px`;
      box.style.height = `${band.bottom - band.top}px`;
    }
    for (let index = count; index < highlightBoxes.length; index += 1)
      highlightBoxes[index].hidden = true;
  }
  function queueHighlights() {
    if (highlightFrame) return;
    // jsdom has no requestAnimationFrame; synchronize immediately when it is unavailable.
    if (typeof requestAnimationFrame === 'function')
      highlightFrame = requestAnimationFrame(paintHighlights);
    else paintHighlights();
  }
  function chatKey(anchor: ChatAnchor): string {
    // One conversation per section: walking a few paragraphs on should not start another chat.
    return `${anchor.page ?? ''}|${anchor.text.replace(/\s+/g, ' ').trim().slice(0, 200)}|${anchor.images.join('|')}`;
  }
  function anchorFromCapture(capture: SectionCapture): ChatAnchor | null {
    const page =
      capture.anchor?.closest<HTMLElement>('.page[data-page]') ??
      capture.range.startContainer.parentElement?.closest<HTMLElement>('.page[data-page]') ??
      null;
    const element =
      page ??
      capture.anchor ??
      (capture.range.commonAncestorContainer instanceof Element
        ? capture.range.commonAncestorContainer
        : capture.range.commonAncestorContainer.parentElement);
    if (!element) return null;
    return {
      range: capture.range,
      text: capture.text,
      images: capture.images,
      media: capture.media,
      words: capture.words,
      element,
      page: page ? Number(page.dataset.page) || null : null,
    };
  }
  /** The conversation floats over the page in document coordinates, so it scrolls with the section
   * instead of being inserted into the article's flow and stretching the layout. */
  function blockWidth(block: ChatBlock) {
    // A collapsed row is a chip: narrower and shorter than the open conversation.
    const limit = block.collapsed ? COLLAPSED_WIDTH : block.width;
    return Math.min(limit, Math.max(140, innerWidth - 16));
  }
  function applyBlockWidth(block: ChatBlock) {
    block.host.style.setProperty('width', `${blockWidth(block)}px`, 'important');
  }
  /** Growth happens from the top-left, so a window never jumps while a grip is dragged; only the
   * left edge gives way, and only to keep the whole window on screen. */
  function sizeBlock(block: ChatBlock, left: number) {
    applyBlockWidth(block);
    applyBlockSize(block);
    const maxLeft = scrollX + innerWidth - blockWidth(block) - 4;
    const next = Math.max(scrollX + 4, Math.min(left, maxLeft));
    block.host.style.setProperty('left', `${Math.round(next)}px`, 'important');
  }
  /** Re-seating against the section can move the window when a new height changes which side of it
   * fits, so the spot just resized into is folded into the drag offset first. */
  function adoptPlacement(block: ChatBlock) {
    const box = block.host.getBoundingClientRect();
    const left = box.left + scrollX;
    const top = box.top + scrollY;
    placeBlock(block);
    const seated = block.host.getBoundingClientRect();
    block.offsetX += left - (seated.left + scrollX);
    block.offsetY += top - (seated.top + scrollY);
    placeBlock(block);
  }
  function placeBlock(block: ChatBlock) {
    const width = blockWidth(block);
    applyBlockWidth(block);
    // A bookmark that was dragged keeps the exact page spot it was dropped in, so it stays put
    // through a reload even when the section moved.
    if (block.collapsed && block.chipX != null && block.chipY != null) {
      const maxLeft = Math.max(4, document.documentElement.scrollWidth - width - 4);
      block.host.style.setProperty(
        'left',
        `${Math.round(Math.max(4, Math.min(block.chipX, maxLeft)))}px`,
        'important',
      );
      block.host.style.setProperty('top', `${Math.round(Math.max(4, block.chipY))}px`, 'important');
      return;
    }
    let rect: {
      left: number;
      top: number;
      bottom: number;
      width: number;
      height: number;
    } | null = null;
    const range = block.anchor.range;
    if (range && !range.collapsed && range.startContainer.isConnected) {
      const lines = lineRects(range);
      const last = lines.length ? lines[lines.length - 1] : range.getBoundingClientRect();
      // Sit after the last selected line: a section spanning several screens would otherwise put
      // the window at its very end, far from where the reader is looking.
      const box =
        lines.length > 0
          ? lines.reduce(
              (union, line) => ({
                left: Math.min(union.left, line.left),
                top: Math.min(union.top, line.top),
                right: Math.max(union.right, line.right),
                bottom: Math.max(union.bottom, line.bottom),
              }),
              { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
            )
          : null;
      if (box && box.right > box.left && box.bottom > box.top)
        rect = {
          left: box.left,
          top: box.top,
          bottom: last.bottom,
          width: box.right - box.left,
          height: box.bottom - box.top,
        };
    }
    if (!rect && block.anchor.element?.isConnected) {
      const box = block.anchor.element.getBoundingClientRect();
      rect = { left: box.left, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    }
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    if (!rect || (!rect.width && !rect.height)) {
      block.host.style.setProperty(
        'left',
        `${Math.round(scrollX + innerWidth - width - 12)}px`,
        'important',
      );
      block.host.style.setProperty('top', `${Math.round(scrollY + 16)}px`, 'important');
      return;
    }
    const gap = 10;
    const baseLeft = Math.max(
      scrollX + 8,
      Math.min(rect.left + scrollX, scrollX + innerWidth - width - 8),
    );
    const height = block.host.getBoundingClientRect().height || 160;
    // Prefer below the section; step above it only when the viewport has no room below.
    const fitsBelow = rect.bottom + gap + height <= innerHeight - 8;
    const fitsAbove = rect.top - gap - height >= 8;
    const baseTop =
      !fitsBelow && fitsAbove ? rect.top + scrollY - height - gap : rect.bottom + scrollY + gap;
    // A dragged window keeps its distance from the anchored position through rescrolls and reloads.
    const left = baseLeft + block.offsetX;
    const top = baseTop + block.offsetY;
    block.host.style.setProperty('left', `${Math.round(left)}px`, 'important');
    block.host.style.setProperty('top', `${Math.round(top)}px`, 'important');
  }
  /** The window lives on <html>, independent of the page's own stacking and layout. */
  function attachBlock(block: ChatBlock) {
    if (block.host.parentElement !== document.documentElement)
      document.documentElement.append(block.host);
    placeBlock(block);
  }
  /** A quote is only worth keeping while its text is still in the page and can actually be drawn. */
  function rangeAlive(range: Range | null): range is Range {
    if (!range || range.collapsed) return false;
    if (!range.startContainer.isConnected || !range.endContainer.isConnected) return false;
    if (!range.toString().trim()) return false;
    return [...range.getClientRects()].some((rect) => rect.width > 1 && rect.height > 1);
  }
  function elementDraws(element: Element | null): boolean {
    if (!element?.isConnected) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }
  function reanchor(block: ChatBlock) {
    const anchor = block.anchor;
    // A DOM rebuild (the PDF reader's zoom, a hydrated page) re-homes a range's endpoints instead
    // of detaching them, so a connected but collapsed, empty or undrawable range no longer covers
    // the quoted text.
    if (rangeAlive(anchor.range)) return;
    anchor.range = null;
    if (!anchor.text) return;
    const scope =
      (anchor.page != null
        ? document.querySelector<HTMLElement>(`.page[data-page="${anchor.page}"]`)
        : elementDraws(anchor.element)
          ? anchor.element
          : null) ??
      document.querySelector<HTMLElement>('main, article, [role="main"]') ??
      document.body;
    anchor.range = rangeForQuote(scope, anchor.text);
    const wider =
      document.querySelector<HTMLElement>('main, article, [role="main"]') ?? document.body;
    if (wider !== scope) {
      const broad = rangeForQuote(wider, anchor.text);
      // A narrow scope can satisfy the prefix fallback while missing the rest of the quote.
      if (broad && (!anchor.range || broad.toString().length > anchor.range.toString().length))
        anchor.range = broad;
    }
    // A hidden or detached copy of the text (an unopened tab, a collapsed drawer) is no better than
    // no range: leaving it empty lets the repair retries pick the text up once it is drawn.
    if (!rangeAlive(anchor.range)) anchor.range = null;
    if (anchor.page == null && anchor.range && !elementDraws(anchor.element))
      anchor.element = elementAroundRange(anchor.range);
  }
  /** Whether a restored block is still waiting for its text to exist or be redrawn. */
  function blocksNeedRepair(): boolean {
    return blocks.some((block) => {
      if (block.closed || !block.anchor.text) return false;
      const range = block.anchor.range;
      return (
        !range ||
        range.collapsed ||
        !range.startContainer.isConnected ||
        !range.endContainer.isConnected
      );
    });
  }
  function repairSettled() {
    if (blocksNeedRepair()) scheduleRepair();
  }
  function thoughtBlock(message: ChatMessage): HTMLDetailsElement {
    const details = document.createElement('details');
    details.className = 'thought';
    const summary = document.createElement('summary');
    const seconds = Math.round((message.thoughtFor ?? 0) / 1000);
    summary.textContent =
      !message.thoughtFor || seconds < 1 ? 'Thought for a moment' : `Thought for ${seconds}s`;
    const body = document.createElement('div');
    body.className = 'thought-body markdown';
    body.append(renderMarkdown(message.reasoning ?? ''));
    details.append(summary, body);
    return details;
  }
  function renderThread(block: ChatBlock) {
    block.thread.replaceChildren();
    for (const message of block.messages) {
      const line = document.createElement('div');
      line.className = message.role === 'user' ? 'msg-user' : 'msg-assistant';
      if (message.kind) line.dataset.kind = message.kind;
      if (message.role === 'assistant' && !message.kind) {
        line.classList.add('markdown');
        if (message.reasoning) line.append(thoughtBlock(message));
        line.append(renderMarkdown(message.text));
        bindBlockDrag(block, line, true);
      } else {
        line.textContent = message.text;
      }
      block.thread.append(line);
    }
    if (block.messages.length) block.thread.scrollTop = block.thread.scrollHeight;
  }
  function showProgress(block: ChatBlock, label: string) {
    block.progress.textContent = label;
    block.progress.hidden = false;
  }
  function hideProgress(block: ChatBlock) {
    block.progress.hidden = true;
    block.progress.textContent = '';
  }
  function resizeChatInput(block: ChatBlock) {
    block.input.style.height = 'auto';
    block.input.style.height = `${Math.min(110, Math.max(32, block.input.scrollHeight))}px`;
  }
  function syncBlock(block: ChatBlock) {
    const readable = !!block.anchor.text || block.anchor.images.length > 0;
    block.send.disabled = block.busy || !readable || !block.input.value.trim();
    block.model.sync();
    for (const button of block.model.buttons) button.disabled = block.busy;
  }
  /** The next unused palette entry, so a new section never looks like one already open. */
  function autoColor(): HighlightColor {
    const used = new Set(blocks.map((block) => block.color.id));
    return (
      HIGHLIGHT_COLORS.find((color) => !used.has(color.id)) ??
      HIGHLIGHT_COLORS[blocks.length % HIGHLIGHT_COLORS.length]
    );
  }
  function clampSize(value: number, min: number, max: number) {
    return Math.round(Math.min(Math.max(value, min), Math.max(min, max)));
  }
  /** New conversations start at the size the last one was left at, so sizing sticks. */
  function readChatSize(): { width: number; height: number } | null {
    try {
      const store = chatStore();
      const raw = JSON.parse(
        store?.getItem(CHAT_SIZE_KEY) ?? sessionStorage.getItem(CHAT_SIZE_KEY) ?? 'null',
      ) as {
        w?: unknown;
        h?: unknown;
      } | null;
      if (typeof raw?.w !== 'number' || typeof raw?.h !== 'number') return null;
      if (!Number.isFinite(raw.w) || !Number.isFinite(raw.h)) return null;
      return {
        width: clampSize(raw.w, CHAT_MIN_WIDTH, CHAT_MAX_WIDTH),
        height: clampSize(raw.h, CHAT_MIN_HEIGHT, CHAT_MAX_HEIGHT),
      };
    } catch {
      return null;
    }
  }
  function rememberChatSize(width: number, height: number) {
    try {
      (chatStore() ?? sessionStorage).setItem(CHAT_SIZE_KEY, JSON.stringify({ w: width, h: height }));
    } catch {
      /* Storage can be unavailable; the window still works without it. */
    }
  }
  /** The window always has a height of its own, and the thread takes the remaining room and scrolls. */
  function applyBlockSize(block: ChatBlock) {
    if (block.collapsed) {
      block.wrap.style.removeProperty('height');
      return;
    }
    // The stored height is kept; only the drawn height gives way on a short viewport, so the window
    // grows back when the viewport does instead of silently staying small.
    const limit = Math.max(CHAT_MIN_HEIGHT, innerHeight - 24);
    block.wrap.style.height = `${Math.min(block.height, limit)}px`;
  }
  /** A grip drags one edge, or the corner, and keeps the opposite edges still. */
  function bindGrip(block: ChatBlock, grip: HTMLButtonElement, axis: ResizeAxis) {
    const clampWidth = (value: number) =>
      clampSize(value, CHAT_MIN_WIDTH, Math.min(CHAT_MAX_WIDTH, innerWidth - 24));
    const clampHeight = (value: number) =>
      clampSize(value, CHAT_MIN_HEIGHT, Math.min(CHAT_MAX_HEIGHT, innerHeight - 24));
    const resize = (width: number, height: number, left: number) => {
      if (axis !== 'y') block.width = width;
      if (axis !== 'x') block.height = height;
      sizeBlock(block, left);
    };
    grip.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || block.collapsed) return;
      event.preventDefault();
      event.stopPropagation();
      const box = block.wrap.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = box.width;
      const startHeight = box.height;
      const startLeft = box.left + scrollX;
      try {
        grip.setPointerCapture(event.pointerId);
      } catch {
        /* Synthetic pointers cannot be captured; the grip listeners still track the drag. */
      }
      const move = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== event.pointerId) return;
        resize(
          clampWidth(startWidth + moveEvent.clientX - startX),
          clampHeight(startHeight + moveEvent.clientY - startY),
          startLeft,
        );
      };
      const end = (endEvent: PointerEvent) => {
        if (endEvent.pointerId !== event.pointerId) return;
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', end);
        grip.removeEventListener('pointercancel', end);
        if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
        rememberChatSize(block.width, block.height);
        adoptPlacement(block);
        saveChats();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', end);
      grip.addEventListener('pointercancel', end);
    });
    // Arrow keys resize from the keyboard; Shift makes a bigger step.
    grip.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 60 : 20;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      if ((!dx && !dy) || (axis === 'x' && dy) || (axis === 'y' && dx)) return;
      event.preventDefault();
      event.stopPropagation();
      const box = block.host.getBoundingClientRect();
      resize(
        clampWidth(box.width + dx),
        clampHeight(box.height + dy),
        box.left + scrollX,
      );
      rememberChatSize(block.width, block.height);
      adoptPlacement(block);
      saveChats();
    });
  }
  /**
   * The header and each rendered answer are drag handles: grabbing either moves the window, and
   * the offset is kept through scrolls and reloads. Links, buttons and other controls inside an
   * answer keep their own behavior.
   */
  function bindBlockDrag(block: ChatBlock, handle: HTMLElement, fromAnswer = false) {
    let dragging = false;
    let armed = false;
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      // The bookmark is itself a button, so it is allowed through the control filter below.
      const chip = block.collapsed;
      if (
        !chip &&
        (event.target as Element | null)?.closest(
          'a, button, input, textarea, select, summary, [contenteditable="true"]',
        )
      )
        return;
      // An answer and a bookmark both wait for real movement, so a click still places the caret,
      // selects a word or opens the chat; the open header takes the press straight away.
      dragging = !fromAnswer && !chip;
      armed = true;
      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = parseFloat(block.host.style.left) || 0;
      const startTop = parseFloat(block.host.style.top) || 0;
      const baseLeft = startLeft - block.offsetX;
      const baseTop = startTop - block.offsetY;
      if (!fromAnswer && !chip) event.preventDefault();
      const move = (moveEvent: PointerEvent) => {
        if (!armed || moveEvent.pointerId !== event.pointerId) return;
        if (!dragging) {
          if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) <= 4) return;
          dragging = true;
          block.wrap.classList.add('moving');
          document.getSelection()?.removeAllRanges();
        }
        moveEvent.preventDefault();
        const box = block.host.getBoundingClientRect();
        const maxLeft = Math.max(scrollX + 4, scrollX + innerWidth - box.width - 4);
        const left = Math.max(
          scrollX + 4,
          Math.min(startLeft + moveEvent.clientX - startX, maxLeft),
        );
        const top = Math.max(4, startTop + moveEvent.clientY - startY);
        block.offsetX = left - baseLeft;
        block.offsetY = top - baseTop;
        if (block.collapsed) {
          block.chipX = left;
          block.chipY = top;
        }
        block.host.style.setProperty('left', `${Math.round(left)}px`, 'important');
        block.host.style.setProperty('top', `${Math.round(top)}px`, 'important');
      };
      const end = (endEvent: PointerEvent) => {
        if (endEvent.pointerId !== event.pointerId || !armed) return;
        armed = false;
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', end, true);
        window.removeEventListener('pointercancel', end, true);
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        block.wrap.classList.remove('moving');
        if (dragging) {
          // The bookmark is also the expand button, so a drag must not fire its click as well.
          if (block.collapsed) {
            const swallow = (clickEvent: Event) => {
              clickEvent.preventDefault();
              clickEvent.stopPropagation();
            };
            handle.addEventListener('click', swallow, { capture: true });
            window.setTimeout(() => handle.removeEventListener('click', swallow, true), 0);
          }
          saveChats();
        }
        dragging = false;
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', end, true);
      window.addEventListener('pointercancel', end, true);
      // The bookmark is a button: capturing the pointer would retarget its click away from the
      // expand handler, so its drag relies on the window listeners alone.
      if (!fromAnswer && !chip) {
        try {
          handle.setPointerCapture(event.pointerId);
        } catch {
          /* Synthetic pointers cannot be captured; the window listeners still track the drag. */
        }
      }
    });
  }
  function createChatBlock(
    anchor: ChatAnchor,
    messages: ChatMessage[] = [],
    stored?: StoredChat,
  ): ChatBlock {
    const host = document.createElement('div');
    host.setAttribute('data-fg-chat', '');
    applyTheme(host, current.theme);
    host.style.cssText =
      'all:initial!important;display:block!important;position:absolute!important;top:0!important;left:0!important;width:380px!important;z-index:2147483647!important;pointer-events:auto!important;';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CHAT_CSS;
    const wrap = make('div', 'wrap');
    const head = make('div', 'head');
    const titles = make('div', 'titles');
    const storedName = stored && typeof stored.name === 'string' ? shortenName(stored.name, 64) : '';
    const name = storedName || 'New Chat';
    const nameEl = make('span', 'name');
    nameEl.textContent = name;
    nameEl.title = name;
    titles.append(nameEl);
    const collapse = make('button', 'collapse');
    collapse.type = 'button';
    collapse.textContent = '\u2212';
    collapse.setAttribute('aria-label', 'Collapse section chat');
    collapse.setAttribute('aria-expanded', 'true');
    collapse.title = 'Collapse';
    const close = make('button', 'close');
    close.type = 'button';
    close.textContent = '\u00d7';
    close.setAttribute('aria-label', 'Close section chat');
    const colorButton = make('button', 'color');
    colorButton.type = 'button';
    colorButton.setAttribute('aria-expanded', 'false');
    const palette = make('div', 'palette');
    palette.hidden = true;
    palette.setAttribute('role', 'group');
    palette.setAttribute('aria-label', 'Highlight color');
    for (const option of HIGHLIGHT_COLORS) {
      const swatch = make('button', 'swatch');
      swatch.type = 'button';
      swatch.dataset.color = option.id;
      swatch.style.setProperty('--dot', option.dot);
      swatch.setAttribute('aria-label', `Highlight ${option.label.toLowerCase()}`);
      swatch.title = option.label;
      palette.append(swatch);
    }
    head.append(colorButton, titles, collapse, close);
    const thread = make('div', 'thread');
    thread.setAttribute('role', 'log');
    thread.setAttribute('aria-live', 'polite');
    const progress = make('div', 'process');
    progress.hidden = true;
    progress.setAttribute('role', 'status');
    progress.setAttribute('aria-live', 'polite');
    const note = make('p', 'note');
    note.hidden = true;
    const form = make('form', 'form');
    const input = make('textarea', 'input');
    input.rows = 1;
    input.placeholder = 'Ask about this section\u2026';
    input.setAttribute('aria-label', 'Question about the selected section');
    const send = make('button', 'send');
    send.type = 'submit';
    send.textContent = '\u2191';
    send.setAttribute('aria-label', 'Send question');
    send.disabled = true;
    form.append(input, send);
    const foot = make('div', 'foot');
    const model = modelSwitch();
    const usage = make('span', 'usage');
    const copy = make('button', 'copy');
    copy.type = 'button';
    copy.textContent = 'Copy';
    copy.hidden = true;
    foot.append(model.element, usage, copy);
    const grips: Array<{
      element: HTMLButtonElement;
      axis: ResizeAxis;
      label: string;
      hint: string;
    }> = [
      {
        element: make('button', 'grip grip-x'),
        axis: 'x',
        label: 'Change section chat width',
        hint: 'Drag to change width. Arrow keys work too, Shift for bigger steps.',
      },
      {
        element: make('button', 'grip grip-y'),
        axis: 'y',
        label: 'Change section chat height',
        hint: 'Drag to change height. Arrow keys work too, Shift for bigger steps.',
      },
      {
        element: make('button', 'grip grip-corner'),
        axis: 'both',
        label: 'Resize section chat',
        hint: 'Drag to resize. Arrow keys work too, Shift for bigger steps.',
      },
    ];
    for (const grip of grips) {
      grip.element.type = 'button';
      grip.element.title = grip.hint;
      grip.element.setAttribute('aria-label', grip.label);
    }
    wrap.append(head, palette, thread, progress, note, form, foot, ...grips.map((grip) => grip.element));
    root.append(style, wrap);
    const imageCount = anchor.media.length || anchor.images.length;
    note.hidden = !imageCount;
    note.textContent = imageCount
      ? anchor.images.length
        ? 'Baleen reads text only: image captions and alt text are sent, never pixels.'
        : 'Baleen reads text only: this image has no caption or alt text. Select the caption too, or ask about the page text.'
      : '';
    const lastSize = readChatSize();
    const block: ChatBlock = {
      id: stored && typeof stored.id === 'string' && stored.id ? stored.id : localId(),
      at:
        stored && typeof stored.at === 'number' && Number.isFinite(stored.at)
          ? stored.at
          : Date.now(),
      key: chatKey(anchor),
      host,
      root,
      anchor,
      messages,
      busy: false,
      closed: false,
      token: 0,
      input,
      send,
      thread,
      progress,
      wrap,
      usage,
      copy,
      collapse,
      color: highlightColor(stored?.color) ?? autoColor(),
      colorButton,
      palette,
      name,
      nameEl,
      note,
      model,
      collapsed: false,
      offsetX:
        stored && typeof stored.dx === 'number' && Number.isFinite(stored.dx)
          ? Math.max(-20000, Math.min(20000, stored.dx))
          : 0,
      offsetY:
        stored && typeof stored.dy === 'number' && Number.isFinite(stored.dy)
          ? Math.max(-20000, Math.min(20000, stored.dy))
          : 0,
      chipX: null,
      chipY: null,
      width:
        stored && typeof stored.w === 'number' && Number.isFinite(stored.w)
          ? clampSize(stored.w, CHAT_MIN_WIDTH, CHAT_MAX_WIDTH)
          : (lastSize?.width ?? CHAT_WIDTH),
      height:
        stored && typeof stored.h === 'number' && Number.isFinite(stored.h)
          ? clampSize(stored.h, CHAT_MIN_HEIGHT, CHAT_MAX_HEIGHT)
          : (lastSize?.height ?? CHAT_HEIGHT),
    };
    renderThread(block);
    applyBlockSize(block);
    setBlockColor(block, block.color, false);
    collapse.onclick = () => setCollapsed(block, !block.collapsed);
    for (const swatch of palette.querySelectorAll<HTMLButtonElement>('button')) {
      swatch.onclick = () => {
        const next = highlightColor(swatch.dataset.color);
        if (!next) return;
        setBlockColor(block, next);
        palette.hidden = true;
        colorButton.setAttribute('aria-expanded', 'false');
        placeBlock(block);
      };
    }
    colorButton.onclick = () => {
      // The chip hides the palette to stay small, so choosing a color opens the conversation.
      if (block.collapsed) setCollapsed(block, false);
      palette.hidden = !palette.hidden;
      colorButton.setAttribute('aria-expanded', String(!palette.hidden));
      if (!palette.hidden) placeBlock(block);
    };
    // The header is the drag handle: the window still anchors to its section unless moved, and the
    // offset is kept so a dragged window stays where it was put through scrolls and reloads.
    bindBlockDrag(block, head);
    for (const grip of grips) bindGrip(block, grip.element, grip.axis);
    close.onclick = () => closeBlock(block);
    copy.onclick = () => {
      const last = [...block.messages]
        .reverse()
        .find((message) => message.role === 'assistant' && !message.kind);
      if (last) void copyValue(last.text, copy, 'Copy');
    };
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void sendChat(block);
    });
    input.addEventListener('input', () => {
      resizeChatInput(block);
      syncBlock(block);
    });
    input.addEventListener('focus', () => {
      // A focus caused by refocusing after an answer must not cut its reaction short.
      if (!block.busy && Date.now() >= toneUntil) look('listen');
    });
    input.addEventListener('blur', settleLook);
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      void sendChat(block);
    });
    // Keep the host page from treating a click in the conversation as a page interaction.
    host.addEventListener('pointerdown', (event) => {
      const path = event.composedPath();
      if (!block.palette.hidden && !path.includes(block.palette) && !path.includes(colorButton)) {
        block.palette.hidden = true;
        colorButton.setAttribute('aria-expanded', 'false');
      }
      event.stopPropagation();
    });
    host.addEventListener('click', (event) => event.stopPropagation());
    host.addEventListener('keydown', (event) => event.stopPropagation());
    syncBlock(block);
    resizeChatInput(block);
    if (stored?.collapsed === true) {
      if (typeof stored.x === 'number' && Number.isFinite(stored.x)) block.chipX = stored.x;
      if (typeof stored.y === 'number' && Number.isFinite(stored.y)) block.chipY = stored.y;
      setCollapsed(block, true, false);
    }
    return block;
  }
  function setBlockColor(block: ChatBlock, color: HighlightColor, remember = true) {
    block.color = color;
    block.root.querySelector<HTMLElement>('.wrap')?.style.setProperty('--section', color.dot);
    block.colorButton.setAttribute('aria-label', `Highlight color: ${color.label}`);
    block.colorButton.title = `Highlight color: ${color.label}`;
    for (const button of block.palette.querySelectorAll<HTMLButtonElement>('button'))
      button.setAttribute('aria-pressed', String(button.dataset.color === color.id));
    queueHighlights();
    if (remember) saveChats();
  }
  function setCollapsed(block: ChatBlock, next: boolean, remember = true) {
    const wasCollapsed = block.collapsed;
    block.collapsed = next;
    block.root.querySelector('.wrap')?.classList.toggle('collapsed', next);
    block.collapse.textContent = next ? '+' : '\u2212';
    block.collapse.setAttribute('aria-expanded', String(!next));
    block.collapse.setAttribute('aria-label', next ? 'Expand section chat' : 'Collapse section chat');
    block.collapse.title = next ? 'Expand' : 'Collapse';
    if (next) {
      block.palette.hidden = true;
      block.colorButton.setAttribute('aria-expanded', 'false');
      // The bookmark keeps the exact page spot it sits in, and expanding again starts there
      // instead of jumping back to the section. A block restored from storage is not in the page
      // yet; its stored spot is already on the block and must not be replaced by the host's 0,0.
      if (block.host.isConnected) {
        const left = Number.parseFloat(block.host.style.left);
        const top = Number.parseFloat(block.host.style.top);
        if (Number.isFinite(left) && Number.isFinite(top)) {
          block.chipX = left;
          block.chipY = top;
        }
      }
    }
    // Collapsing frees vertical space and expanding needs more: re-place against the section.
    applyBlockSize(block);
    if (block.host.isConnected) {
      if (!next && wasCollapsed) {
        block.chipX = null;
        block.chipY = null;
        adoptPlacement(block);
        // A bookmark parked near the right edge must not push the wider window off screen.
        const box = block.host.getBoundingClientRect();
        const over = box.left + scrollX - (scrollX + innerWidth - box.width - 4);
        if (over > 0) {
          block.offsetX -= over;
          placeBlock(block);
        }
      } else placeBlock(block);
    }
    if (remember) saveChats();
  }
  function openChat(capture: SectionCapture, focus = false) {
    hideAskChip();
    const anchor = anchorFromCapture(capture);
    if (!anchor) return;
    const key = chatKey(anchor);
    const existing = blocks.find((block) => block.key === key);
    if (existing) {
      if (existing.collapsed) setCollapsed(existing, false);
      existing.host.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (focus) existing.input.focus({ preventScroll: true });
      return;
    }
    const block = createChatBlock(anchor);
    blocks.push(block);
    attachBlock(block);
    syncModels();
    saveChats();
    queueHighlights();
    if (focus) block.input.focus({ preventScroll: true });
  }
  /**
   * The first exchange names the conversation. A failed title request falls back to the section
   * heading, so the header never stays "New Chat" after a real question.
   */
  async function nameChat(block: ChatBlock, question: string, answer: string) {
    let title = '';
    try {
      const result = await requestAsk({
        action: 'title',
        model: 'deepseek-flash',
        text: `Reader: ${question.slice(0, 900)}\n\nBaleen: ${answer.slice(0, 900)}`,
        title: document.title,
      });
      title = shortenName(result.text, 48);
    } catch {
      title = '';
    }
    if (block.closed || block.name !== 'New Chat') return;
    const next = title || sectionName(block.anchor) || shortenName(question, 48);
    if (!next) return;
    block.name = next;
    block.nameEl.textContent = next;
    block.nameEl.title = next;
    saveChats();
  }
  async function sendChat(block: ChatBlock) {
    if (block.busy || block.closed) return;
    if (!block.anchor.text && !block.anchor.images.length) return;
    const prompt = block.input.value.trim();
    if (!prompt) return;
    const first = !block.messages.some(
      (message) => message.role === 'assistant' && !message.kind,
    );
    const history: ChatTurn[] = block.messages
      .filter((message) => !message.kind)
      .slice(-6)
      .map((message) => ({ role: message.role, content: message.text }));
    block.busy = true;
    block.input.value = '';
    resizeChatInput(block);
    block.messages.push({ role: 'user', text: prompt });
    block.usage.textContent = '';
    block.copy.hidden = true;
    renderThread(block);
    syncBlock(block);
    saveChats();
    showProgress(block, 'Thinking\u2026');
    look('thinking');
    const token = ++block.token;
    const started = Date.now();
    try {
      const notes = notesContext(await readNotes());
      const answer = await requestAsk({
        action: 'chat',
        model: modelChoice,
        text: block.anchor.text,
        images: block.anchor.images,
        title: document.title,
        prompt,
        history,
        notes,
        thinking: true,
      });
      if (block.closed || token !== block.token) return;
      const reply = takeNote(answer.text);
      block.messages.push({
        role: 'assistant',
        text: reply.text,
        reasoning: answer.reasoning,
        thoughtFor: answer.reasoning ? Date.now() - started : undefined,
      });
      if (reply.note && asksToRemember(prompt))
        void saveNote(reply.note.key, reply.note.value);
      block.usage.textContent = formatUsage(answer.usage);
      block.copy.hidden = false;
      if (first) void nameChat(block, prompt, reply.text);
      deliver('happy');
    } catch (error) {
      if (block.closed || token !== block.token) return;
      block.messages.push({
        role: 'assistant',
        text: error instanceof Error ? error.message : 'Baleen did not answer.',
        kind: 'error',
      });
      deliver('sad');
    } finally {
      if (!block.closed && token === block.token) {
        block.busy = false;
        hideProgress(block);
        renderThread(block);
        syncBlock(block);
        saveChats();
        block.input.focus({ preventScroll: true });
      }
    }
  }
  function closeBlock(block: ChatBlock) {
    if (block.closed) return;
    block.closed = true;
    block.token += 1;
    block.host.remove();
    blocks = blocks.filter((item) => item !== block);
    saveChats();
    syncModels();
    queueHighlights();
    settleLook();
  }
  function closeAllChats() {
    const count = blocks.length;
    if (!count) return count;
    for (const block of blocks) {
      block.closed = true;
      block.token += 1;
      block.host.remove();
    }
    blocks = [];
    saveChats();
    syncModels();
    queueHighlights();
    settleLook();
    return count;
  }
  function chatHistoryMarkdown(): string {
    const lines = ['# Baleen chat history', ''];
    lines.push(`- Page: ${document.title || 'Untitled'}`);
    lines.push(`- URL: ${location.href}`);
    lines.push(`- Exported: ${new Date().toISOString()}`);
    let sections = 0;
    for (const block of blocks) {
      if (!block.messages.some((message) => message.role === 'user')) continue;
      sections += 1;
      lines.push('', `## ${sections}. ${block.name}`);
      if (block.anchor.images.length)
        lines.push('', `_Images (text only): ${block.anchor.images.join(' \u00b7 ')}_`);
      lines.push('');
      for (const message of block.messages) {
        const label = message.role === 'user' ? 'You' : 'Baleen';
        const suffix = message.kind === 'error' ? ' (error)' : '';
        if (message.reasoning)
          lines.push(
            '<details><summary>Thinking</summary>',
            '',
            message.reasoning,
            '',
            '</details>',
          );
        lines.push(`**${label}${suffix}:**`, message.text, '');
      }
    }
    const talked = talkMessages.some((message) => message.role === 'user');
    if (talked) {
      lines.push('', '## Reading chat', '');
      for (const message of talkMessages) {
        const label = message.role === 'user' ? 'You' : 'Baleen';
        const suffix = message.kind === 'error' ? ' (error)' : '';
        lines.push(`**${label}${suffix}:**`, message.text, '');
      }
    }
    if (!sections && !talked) return '';
    return `${lines.join('\n').trimEnd()}\n`;
  }
  async function studyPage(action: 'keywords' | 'summarize'): Promise<string> {
    const text = pagePassage();
    if (!text) throw new Error('This page has no readable text to study.');
    const result = await requestAsk({
      action,
      model: modelChoice,
      text,
      title: document.title,
      thinking: false,
    });
    return result.text;
  }
  function saveChats() {
    const items = blocks.map((block) => ({
      id: block.id,
      at: block.at,
      name: block.name,
      text: block.anchor.text.slice(0, 6000),
      images: block.anchor.images.slice(0, 6),
      page: block.anchor.page,
      path:
        block.anchor.page == null && block.anchor.element?.isConnected
          ? elementPath(block.anchor.element)
          : null,
      messages: block.messages.slice(-40),
      collapsed: block.collapsed,
      color: block.color.id,
      dx: Math.round(block.offsetX),
      dy: Math.round(block.offsetY),
      w: block.width,
      h: block.height,
      x: block.collapsed && block.chipX != null ? Math.round(block.chipX) : null,
      y: block.collapsed && block.chipY != null ? Math.round(block.chipY) : null,
    }));
    const store = chatStore() ?? sessionStorage;
    const write = (target: Storage, value: unknown[]) => {
      if (value.length) target.setItem(storageKey(), JSON.stringify(value));
      else target.removeItem(storageKey());
    };
    try {
      write(store, items);
      if (store !== sessionStorage) sessionStorage.removeItem(storageKey());
    } catch {
      // Local storage can be full or blocked: fall back to this tab, keeping the newest turns.
      try {
        write(
          sessionStorage,
          items.map((item) => ({ ...item, messages: item.messages.slice(-10) })),
        );
      } catch {
        /* Storage can be unavailable or full; the page keeps working without it. */
      }
    }
  }
  function restoreChats() {
    if (restored) return;
    restored = true;
    let items: unknown = null;
    let legacy = false;
    try {
      const saved = chatStore()?.getItem(storageKey());
      legacy = saved == null;
      items = JSON.parse(saved ?? sessionStorage.getItem(storageKey()) ?? '[]');
    } catch {
      return;
    }
    if (!Array.isArray(items)) return;
    for (const raw of items.slice(0, 12)) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as StoredChat;
      const text = typeof item.text === 'string' ? item.text.slice(0, 6000) : '';
      const images = Array.isArray(item.images)
        ? item.images.filter((value): value is string => typeof value === 'string').slice(0, 6)
        : [];
      const page =
        typeof item.page === 'number' && Number.isFinite(item.page) ? item.page : null;
      let element =
        page == null && typeof item.path === 'string' ? elementFromPath(item.path) : null;
      if (page == null && text && (!element || !elementHoldsQuote(element, text))) {
        // Paths drift when the page inserts or reorders nodes; the quote is the sturdier anchor.
        const found = rangeForQuote(document.body, text);
        const around = found ? elementAroundRange(found) : null;
        if (around) element = around;
      }
      if (page == null && !element && !text && !images.length) continue;
      const messages: ChatMessage[] = Array.isArray(item.messages)
        ? item.messages
            .filter(
              (value): value is ChatMessage =>
                !!value &&
                typeof value === 'object' &&
                ((value as ChatMessage).role === 'user' ||
                  (value as ChatMessage).role === 'assistant') &&
                typeof (value as ChatMessage).text === 'string' &&
                String((value as ChatMessage).kind) !== 'pending',
            )
            .map((message) => ({
              role: message.role,
              text: message.text.slice(0, 8000),
              ...(message.kind === 'error' ? { kind: 'error' as const } : {}),
              ...(typeof message.reasoning === 'string' && message.reasoning.trim()
                ? { reasoning: message.reasoning.slice(0, 12_000) }
                : {}),
              ...(typeof message.thoughtFor === 'number' && Number.isFinite(message.thoughtFor)
                ? { thoughtFor: message.thoughtFor }
                : {}),
            }))
            .slice(-40)
        : [];
      const anchor: ChatAnchor = {
        range: null,
        text,
        images,
        media: [],
        words: text.split(/\s+/).filter(Boolean).length,
        element,
        page,
      };
      if (blocks.some((block) => block.key === chatKey(anchor))) continue;
      const block = createChatBlock(anchor, messages, item);
      blocks.push(block);
      attachBlock(block);
      reanchor(block);
      placeBlock(block);
    }
    // Write the restored set back: conversations an older build left in session storage move to
    // local storage and start surviving reloads and new tabs. A set already in local storage is
    // left alone so its saved node paths survive a page that has not finished loading.
    if (legacy) saveChats();
    syncModels();
    queueHighlights();
  }
  function scheduleRepair() {
    window.clearTimeout(repairTimer);
    repairTimer = window.setTimeout(() => {
      for (const block of blocks) {
        if (block.closed) continue;
        if (!block.host.isConnected) attachBlock(block);
        reanchor(block);
        placeBlock(block);
      }
      queueHighlights();
    }, 120);
  }
  function legacyCopy(value: string): boolean {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;';
    document.body.append(area);
    area.select();
    let copied = false;
    try {
      copied = typeof document.execCommand === 'function' && document.execCommand('copy');
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  }
  async function copyText(value: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      /* Fall back to the selection copy below. */
    }
    return legacyCopy(value);
  }
  async function copyValue(value: string, button: HTMLButtonElement, idle: string) {
    const copied = await copyText(value);
    button.textContent = copied ? 'Copied' : 'Failed';
    setTimeout(() => {
      if (button.isConnected) button.textContent = idle;
    }, 1200);
  }
  // A settled selection offers a conversation; it never opens one on its own, so a drag is never
  // interrupted and the browser keeps its selection and copy behavior.
  const askHost = document.createElement('div');
  askHost.id = 'fungusan-ask';
  askHost.style.cssText =
    'all:initial!important;position:fixed!important;top:0!important;left:0!important;z-index:2147483646!important;display:none!important;pointer-events:auto!important;';
  const askRoot = askHost.attachShadow({ mode: 'open' });
  const askStyle = document.createElement('style');
  askStyle.textContent = ASK_CSS;
  const askButton = document.createElement('button');
  askButton.type = 'button';
  askButton.title = 'Open a section chat';
  askButton.setAttribute('aria-label', 'Ask Baleen about the selected text');
  askButton.innerHTML =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8l-3 2.5V11.5H2.5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z"/></svg>';
  const askLabel = document.createElement('span');
  askLabel.textContent = 'Ask Baleen';
  askButton.append(askLabel);
  askRoot.append(askStyle, askButton);
  let pendingCapture: SectionCapture | null = null;
  let askTimer = 0;
  let askHeld = false;
  askHost.addEventListener('pointerdown', (event) => {
    // Keep the page selection alive; letting the button take focus would collapse it.
    askHeld = true;
    pendingCapture = captureSection() ?? pendingCapture;
    event.preventDefault();
    event.stopPropagation();
  });
  askHost.addEventListener('pointerup', () => {
    window.setTimeout(() => {
      askHeld = false;
    }, 0);
  });
  askButton.addEventListener('click', (event) => {
    event.preventDefault();
    const capture = captureSection() ?? pendingCapture;
    hideAskChip();
    if (capture) openChat(capture, true);
  });
  document.documentElement.append(askHost);
  function hideAskChip() {
    window.clearTimeout(askTimer);
    askTimer = 0;
    askHeld = false;
    pendingCapture = null;
    askHost.style.setProperty('display', 'none', 'important');
  }
  function revealAskChip() {
    if (focusedBlock()) {
      hideAskChip();
      return;
    }
    const capture = captureSection();
    if (!capture) {
      hideAskChip();
      return;
    }
    pendingCapture = capture;
    askHost.style.setProperty('display', 'block', 'important');
    const lines = capture.range.getClientRects();
    const line = lines.length ? lines[lines.length - 1] : capture.range.getBoundingClientRect();
    const pill = askButton.getBoundingClientRect();
    if (!line.width && !line.height) {
      hideAskChip();
      return;
    }
    let left = line.right + 6;
    let top = line.bottom + 8;
    if (left + pill.width > innerWidth - 8) left = Math.max(8, line.right - pill.width);
    if (top + pill.height > innerHeight - 8) top = Math.max(8, line.top - pill.height - 8);
    askHost.style.setProperty('left', `${Math.round(left)}px`, 'important');
    askHost.style.setProperty('top', `${Math.round(top)}px`, 'important');
  }
  function queueAskChip() {
    window.clearTimeout(askTimer);
    askTimer = window.setTimeout(revealAskChip, 30);
  }
  const abort = new AbortController();
  document.addEventListener(
    'pointerdown',
    (event) => {
      const path = event.composedPath();
      if (path.includes(askHost)) return;
      hideAskChip();
      if (path.includes(element)) return;
      closeTalk();
    },
    { capture: true, signal: abort.signal },
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'e') {
        const capture = captureSection();
        if (!capture) return;
        event.preventDefault();
        openChat(capture, true);
        return;
      }
      if (event.key !== 'Escape') return;
      const active = focusedBlock();
      if (active) {
        event.preventDefault();
        event.stopPropagation();
        closeBlock(active);
        return;
      }
      hideAskChip();
      if (!say.hidden) {
        event.preventDefault();
        event.stopPropagation();
        closeTalk();
        grip.focus();
      }
    },
    { capture: true, signal: abort.signal },
  );
  // A settled selection offers the action instead of opening a conversation, so a paused drag is
  // never cut short and the browser keeps its selection for copying.
  document.addEventListener(
    'pointerup',
    (event) => {
      if (event.button !== 0) return;
      const path = event.composedPath();
      if (path.includes(askHost) || path.includes(element)) return;
      if (path.some((node) => node instanceof Element && node.hasAttribute('data-fg-chat'))) return;
      if (focusedBlock()) return;
      const live = document.getSelection();
      if (!live || live.isCollapsed) {
        hideAskChip();
        return;
      }
      queueAskChip();
    },
    { capture: true, signal: abort.signal },
  );
  // Shift+Arrow selections get the same offer; in every case the selection itself is untouched.
  document.addEventListener(
    'keyup',
    (event) => {
      if (!event.shiftKey && event.key !== 'Shift') return;
      const path = event.composedPath();
      if (path.includes(askHost) || path.includes(element)) return;
      const live = document.getSelection();
      if (!live || live.isCollapsed) {
        hideAskChip();
        return;
      }
      queueAskChip();
    },
    { capture: true, signal: abort.signal },
  );
  document.addEventListener(
    'selectionchange',
    () => {
      const live = document.getSelection();
      if (askHeld) return;
      if (!live || live.isCollapsed) hideAskChip();
    },
    { signal: abort.signal },
  );
  // Chat pages scroll nested containers, and scroll events do not bubble, so capture them.
  window.addEventListener(
    'scroll',
    () => {
      hideAskChip();
      if (blocksNeedRepair()) scheduleRepair();
      else queueHighlights();
    },
    { capture: true, passive: true, signal: abort.signal },
  );
  function move(nextX: number, nextY: number) {
    ({ x, y } = clampPosition(nextX, nextY, width, height, innerWidth, innerHeight));
    wrapper.style.left = `${x}px`;
    wrapper.style.top = `${y}px`;
    fitPanel();
  }
  function persist() {
    const distances = [x, innerWidth - width - x, y, innerHeight - height - y];
    const closest = Math.min(...distances);
    if (closest < 42) {
      const edge = distances.indexOf(closest);
      move(
        edge === 0 ? 8 : edge === 1 ? innerWidth - width - 8 : x,
        edge === 2 ? 8 : edge === 3 ? innerHeight - height - 8 : y,
      );
    }
    actions.position({
      x: x / Math.max(1, innerWidth - width),
      y: y / Math.max(1, innerHeight - height),
    });
  }
  function resize(scale: number) {
    const art = characterById(characterForModel(current.model));
    // Trimmed art: this is the height of the drawn figure, not of a padded canvas.
    height = Math.min(
      // 312 is what 120% used to draw; 100% now means that size.
      312 * scale,
      Math.max(120, innerHeight - 24),
      Math.max(120, innerWidth - 24) / art.aspect,
    );
    width = height * art.aspect;
    wrapper.style.width = `${width}px`;
    wrapper.style.height = `${height}px`;
    const position = current.position;
    move(
      position ? position.x * (innerWidth - width) : innerWidth - width - 16,
      position ? position.y * (innerHeight - height) : innerHeight - height - 20,
    );
  }
  function apply(value: Settings) {
    current = value;
    wrapper.dataset.hidden = String(value.hidden);
    if (value.hidden) closeTalk();
    modelChoice = value.model;
    applyTheme(wrapper, value.theme);
    applyTheme(askHost, value.theme);
    for (const block of blocks) applyTheme(block.host, value.theme);
    syncModels();
    character.setCharacter(characterForModel(value.model));
    character.setAnimated(value.animate);
    resize(value.scale);
    // The viewport moved the anchor rects and may have changed how much room a window has, so the
    // windows are re-seated beside their sections at their stored size.
    for (const block of blocks) {
      applyBlockSize(block);
      attachBlock(block);
    }
    queueHighlights();
  }
  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    // The page selection stays as it was: a click here talks about the page, not the selection.
    event.preventDefault();
    grip.focus();
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      originX: x,
      originY: y,
      moved: false,
    };
    grip.setPointerCapture(event.pointerId);
  });
  grip.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4)
      drag.moved = true;
    move(drag.originX + event.clientX - drag.x, drag.originY + event.clientY - drag.y);
  });
  const endDrag = () => {
    if (drag) {
      drag = null;
      persist();
    }
  };
  grip.addEventListener('pointerup', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const clicked = !drag.moved;
    drag = null;
    persist();
    if (clicked) toggleTalk();
  });
  grip.addEventListener('pointercancel', endDrag);
  grip.addEventListener('lostpointercapture', endDrag);
  grip.addEventListener('keydown', (event) => {
    const amount = event.shiftKey ? 30 : 10;
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      move(
        x + (event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0),
        y + (event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0),
      );
      persist();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleTalk();
    } else if (event.key === 'Escape' && say.hidden) actions.hide();
  });
  window.addEventListener(
    'resize',
    () => {
      hideAskChip();
      apply(current);
    },
    { signal: abort.signal },
  );
  apply(initial);
  look('idle');
  talkMessages = readTalk();
  renderTalk();
  // Pages finish rendering after this script too (hydration, the PDF reader's zoom), and a rebuild
  // detaches the nodes a restored quote was matched to. Watch the page and re-anchor when needed.
  if (typeof MutationObserver === 'function' && document.body) {
    pageWatcher = new MutationObserver(() => {
      if (blocksNeedRepair()) scheduleRepair();
    });
    pageWatcher.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  // Text and webfonts settle at their own pace, so give late content a few chances to arrive.
  for (const delay of [400, 1200, 3000]) window.setTimeout(repairSettled, delay);
  void document.fonts?.ready.then(repairSettled).catch(() => undefined);
  restoreChats();
  return {
    element,
    apply,
    study: studyPage,
    exportChats: chatHistoryMarkdown,
    closeChats: closeAllChats,
    chatCount: () => blocks.length,
    destroy() {
      saveChats();
      saveTalk();
      abort.abort();
      hideAskChip();
      askHost.remove();
      pageWatcher?.disconnect();
      window.clearTimeout(lookTimer);
      window.clearTimeout(restTimer);
      window.clearTimeout(repairTimer);
      if (highlightFrame) cancelAnimationFrame(highlightFrame);
      for (const block of blocks) {
        block.closed = true;
        block.token += 1;
        block.host.remove();
      }
      blocks = [];
      character.destroy();
      element.remove();
    },
  };
}
