import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { bootCompanion } from '../content/boot';
import './viewer.css';

GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf/pdf.worker.min.mjs');

const MAX_TEXT = 12000;
const MAX_PAGE_TEXTS = 60;
const MAX_PAGE_TEXT = 20000;

interface PageEntry {
  page: PDFPageProxy;
  node: HTMLElement;
  surface: HTMLElement;
  rendered: boolean;
  busy: boolean;
}

const pagesEl = document.getElementById('doc') as HTMLElement;
const statusEl = document.getElementById('status') as HTMLElement;
const nameEl = document.getElementById('name') as HTMLElement;
const downloadEl = document.getElementById('download') as HTMLButtonElement;
const originalEl = document.getElementById('original') as HTMLButtonElement;

function status(text: string, bad = false) {
  statusEl.textContent = text;
  statusEl.hidden = !text;
  statusEl.classList.toggle('bad', bad);
}

const params = new URLSearchParams(location.search);
const file = params.get('file') ?? '';
let pdf: PDFDocumentProxy | null = null;
let baseScale = 1;
let zoom = 1;
let entries: PageEntry[] = [];
let renderToken = 0;
let resizeTimer = 0;

function fileName(url: string) {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
    return last || 'PDF';
  } catch {
    return 'PDF';
  }
}

const downloadName = fileName(file).replace(/\.pdf$/i, '') || 'document';
if (!/^https?:/i.test(file)) {
  status('This reader opens HTTP(S) PDF links only.', true);
  downloadEl.disabled = true;
  originalEl.disabled = true;
  throw new Error('No PDF URL supplied.');
}

function availableWidth() {
  return Math.max(280, Math.min(pagesEl.clientWidth, 960));
}

async function computeBaseScale(target: PDFDocumentProxy) {
  const first = await target.getPage(1);
  const width = first.getViewport({ scale: 1 }).width;
  return Math.min(3, Math.max(0.2, availableWidth() / width));
}

const observer = new IntersectionObserver(
  (records) => {
    for (const record of records) {
      if (!record.isIntersecting) continue;
      const entry = entryOf(record.target);
      if (entry) void renderPage(entry);
    }
  },
  { rootMargin: '900px 0px' },
);

const entriesByNode = new WeakMap<Element, PageEntry>();
function entryOf(node: Element) {
  return entriesByNode.get(node);
}

async function renderPage(entry: PageEntry) {
  if (entry.rendered || entry.busy) return;
  entry.busy = true;
  try {
    const viewport = entry.page.getViewport({ scale: baseScale * zoom });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
    canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
    await entry.page.render({
      canvas,
      viewport,
      transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
    }).promise;
    const layer = document.createElement('div');
    layer.className = 'textLayer';
    const content = await entry.page.getTextContent();
    const text = new TextLayer({ textContentSource: content, container: layer, viewport });
    entry.surface.replaceChildren(canvas, layer);
    await text.render();
    // pdf.js separates lines with <br>, and Range.toString() has no text for those, so a selection
    // crossing lines glues the last word of one line to the first word of the next.
    for (const br of layer.querySelectorAll('br')) {
      const eol = document.createElement('span');
      eol.className = 'eol';
      eol.setAttribute('role', 'presentation');
      eol.textContent = '\n';
      br.replaceWith(eol);
    }
    entry.rendered = true;
  } catch {
    /* A page that fails to draw stays blank; other pages and selection keep working. */
  } finally {
    entry.busy = false;
  }
}

async function build(target: PDFDocumentProxy) {
  const token = ++renderToken;
  observer.disconnect();
  entries = [];
  const scale = baseScale * zoom;
  const pages = await Promise.all(
    Array.from({ length: target.numPages }, (_, index) => target.getPage(index + 1)),
  );
  if (token !== renderToken) return;
  const fragment = document.createDocumentFragment();
  for (const page of pages) {
    const viewport = page.getViewport({ scale });
    const node = document.createElement('section');
    node.className = 'page';
    node.style.width = `${viewport.width}px`;
    node.style.height = `${viewport.height}px`;
    node.style.setProperty('--scale-factor', String(scale));
    node.dataset.page = String(page.pageNumber);
    const surface = document.createElement('div');
    surface.className = 'page-surface';
    node.append(surface);
    const entry: PageEntry = { page, node, surface, rendered: false, busy: false };
    entries.push(entry);
    entriesByNode.set(node, entry);
    fragment.append(node);
  }
  pagesEl.replaceChildren(fragment);
  for (const entry of entries) observer.observe(entry.node);
}

