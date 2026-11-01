import type { AskRequest, AskResult } from '../shared/types';

const MAX_SELECTION = 6000;
const MAX_PAGE = 12000;
const MAX_IMAGES = 6;
const COMPOSER = 'textarea, input, [contenteditable="true"], [role="textbox"]';
const BLOCK = 'p, li, blockquote, figcaption, td, th';
const CONTAINER =
  'figure, .thumb, .gallerybox, .infobox, .mw-mmv-wrapper, [role="dialog"], [class*="lightbox"]';
const CAPTIONS = [
  'figcaption',
  '.thumbcaption',
  '.mw-mmv-title',
  '.mw-mmv-image-desc',
  '[class*="caption"]',
  '[class*="description"]',
];

export interface SectionCapture {
  /** Frozen at selection time so the block survives a focus change into its own input. */
  range: Range;
  text: string;
  /** Alt text and captions only: DeepSeek's API is text-only, so image pixels are never sent. */
  images: string[];
  /** Image nodes covered by the selection, outlined along with the text while the block is open. */
  media: HTMLImageElement[];
  words: number;
  /** The block the selection belongs to; the chat block is inserted directly after it. */
  anchor: Element | null;
}
function overlaps(a: DOMRect, b: DOMRect) {
  return a.width > 0 && a.height > 0 && a.bottom >= b.top && a.top <= b.bottom && a.right >= b.left && a.left <= b.right;
}
function sectionBlock(node: Node | null): Element | null {
  const element = node instanceof Element ? node : node?.parentElement;
  if (!element) return null;
  const figure = element.closest('figure');
  if (figure) return figure;
  return element.closest(BLOCK);
}
/**
 * Text that stands in for the pixels: alt text, a caption near the image (Wikipedia's figures,
 * thumbs and media viewer included), aria-describedby, or the title attribute. Empty when the
 * image genuinely has no description.
 */
function captionText(container: Element): string {
  for (const selector of CAPTIONS) {
    for (const node of container.querySelectorAll(selector)) {
      if (node.matches('a, button, [role="button"]')) continue;
      const text = node.textContent?.replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
  }
  return '';
}
/** Selections inside our own UI (a chat block or the companion's panels) are never page text. */
function inOwnUi(node: Node | null): boolean {
  if (!node) return false;
  const element = node instanceof Element ? node : node.parentElement;
  if (element?.closest('[data-fg-chat], #fungusan-gal, #fungusan-ask')) return true;
  const root = node.getRootNode();
  return (
    root instanceof ShadowRoot &&
    root.host instanceof Element &&
    !!root.host.closest('#fungusan-gal, #fungusan-ask, [data-fg-chat]')
  );
}
function imageLabel(image: HTMLImageElement): string {
  const container = image.closest(CONTAINER);
  const caption = container ? captionText(container) : '';
  const describedBy = (image.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => image.ownerDocument.getElementById(id)?.textContent ?? '')
    .join(' ');
  const parts = [image.alt, describedBy, image.title, caption]
    .map((part) => part?.replace(/\s+/g, ' ').trim())
    .filter((part): part is string => !!part);
  const unique: string[] = [];
  for (const part of parts)
    if (!unique.some((value) => value.toLowerCase() === part.toLowerCase())) unique.push(part);
  return unique.join(' — ').slice(0, 240);
}
/**
 * Snapshot of the selected section: its text and any images whose alt text or caption can stand in
 * for the pixels DeepSeek cannot see. Images are gathered from the same figure or from the area the
 * selection covers, never from the whole article.
 */
export function captureSection(): SectionCapture | null {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  if (inOwnUi(selection.anchorNode) || inOwnUi(selection.focusNode)) return null;
  const anchor = selection.anchorNode;
  const anchorElement = anchor instanceof Element ? anchor : anchor?.parentElement;
  if (anchorElement?.closest(COMPOSER)) return null;
  const range = selection.getRangeAt(0).cloneRange();
  if (!document.documentElement.contains(range.commonAncestorContainer)) return null;
  const rect = range.getBoundingClientRect();
  const text = range.toString().trim().slice(0, MAX_SELECTION);
  const block = sectionBlock(range.commonAncestorContainer);
  const scope =
    block ??
    (range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement) ??
    document.body;
  const found = new Set<HTMLImageElement>();
  for (const image of scope.querySelectorAll('img')) {
    const inFigure = block?.tagName === 'FIGURE' && image.closest('figure') === block;
    if (inFigure || range.intersectsNode(image) || overlaps(image.getBoundingClientRect(), rect))
      found.add(image);
  }
  const media = [...found];
  const images = media.slice(0, MAX_IMAGES).map(imageLabel).filter(Boolean);
  if (!text && !media.length) return null;
  if (text.length < 8 && !media.length) return null;
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  // A multi-block selection has no single enclosing block; the block where the selection ends is
  // where the reader stopped, so the conversation goes after all of the highlighted content.
  return {
    range,
    text,
    images,
    media,
    words,
    anchor: sectionBlock(range.endContainer) ?? block,
  };
}

/**
 * The main readable region of the page. `innerText` keeps it to what is actually rendered; the
 * card lives outside `body`, so the companion's own UI is never included.
 */
export function pagePassage(): string {
  // The bundled PDF reader extracts whole-document text in the background; rendered-page text is
  // only a fallback while that pass is still running.
  const pdfText = (globalThis as { __baleenPagePassage?: unknown }).__baleenPagePassage;
  if (typeof pdfText === 'string' && pdfText.trim()) return pdfText.slice(0, MAX_PAGE);
  const region =
    document.querySelector<HTMLElement>('main, [role="main"], article, [role="log"]') ??
    document.body;
  // Chat blocks live in the article so they scroll with the text; they are not part of the page.
  const chats = [...region.querySelectorAll<HTMLElement>('[data-fg-chat]')];
  for (const chat of chats) chat.style.setProperty('display', 'none', 'important');
  try {
    return (region.innerText ?? region.textContent ?? '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, MAX_PAGE);
  } finally {
    for (const chat of chats) chat.style.setProperty('display', 'block', 'important');
  }
}
export async function requestAsk(request: AskRequest): Promise<AskResult> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id)
    throw new Error('Open this page from the installed extension.');
  let reply: { ok?: boolean; data?: AskResult; error?: string };
  try {
    reply = (await chrome.runtime.sendMessage({ type: 'fg:ask', request })) as typeof reply;
  } catch {
    throw new Error('The extension was reloaded. Refresh the page and try again.');
  }
  if (!reply?.ok || !reply.data) throw new Error(reply?.error ?? 'DeepSeek did not answer.');
  return reply.data;
}
