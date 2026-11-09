import { pagePassage } from './ask';

/**
 * Cheap, local passage search. Instead of shipping the whole page to the model, chunks are ranked
 * against the question and only the best few travel with the request. No model call is spent
 * choosing them, and the page never leaves the tab except through the final request.
 */
const MAX_SCAN = 150_000;
const DEFAULT_BUDGET = 3500;
const MAX_CHUNK = 800;
const BLOCK_SELECTOR = 'p, li, blockquote, figcaption, td, th, pre, h1, h2, h3, h4, h5, h6';
const OWN_UI = '#fungusan-gal, #fungusan-ask, [data-fg-chat]';

const STOP = new Set(
  'the and for are but not you your with this that from have has had was were will would can could should what which who whom whose how why when where who all any some more most very just also into over under about than then them their there here they she he his her our its it is are was were be been being do does did done a an of in on at to by as if or so no yes i we me my us'.split(
    ' ',
  ),
);

interface Chunk {
  text: string;
  code?: boolean;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** PDF pages arrive as one long line, so a passage-sized split is what keeps them retrievable. */
function pieces(text: string): string[] {
  if (text.length <= MAX_CHUNK) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_CHUNK) {
    let cut = rest.lastIndexOf('. ', MAX_CHUNK);
    if (cut < MAX_CHUNK * 0.4) cut = rest.lastIndexOf(' ', MAX_CHUNK);
    if (cut < MAX_CHUNK * 0.4) cut = MAX_CHUNK;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function pdfTexts(): string[] {
  const shared = globalThis as {
    __baleenPageTexts?: unknown;
    __baleenPagePassage?: unknown;
  };
  if (Array.isArray(shared.__baleenPageTexts)) {
    const pages = shared.__baleenPageTexts.filter(
      (page): page is string => typeof page === 'string' && !!page.trim(),
    );
    if (pages.length) return pages;
  }
  return typeof shared.__baleenPagePassage === 'string' && shared.__baleenPagePassage.trim()
    ? [shared.__baleenPagePassage]
    : [];
}

/** Rendered text of the readable region, with Baleen's own chat windows left out. */
function regionText(region: HTMLElement): string {
  const chats = [...region.querySelectorAll<HTMLElement>('[data-fg-chat]')];
  const restore = chats.map((chat) => chat.style.display);
  for (const chat of chats) chat.style.display = 'none';
  try {
    return normalize(region.innerText || region.textContent || '').slice(0, MAX_SCAN);
  } finally {
    chats.forEach((chat, index) => {
      if (restore[index]) chat.style.display = restore[index];
      else chat.style.removeProperty('display');
    });
  }
}
/** Paragraph-sized pieces in reading order, built from the rendered page itself when it is HTML. */
function chunksFromPage(): Chunk[] {
  const chunks: Chunk[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const text = normalize(value);
    if (text.length < 20) return;
    for (const piece of pieces(text)) {
      if (seen.has(piece)) continue;
      seen.add(piece);
      chunks.push({ text: piece });
    }
  };
  // Code loses its line breaks under `normalize`, and a wiki page is meant to be read by a person,
  // so a code block travels with its newlines and is fenced by the renderer.
  const addCode = (value: string) => {
    const text = value
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (text.length < 20) return;
    const clipped = text.length > MAX_CHUNK * 2 ? `${text.slice(0, MAX_CHUNK * 2)}\n…` : text;
    if (seen.has(clipped)) return;
    seen.add(clipped);
    chunks.push({ text: clipped, code: true });
  };
  const pages = pdfTexts();
  if (pages.length) {
    for (const page of pages)
      for (const paragraph of page.split(/\n{2,}|(?<=[.!?])\s{2,}/)) add(paragraph);
    if (chunks.length) return chunks;
  }
  const region =
    document.querySelector<HTMLElement>('main, [role="main"], article, [role="log"]') ??
    document.body;
  let scanned = 0;
  for (const node of region.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)) {
    if (node.closest(OWN_UI)) continue;
    // Skip a block nested in another block (a paragraph inside a list item, a header inside a
    // section) so the same words are not counted twice.
    if (node.parentElement?.closest(BLOCK_SELECTOR)) continue;
    if (node.tagName === 'PRE') {
      addCode(node.innerText || node.textContent || '');
      scanned += (node.innerText || node.textContent || '').length;
      if (scanned >= MAX_SCAN) break;
      continue;
    }
    const text = normalize(node.innerText || node.textContent || '');
    add(text);
    scanned += text.length;
    if (scanned >= MAX_SCAN) break;
  }
  // Some sites render the article as bare divs. A few semantic blocks elsewhere (a heading, a
  // nav item) used to be enough to return early and leave the body out of the index entirely.
  // Add the readable region whenever the block walk covered only part of it.
  const full = regionText(region);
  const indexed = chunks.reduce((total, chunk) => total + chunk.text.length, 0);
  if (full && indexed < full.length * 0.55) {
    for (const paragraph of full.split(/\n{2,}/)) add(paragraph);
  }
  if (chunks.length) return chunks;
  // Last resort: the shared page extractor, which also handles the bundled PDF reader.
  for (const paragraph of pagePassage().split(/\n{2,}/)) add(paragraph);
  return chunks;
}

function queryTerms(question: string): string[] {
  const terms = normalize(question)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 2 && !STOP.has(term));
  return [...new Set(terms)].slice(0, 24);
}