async function rebuild() {
  if (!pdf) return;
  const anchor = entries.find((entry) => entry.node.getBoundingClientRect().bottom > 90);
  const anchorPage = anchor?.page.pageNumber;
  const anchorTop = anchor?.node.getBoundingClientRect().top ?? 0;
  await build(pdf);
  if (!anchorPage) return;
  const next = entries[anchorPage - 1];
  if (next) window.scrollBy(0, next.node.getBoundingClientRect().top - anchorTop);
}

function setZoom(next: number) {
  const value = Math.min(2.5, Math.max(0.5, Math.round(next * 20) / 20));
  if (value === zoom) return;
  zoom = value;
  void rebuild();
}

/**
 * Whole-document text for Study, plus per-page text for the reading chat's passage search. Pages
 * are extracted before the reader scrolls to them, so later pages are already available to a
 * question.
 */
function shareText(target: PDFDocumentProxy) {
  void (async () => {
    let text = '';
    const texts = new Array<string>(target.numPages).fill('');
    const last = Math.min(target.numPages, MAX_PAGE_TEXTS);
    for (let number = 1; number <= last; number += 1) {
      const page = await target.getPage(number);
      const content = await page.getTextContent();
      let pageText = '';
      for (const item of content.items) {
        if (!('str' in item) || typeof item.str !== 'string') continue;
        pageText += item.str;
        if (item.hasEOL) pageText += '\n';
      }
      const kept = pageText.slice(0, MAX_PAGE_TEXT);
      texts[number - 1] = kept;
      if (text.length < MAX_TEXT) text += `${kept}\n\n`;
    }
    const shared = globalThis as {
      __baleenPagePassage?: string;
      __baleenPageTexts?: string[];
    };
    shared.__baleenPagePassage = text.slice(0, MAX_TEXT);
    shared.__baleenPageTexts = texts;
  })().catch(() => undefined);
}

async function start() {
  status('Loading PDF\u2026');
  const fallback = fileName(file);
  nameEl.textContent = fallback;
  document.title = `${fallback} \u00b7 PDF`;
  try {
    pdf = await getDocument({
      url: file,
      withCredentials: true,
      cMapUrl: chrome.runtime.getURL('pdf/cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: chrome.runtime.getURL('pdf/standard_fonts/'),
      wasmUrl: chrome.runtime.getURL('pdf/wasm/'),
      iccUrl: chrome.runtime.getURL('pdf/iccs/'),
    }).promise;
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    status(
      name === 'PasswordException'
        ? 'This PDF is password protected.'
        : name === 'InvalidPDFException'
          ? 'This file is not a readable PDF.'
          : 'Could not fetch this PDF. The site may need a sign-in, or the link expired.',
      true,
    );
    return;
  }
  baseScale = await computeBaseScale(pdf);
  const info = (await pdf.getMetadata().catch(() => null))?.info as
    | { Title?: unknown; title?: unknown }
    | undefined;
  const title =
    typeof info?.Title === 'string'
      ? info.Title.trim()
      : typeof info?.title === 'string'
        ? info.title.trim()
        : '';
  if (title) {
    nameEl.textContent = title;
    document.title = `${title} \u00b7 PDF`;
  }
  status('');
  await build(pdf);
  shareText(pdf);
}

document.getElementById('zoom-out')?.addEventListener('click', () => setZoom(zoom - 0.2));
document.getElementById('zoom-in')?.addEventListener('click', () => setZoom(zoom + 0.2));
document.getElementById('zoom-fit')?.addEventListener('click', () => {
  zoom = 1;
  void rebuild();
});
downloadEl.addEventListener('click', () => {
  void (async () => {
    try {
      const response = await fetch(file, { credentials: 'include' });
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${downloadName}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    } catch {
      status('Could not download this PDF. Try Open original instead.', true);
    }
  })();
});
originalEl.addEventListener('click', () => {
  void (async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'fg:raw-pdf', url: file });
    } catch {
      /* The service worker may be restarting; the bypass is best effort. */
    }
    location.href = file;
  })();
});

window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (!pdf) return;
    void (async () => {
      baseScale = await computeBaseScale(pdf as PDFDocumentProxy);
      await rebuild();
    })();
  }, 250);
});

bootCompanion();
void start();