/** Every selected term must be able to appear: a long question should not pull in everything. */
function rank(chunks: Chunk[], terms: string[]): { index: number; score: number }[] {
  const documentFrequency = new Map<string, number>();
  const lowered = chunks.map((chunk) => chunk.text.toLowerCase());
  for (const term of terms) {
    let count = 0;
    for (const text of lowered) if (text.includes(term)) count += 1;
    documentFrequency.set(term, count);
  }
  return lowered.map((text, index) => {
    let score = 0;
    for (const term of terms) {
      const count = text.split(term).length - 1;
      if (!count) continue;
      const rarity = Math.log(1 + chunks.length / (1 + (documentFrequency.get(term) ?? 0)));
      score += Math.min(count, 3) * rarity;
    }
    return { index, score };
  });
}

/** Takes candidates in priority order, then puts what fits back into reading order. */
function join(chunks: Chunk[], order: number[], budget: number): string {
  const kept: number[] = [];
  const taken = new Set<number>();
  let used = 0;
  for (const index of order) {
    if (taken.has(index)) continue;
    const text = chunks[index]?.text;
    if (!text || used + text.length > budget) continue;
    taken.add(index);
    kept.push(index);
    used += text.length + 2;
  }
  return kept
    .sort((a, b) => a - b)
    .map((index) => chunks[index].text)
    .join('\n\n');
}

function spread(chunks: Chunk[], budget: number): string {
  if (!chunks.length) return '';
  const average =
    chunks.reduce((total, chunk) => total + chunk.text.length, 0) / chunks.length;
  const room = Math.max(1, Math.min(chunks.length, Math.floor(budget / Math.max(200, average))));
  const indexes = new Set<number>();
  for (let step = 0; step < room; step += 1)
    indexes.add(Math.round((step / Math.max(1, room - 1)) * (chunks.length - 1)));
  return join(chunks, [...indexes], budget);
}

/**
 * The paragraph, or whole short list, under the reader's eyes. This is the fallback focus when a
 * question says "these questions" without an open section chat to point at.
 */
export function viewportPassage(): string {
  const point = document.elementFromPoint(innerWidth / 2, Math.min(innerHeight * 0.45, innerHeight - 24));
  if (!(point instanceof Element) || point.closest(OWN_UI)) return '';
  const root = point.getRootNode();
  if (root instanceof ShadowRoot && root.host instanceof Element && root.host.closest(OWN_UI))
    return '';
  const block = point.closest<HTMLElement>(BLOCK_SELECTOR);
  if (!block) return '';
  const list = block.closest<HTMLElement>('ol, ul');
  const scope = list && list.getBoundingClientRect().height <= innerHeight ? list : block;
  return normalize(scope.innerText || scope.textContent || '').slice(0, 2000);
}

/**
 * The page as a list of passage-sized pieces, for compiling a wiki. Unlike `findPassages` this keeps
 * reading order and takes as much of the page as fits, because a compiled page needs the whole
 * argument rather than the few chunks that match one question.
 */
export function wikiPassages(budget = 9000): string[] {
  const passages: string[] = [];
  const seen = new Set<string>();
  let used = 0;
  for (const chunk of chunksFromPage()) {
    const text = chunk.code ? `\`\`\`\n${chunk.text.trim()}\n\`\`\`` : normalize(chunk.text);
    if (text.length < 40 || seen.has(text)) continue;
    if (used + text.length > budget) break;
    seen.add(text);
    passages.push(text);
    used += text.length;
    if (passages.length >= 40) break;
  }
  return passages;
}

/** Put the section the reader is pointing at ahead of the retrieved page text, without repeating it. */
function withFocus(focus: string, passages: string, budget: number): string {
  const head = normalize(focus).slice(0, Math.min(1800, Math.floor(budget * 0.55)));
  if (head.length < 20) return passages.slice(0, budget);
  const probe = head.slice(0, Math.min(160, head.length)).toLowerCase();
  if (passages.toLowerCase().includes(probe)) return passages.slice(0, budget);
  const room = Math.max(0, budget - head.length - 2);
  return `${head}\n\n${passages.slice(0, room)}`.trim();
}

/**
 * The most relevant passages for a question, in page order. When nothing matches lexically (a
 * vague "what is this about?"), a spread sample of the page is used so the answer still has context.
 * A focus passage (the current selection or section) always travels first.
 */
export function findPassages(
  question: string,
  budget = DEFAULT_BUDGET,
  focus = '',
): string {
  const chunks = chunksFromPage();
  if (!chunks.length) return normalize(focus).slice(0, budget);
  const terms = queryTerms(question);
  if (!terms.length) return withFocus(focus, spread(chunks, budget), budget);
  const ranked = rank(chunks, terms)
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return withFocus(focus, spread(chunks, budget), budget);
  const order: number[] = [];
  for (const { index } of ranked.slice(0, 40)) {
    // A neighbor on each side keeps a hit from arriving without the sentence that frames it.
    order.push(index - 1, index, index + 1);
  }
  return withFocus(focus, join(chunks, order, budget), budget);
}
