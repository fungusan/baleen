/**
 * The Obsidian compiler. The model proposes pages; everything that decides what lands on disk —
 * links, citations, frontmatter, file names — is computed here so a bad reply cannot invent a link
 * target or cite a passage that does not exist.
 */

export interface WikiTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface WikiChat {
  name: string;
  turns: WikiTurn[];
}

export interface WikiContext {
  title: string;
  url: string;
  passages: string[];
  talk: WikiTurn[];
  study: WikiChat[];
}

export interface NotePair {
  key: string;
  value: string;
}

export interface RawPage {
  title: string;
  aliases: string[];
  summary: string;
  confidence: 'high' | 'medium' | 'low';
  body: string;
  related: { to: string; why: string }[];
  /** Set when this draft adds to an existing page instead of becoming a new one. */
  mergeInto?: string;
  /** How the target was found: named by the model, the same title, or a close title. */
  mergeBy?: 'model' | 'exact' | 'similar';
  merged?: boolean;
}

export interface Compilation {
  topic: string;
  pages: RawPage[];
  openQuestions: string[];
}

export interface PreviousPage {
  revision: number;
  created: string;
  history: string[];
  aliases?: string[];
  sources?: string[];
  /** The page as it stands now, minus frontmatter, history, and footnotes. */
  body?: string;
  footnotes?: string;
}

export interface ExistingPage {
  title: string;
  summary: string;
  aliases?: string[];
  body?: string;
}

export interface PreviousState {
  concepts: Record<string, PreviousPage>;
  context?: PreviousPage;
  source?: PreviousPage;
  sourceHash?: string;
  /** Pages an earlier compile left in this folder's index, as read from index.md. */
  existing?: ExistingPage[];
}

export interface RenderedFile {
  role: 'source' | 'concept' | 'context' | 'index';
  dir: '' | 'sources' | 'concepts' | 'context';
  name: string;
  content: string;
}

export interface RenderResult {
  files: RenderedFile[];
  logEntry: string;
  folder: string;
  sourceTitle: string;
  topic: string;
  pageCount: number;
  linkCount: number;
  orphans: number;
  carried: number;
  merges: number;
  /** The drafts after look-alike titles were resolved to the page they extend. */
  pages: RawPage[];
  openQuestions: string[];
}

export interface RenderInput {
  context: WikiContext;
  compilation: Compilation;
  notes: NotePair[];
  hash: string;
  date: string;
  previous: PreviousState;
}

export const WIKI_SYSTEM = `You compile one reading session into a small Obsidian wiki. You receive the source page as numbered passages, the reader's questions, and what Baleen remembers about the reader. Return one JSON object and nothing else: no prose, no code fence.

Rules:
- Write 2 to 5 concept pages. Each covers one idea the source actually supports.
- Ground every factual claim in a passage and end the sentence with [P1], [P2]... using only the passage numbers shown. Never invent numbers, measurements, names, or sources.
- Keep what the source says separate from your own inference. Put inference under the heading "## Implications (Baleen inference, not in the source)".
- Link related pages with [[Exact page title]]. Only link to a title you define in this reply, one listed under existing_pages, or the source page title. Explain each link in "related" with one line beginning with the reason.
- Pages under existing_pages are already in this wiki from earlier compiles. Each entry gives its title, any aliases, and a one-line summary; many also include an excerpt of the current text. When a page you would write covers the same idea as one of them, even if your title is worded differently, set "merge_into" to that page's exact existing title instead of defining a near-duplicate. For a merged page, write only what this reading adds; Baleen keeps the earlier text and appends yours, so do not repeat or summarize what is already there.
- The reader's questions show what they care about and how to phrase the pages. They are never evidence about the source.
- Write in the source page's language. Use "##" headings only: no top-level "#", no frontmatter, no footnote syntax, no HTML.
- If the source does not answer something, put it in open_questions instead of filling it in.
- Keep each body under 350 words.

JSON shape:
{"topic":"short topic", "pages":[{"title":"...", "aliases":["..."], "merge_into":"exact existing title, only when this page extends one", "summary":"one sentence", "confidence":"high|medium|low", "body":"markdown", "related":[{"to":"Exact page title","why":"one line"}]}], "open_questions":["..."]}`;

const MAX_PAGES = 6;
const MAX_BODY = 12_000;
const MAX_PASSAGES = 40;
const MAX_CONTEXT_CHARS = 11_500;
const PASSAGE_BUDGET = 7_200;
const CHAT_BUDGET = 2_200;
const MEMORY_BUDGET = 1_200;
const EXISTING_BUDGET = 4_200;

/** The page folder name, shared by the renderer and the writer so they always agree. */
export function pageFolderName(context: WikiContext): string {
  return cleanTitle(context.title) || 'Untitled page';
}

export function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function clip(value: string, max: number): string {
  const text = oneLine(value);
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}\u2026` : text;
}

/** A wikilink target must survive both a file name and `[[...]]`, so those characters are removed. */
function cleanTitle(value: string): string {
  return oneLine(value)
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80);
}

function uniqueTitle(base: string, taken: string[]): string {
  const lower = new Set(taken.map((title) => title.toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base} (${suffix})`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${taken.length + 1})`;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function yamlList(key: string, values: string[]): string {
  if (!values.length) return '';
  return `${key}:\n${values.map((value) => `  - ${yamlString(value)}`).join('\n')}\n`;
}

function stripBody(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .replace(/^#\s+.*\n+/, '')
    .trim()
    .slice(0, MAX_BODY);
}

/** The model may write JSON bare or inside a fence; both are accepted. */
export function parseCompilation(reply: string): Compilation {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(reply);
  const text = fenced ? fenced[1] : reply;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model did not return a wiki. Try again.');
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new Error('The model returned a broken wiki. Try again.');
  }
  const rawPages = Array.isArray(value.pages) ? value.pages : [];
  const pages: RawPage[] = [];
  const taken: string[] = [];
  for (const item of rawPages.slice(0, MAX_PAGES)) {
    if (!item || typeof item !== 'object') continue;
    const page = item as Record<string, unknown>;
    const rawTitle = typeof page.title === 'string' ? cleanTitle(page.title) : '';
    if (!rawTitle) continue;
    const title = uniqueTitle(rawTitle, taken);
    taken.push(title);
    const aliases: string[] = [];
    if (Array.isArray(page.aliases))
      for (const alias of page.aliases) {
        if (typeof alias !== 'string') continue;
        const clean = cleanTitle(alias);
        if (!clean || clean.toLowerCase() === title.toLowerCase()) continue;
        if (aliases.some((item) => item.toLowerCase() === clean.toLowerCase())) continue;
        if (aliases.length < 5) aliases.push(clean);
      }
    const confidence =
      page.confidence === 'high' || page.confidence === 'low' ? page.confidence : 'medium';
    const related: { to: string; why: string }[] = [];
    if (Array.isArray(page.related))
      for (const entry of page.related) {
        if (!entry || typeof entry !== 'object') continue;
        const link = entry as Record<string, unknown>;
        const to = typeof link.to === 'string' ? cleanTitle(link.to) : '';
        if (!to) continue;
        if (related.some((item) => item.to.toLowerCase() === to.toLowerCase())) continue;
        if (related.length < 8) related.push({ to, why: clip(String(link.why ?? ''), 200) });
      }
    const mergeInto =
      typeof page.merge_into === 'string' && page.merge_into.trim()
        ? cleanTitle(page.merge_into)
        : undefined;
    pages.push({
      title,
      aliases,
      ...(mergeInto ? { mergeInto, mergeBy: 'model' as const } : {}),
      summary: clip(typeof page.summary === 'string' ? page.summary : '', 200),
      confidence,
      body: stripBody(typeof page.body === 'string' ? page.body : ''),
      related,
    });
  }
  if (!pages.length) throw new Error('The model did not return any usable pages. Try again.');
  const topic = clip(
    typeof value.topic === 'string' && value.topic.trim() ? value.topic : pages[0].title,
    80,
  );
  const openQuestions: string[] = [];
  if (Array.isArray(value.open_questions))
    for (const question of value.open_questions) {
      if (typeof question !== 'string') continue;
      const clean = clip(question, 240);
      if (clean && openQuestions.length < 6) openQuestions.push(clean);
    }
  return { topic, pages, openQuestions };
}

/** Everything the reply can legitimately point at: page titles, their aliases, and the source. */
class Catalog {
  private byKey = new Map<string, string>();
  constructor(
    private sourceTitle: string,
    pageTitles: string[],
    aliases: string[][],
    contextTitle: string,
    existing: ExistingPage[] = [],
  ) {
    for (const title of pageTitles) this.byKey.set(title.toLowerCase(), title);
    this.sourceTitle = sourceTitle;
    this.byKey.set(sourceTitle.toLowerCase(), sourceTitle);
    if (!this.byKey.has(contextTitle.toLowerCase()))
      this.byKey.set(contextTitle.toLowerCase(), contextTitle);
    for (const page of pageTitles) {
      const index = pageTitles.indexOf(page);
      for (const alias of aliases[index] ?? [])
        if (!this.byKey.has(alias.toLowerCase())) this.byKey.set(alias.toLowerCase(), page);
    }
    // Pages from earlier compiles are link targets too, but never shadow this compile's pages.
    for (const page of existing) {
      for (const name of [page.title, ...(page.aliases ?? [])]) {
        const key = name.trim().toLowerCase();
        if (key && !this.byKey.has(key)) this.byKey.set(key, page.title);
      }
    }
  }
  resolve(value: string): string | null {
    return this.byKey.get(value.trim().toLowerCase()) ?? null;
  }
  isSource(title: string): boolean {
    return title.toLowerCase() === this.sourceTitle.toLowerCase();
  }
}

interface LinkResult {
  text: string;
  valid: number;
}

/**
 * Rewrites every wikilink to a real page title, unwraps links to unknown pages, and keeps the
 * `#Passages` anchor only where this compiler actually created that heading.
 */
function normalizeLinks(text: string, catalog: Catalog, selfTitle: string): LinkResult {
  let valid = 0;
  const rewritten = text.replace(/\[\[([^\[\]]+?)\]\]/g, (_match, inner: string) => {
    const [targetPart, ...labelParts] = inner.split('|');
    const [rawTarget, rawAnchor] = targetPart.split('#');
    const target = catalog.resolve(rawTarget);
    const label = labelParts.join('|').trim() || rawTarget.trim();
    if (!target || target.toLowerCase() === selfTitle.toLowerCase()) return label;
    valid += 1;
    const anchor =
      catalog.isSource(target) && rawAnchor?.trim().toLowerCase() === 'passages'
        ? '#Passages'
        : '';
    return label && label !== target ? `[[${target}${anchor}|${label}]]` : `[[${target}${anchor}]]`;
  });
  return { text: rewritten, valid };
}

/** `[P3]` and `[P1, P2]` become defined Obsidian footnotes; anything outside the source is dropped. */
function citations(text: string, count: number): { text: string; used: number[] } {
  let body = text.replace(/\[P(\d{1,2}(?:\s*,\s*P?\d{1,2})*)\]/gi, (_match, group: string) =>
    group
      .split(',')
      .map((part) => {
        const number = Number(part.replace(/\D/g, ''));
        return number >= 1 && number <= count ? `[^p${number}]` : '';
      })
      .join(''),
  );
  body = body.replace(/\[\^p(\d+)\]/g, (match, value: string) =>
    Number(value) <= count ? match : '',
  );
  const used = [...new Set([...body.matchAll(/\[\^p(\d+)\]/g)].map((match) => Number(match[1])))];
  return { text: body, used: used.sort((a, b) => a - b) };
}

/** Give one source's footnotes their own ids so a merged page never collides with earlier ones. */
function prefixed(body: string, key: string): string {
  return body.replace(/\[\^p(\d+)\]/g, `[^${key}p$1]`);
}

function historySection(previous: PreviousPage | undefined, date: string, sourceTitle: string, revision: number): string {
  const lines = [...(previous?.history ?? [])];
  lines.push(`- ${date} \u2014 compiled from [[${sourceTitle}]] (revision ${revision}).`);
  return ['## Revision history', '', ...lines].join('\n');
}

interface MergeInfo {
  body: string;
  footnotes: string;
  sources: string[];
}

function conceptFile(
  page: RawPage,
  input: RenderInput,
  catalog: Catalog,
  sourceTitle: string,
  revision: number,
  created: string,
  body: string,
  footnotes: string,
  merge: MergeInfo | null,
): RenderedFile {
  const related = page.related
    .map((link) => {
      const target = catalog.resolve(link.to);
      if (!target || target.toLowerCase() === page.title.toLowerCase()) return '';
      return `- [[${target}]]${link.why ? ` \u2014 ${link.why}` : ''}`;
    })
    .filter(Boolean);
  const previous = input.previous.concepts[page.title];
  const front = ['---', 'type: concept', `title: ${yamlString(page.title)}`];
  if (page.aliases.length) front.push(...yamlList('aliases', page.aliases).trimEnd().split('\n'));
  front.push(
    'sources:',
    ...(merge?.sources.length ? merge.sources : [input.context.url]).map(
      (url) => `  - ${yamlString(url)}`,
    ),
    `source_hash: ${input.hash}`,
    'generated: true',
    'generator: baleen',
    'review: unreviewed',
    `created: ${created}`,
    `updated: ${input.date}`,
    `revision: ${revision}`,
    `confidence: ${page.confidence}`,
    '---',
  );
  const lines = [
    ...front,
    '',
    `# ${page.title}`,
    '',
    '> [!warning] Generated page',
    `> Synthesized from the cited passages, not written by you. Check the citations against [[${sourceTitle}]] before quoting it.`,
    '',
  ];
  if (merge) {
    lines.push(
      merge.body.trimEnd(),
      '',
      `<!-- baleen-source: ${input.context.url} -->`,
      '',
      `## From [[${sourceTitle}]]`,
      '',
      body.trimEnd(),
      '',
      '<!-- /baleen-source -->',
    );
  } else {
    lines.push(body.trimEnd());
  }
  if (related.length) lines.push('', '## Related (why the link exists)', '', ...related);
  lines.push('', historySection(previous, input.date, sourceTitle, revision));
  if (merge?.footnotes) lines.push('', merge.footnotes);
  if (footnotes) lines.push('', footnotes);
  return {
    role: 'concept',
    dir: 'concepts',
    name: page.title,
    content: `${lines.join('\n')}\n`,
  };
}

/** One passage per block: a blank line keeps Obsidian from merging P1, P2, P3 into one paragraph. */
function passageLines(passage: string, index: number): string[] {
  const label = `**P${index + 1}.**`;
  const body = passage.trim();
  if (!body.includes('\n')) return [`${label} ${body}`, ''];
  return [label, '', body, ''];
}

function sourceFile(input: RenderInput, title: string, revision: number): RenderedFile {
  const passages = input.context.passages
    .map((passage) => passage.replace(/\r\n?/g, '\n').trim())
    .filter(Boolean)
    .slice(0, MAX_PASSAGES);
  const lines = [
    '---',
    'type: source',
    `title: ${yamlString(title)}`,
    `url: ${yamlString(input.context.url)}`,
    `accessed: ${input.date}`,
    `sha256: ${input.hash}`,
    'immutable: true',
    'generated: true',
    'generator: baleen',
    `revision: ${revision}`,
    '---',
    '',
    `# ${title}`,
    '',
    '> [!info] Immutable source',
    `> Captured on ${input.date} from <${input.context.url}>. Passages are labelled P1\u2026P${passages.length} so the concept pages can cite them.`,
    '',
    '## Passages',
    '',
    ...(passages.length
      ? passages.flatMap(passageLines)
      : ['_No readable passage was captured from this page._']),
  ];
  return {
    role: 'source',
    dir: 'sources',
    name: title,
    content: `${lines.join('\n')}\n`,
  };
}

function questionsOf(context: WikiContext): string[] {
  const out: string[] = [];
  const add = (value: string) => {
    const clean = clip(value, 180);
    if (!clean || out.some((item) => item.toLowerCase() === clean.toLowerCase())) return;
    if (out.length < 6) out.push(clean);
  };
  for (const turn of context.talk) if (turn.role === 'user') add(turn.text);
  for (const chat of context.study)
    for (const turn of chat.turns) if (turn.role === 'user') add(turn.text);
  return out;
}

function contextFile(
  input: RenderInput,
  title: string,
  sourceTitle: string,
  pageTitles: string[],
  summaries: Record<string, string>,
  revision: number,
  created: string,
): RenderedFile {
  const previous = input.previous.context;
  const questions = questionsOf(input.context);
  const shownNotes = input.notes.slice(0, 5);
  const front = [
    '---',
    'type: context',
    `title: ${yamlString(title)}`,
    'sources:',
    `  - ${yamlString(`chat: ${input.context.url}`)}`,
  ];
  if (shownNotes.length)
    front.push(
      ...yamlList(
        'memory_keys',
        shownNotes.map((note) => note.key),
      )
        .trimEnd()
        .split('\n'),
    );
  front.push(
    'generated: true',
    'generator: baleen',
    'review: unreviewed',
    `created: ${created}`,
    `updated: ${input.date}`,
    `revision: ${revision}`,
    '---',
  );
  const lines = [
    ...front,
    '',
    `# ${title}`,
    '',
    '> [!info] Why this page exists',
    '> This is not a concept page. It records what Baleen observed about your reading session, so the',
    '> concept pages can be selected and phrased for you instead of for a generic reader.',
    '',
    '## What you were doing',
    '',
    `You read [[${sourceTitle}]] on ${input.date}.`,
  ];
  if (questions.length) {
    lines.push('', 'Questions from this session:', '', ...questions.map((question) => `> ${question.replace(/\[\[/g, '[ [')}`));
  } else {
    lines.push('', 'There was no chat on this page, so the pages follow the source alone.');
  }
  if (shownNotes.length) {
    lines.push('', '## What Baleen remembers', '');
    for (const note of shownNotes)
      lines.push(`- **${note.key}** \u2014 ${clip(note.value, 300).replace(/\[\[/g, '[ [')}`);
  } else {
    lines.push('', '## What Baleen remembers', '', 'There was no saved memory for this session.');
  }
  lines.push('', '## How this shaped the pages', '');
  for (const page of pageTitles)
    lines.push(`- [[${page}]] \u2014 ${summaries[page] || 'compiled from the source.'}`);
  lines.push(
    '',
    '## What was deliberately not recorded',
    '',
    '- No facts were inferred from the page beyond the cited passages.',
    "- Baleen's replies are treated as a record of what you asked, never as evidence about the source.",
  );
  if (input.compilation.openQuestions.length) {
    lines.push('', '## Open questions for you', '');
    for (const question of input.compilation.openQuestions) lines.push(`- ${question}`);
  }
  lines.push('', historySection(previous, input.date, sourceTitle, revision));
  return {
    role: 'context',
    dir: 'context',
    name: title,
    content: `${lines.join('\n')}\n`,
  };
}

function indexFile(
  input: RenderInput,
  sourceTitle: string,
  contextTitle: string,
  pageTitles: string[],
  summaries: Record<string, string>,
  hash: string,
  orphans: number,
  carried: { title: string; summary: string }[],
): RenderedFile {
  const lines = [
    '---',
    'type: index',
    `source_url: ${yamlString(input.context.url)}`,
    'generated: true',
    'generator: baleen',
    `updated: ${input.date}`,
    '---',
    '',
    `# ${clip(input.context.title, 120) || 'Reading'} wiki`,
    '',
    `One page read on ${input.date}, compiled into ${pageTitles.length} concept page${pageTitles.length === 1 ? '' : 's'} and one reader-context page.`,
    'Every page carries its source, its generated marker, and its revision history.',
    '',
    '## Sources',
    '',
    `- [[${sourceTitle}]] \u2014 captured passages used for the citations.`,
    '',
    '## Concepts',
    '',
  ];
  for (const title of pageTitles) lines.push(`- [[${title}]] \u2014 ${summaries[title] || 'compiled from the source.'}`);
  for (const page of carried)
    lines.push(`- [[${page.title}]] \u2014 ${page.summary || 'from an earlier compile.'}`);
  lines.push(
    '',
    '## Context',
    '',
    `- [[${contextTitle}]] \u2014 what you asked, what Baleen remembers, and why these pages exist.`,
    '',
    '## Graph health',
    '',
    `- Unresolved links: 0. Orphan pages: ${orphans}. Pages without a source: 0.`,
    `- Source hash: ${hash.slice(0, 12)}\u2026`,
  );
  if (input.compilation.openQuestions.length) {
    lines.push('', 'Open review items:');
    for (const question of input.compilation.openQuestions) lines.push(`- ${question}`);
  } else {
    lines.push('- Open review items: none recorded.');
  }
  return { role: 'index', dir: '', name: 'index', content: `${lines.join('\n')}\n` };
}

const TITLE_FILLER = new Set([
  'a',
  'an',
  'the',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'to',
  'vs',
  'versus',
  'with',
]);

function titleWords(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word && !TITLE_FILLER.has(word)),
  );
}

/** How much two titles share, ignoring filler words; 0 unless at least two words match. */
export function titleOverlap(left: string, right: string): number {
  const a = titleWords(left);
  const b = titleWords(right);
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  const union = a.size + b.size - shared;
  return shared >= 2 && union ? shared / union : 0;
}

export function similarTitle(left: string, right: string): boolean {
  return titleOverlap(left, right) >= 0.5;
}

function address(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
  } catch {
    return url;
  }
}

/** Drop the section an earlier compile appended for this source, so a recompile replaces it. */
function withoutSourceSection(body: string, url: string): string {
  return body
    .replace(
      /<!-- baleen-source: (\S+) -->[\s\S]*?<!-- \/baleen-source -->/g,
      (block, marked: string) => (address(marked) === address(url) ? '' : block),
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function withoutSourceFootnotes(footnotes: string, url: string): string {
  return footnotes
    .split('\n')
    .filter((line) => {
      const marked = /<([^>]+)>/.exec(line);
      return !marked || address(marked[1]) !== address(url);
    })
    .join('\n');
}

/** The earlier page a draft belongs to: named by the model, an exact title, or a close title. */
function mergeTarget(
  page: RawPage,
  previous: PreviousState,
): { page: ExistingPage; by: 'model' | 'exact' | 'similar' } | null {
  const pool = (previous.existing ?? []).filter((item) => item.title.trim());
  const named = page.mergeInto?.toLowerCase();
  if (named) {
    const hit = pool.find(
      (item) =>
        item.title.toLowerCase() === named ||
        (item.aliases ?? []).some((alias) => alias.toLowerCase() === named),
    );
    if (hit) return { page: hit, by: 'model' };
  }
  const exact = pool.find((item) => item.title.toLowerCase() === page.title.toLowerCase());
  if (exact) return { page: exact, by: 'exact' };
  let best: ExistingPage | null = null;
  let score = 0;
  for (const candidate of pool)
    for (const name of [candidate.title, ...(candidate.aliases ?? [])]) {
      const overlap = titleOverlap(page.title, name);
      if (overlap > score) {
        best = candidate;
        score = overlap;
      }
    }
  return best && score >= 0.5 ? { page: best, by: 'similar' } : null;
}

export function renderWiki(input: RenderInput): RenderResult {
  const pages = input.compilation.pages.map((page) => ({
    ...page,
    aliases: [...page.aliases],
    related: page.related.map((link) => ({ ...link })),
  }));
  for (const page of pages) {
    const target = mergeTarget(page, input.previous);
    if (!target) continue;
    page.title = target.page.title;
    page.mergeInto = target.page.title;
    page.mergeBy = target.by;
  }
  // Two drafts can resolve to one earlier page; keep both texts instead of dropping one.
  const unique: RawPage[] = [];
  for (const page of pages) {
    const same = unique.find((item) => item.title.toLowerCase() === page.title.toLowerCase());
    if (!same) {
      unique.push(page);
      continue;
    }
    same.body = `${same.body.trimEnd()}\n\n${page.body.trim()}`.trim();
    same.aliases = [...new Set([...same.aliases, ...page.aliases])].slice(0, 5);
    same.related = [...same.related, ...page.related];
    same.mergeInto = page.mergeInto;
    same.mergeBy = page.mergeBy;
  }
  // The source page owns the article's title. A new draft that happens to reuse it is suffixed,
  // so a recompile writes the same sources/<title>.md instead of a "(2)" copy. A draft that was
  // matched to an existing page keeps that page's title, even if an older compile used the
  // article title for it.
  const sourceTitle = cleanTitle(input.context.title) || 'Untitled page';
  const pageTitles: string[] = [];
  for (const page of unique) {
    if (!page.mergeBy) page.title = uniqueTitle(page.title, [sourceTitle, ...pageTitles]);
    pageTitles.push(page.title);
  }
  const defined = new Set(pageTitles.map((title) => title.toLowerCase()));
  const carried = (input.previous.existing ?? []).filter(
    (page) => page.title.trim() && !defined.has(page.title.toLowerCase()),
  );
  const contextTitle = uniqueTitle(
    `Reader context \u2014 ${cleanTitle(input.compilation.topic) || 'this reading'}`,
    [...pageTitles, sourceTitle],
  );
  const catalog = new Catalog(
    sourceTitle,
    pageTitles,
    unique.map((page) => page.aliases),
    contextTitle,
    carried,
  );
  const passageCount = Math.min(
    input.context.passages.filter((passage) => passage.trim()).length,
    MAX_PASSAGES,
  );
  const sourceRevision = (input.previous.source?.revision ?? 0) + 1;
  const summaries: Record<string, string> = {};
  const files: RenderedFile[] = [];
  let linkCount = 0;
  const inbound = new Map<string, number>();
  for (const title of pageTitles) inbound.set(title.toLowerCase(), 0);
  const added: string[] = [];
  const updated: string[] = [];
  const merged: string[] = [];

  for (const page of unique) {
    const linked = normalizeLinks(page.body, catalog, page.title);
    const cited = citations(linked.text, passageCount);
    linkCount += linked.valid;
    const previous = input.previous.concepts[page.title];
    // A model-named or look-alike page is extended; an exact title still refreshes in place.
    const merging = !!previous?.body && !!page.mergeInto && page.mergeBy !== 'exact';
    page.merged = merging;
    const keptBody = merging ? withoutSourceSection(previous!.body!, input.context.url) : '';
    const keptFootnotes = merging
      ? withoutSourceFootnotes(previous!.footnotes ?? '', input.context.url)
      : '';
    // A page that already holds citations under this key (an earlier section whose definitions
    // cannot be traced back to this source) gets a fresh key instead of duplicate ids.
    let key = `r${sourceRevision}`;
    for (let n = 2; `${keptBody}\n${keptFootnotes}`.includes(`[^${key}p`); n += 1)
      key = `r${sourceRevision}-${n}`;
    const body = merging ? prefixed(cited.text, key) : cited.text;
    const footnotes = cited.used.length
      ? cited.used
          .map(
            (number) =>
              `[^${merging ? `${key}p` : 'p'}${number}]: [[${sourceTitle}#Passages|${sourceTitle}]], P${number} \u2014 <${input.context.url}>`,
          )
          .join('\n')
      : '';
    const revision = (previous?.revision ?? 0) + 1;
    const created = previous?.created ?? input.date;
    if (merging && previous)
      merged.push(`${page.title} (${previous.revision} \u2192 ${revision}, new section from ${sourceTitle})`);
    else if (previous) updated.push(`${page.title} (${previous.revision} \u2192 ${revision})`);
    else added.push(`${page.title} (revision ${revision})`);
    summaries[page.title] = page.summary || 'compiled from the source.';
    for (const match of linked.text.matchAll(/\[\[([^\[\]|#]+)/g)) {
      const target = catalog.resolve(match[1]);
      if (target && inbound.has(target.toLowerCase())) inbound.set(target.toLowerCase(), (inbound.get(target.toLowerCase()) ?? 0) + 1);
    }
    for (const link of page.related) {
      const target = catalog.resolve(link.to);
      if (!target || target.toLowerCase() === page.title.toLowerCase()) continue;
      linkCount += 1;
      if (inbound.has(target.toLowerCase()))
        inbound.set(target.toLowerCase(), (inbound.get(target.toLowerCase()) ?? 0) + 1);
    }
    files.push(
      conceptFile(
        page,
        input,
        catalog,
        sourceTitle,
        revision,
        created,
        body,
        footnotes,
        merging && previous
          ? {
              body: keptBody,
              footnotes: keptFootnotes,
              sources: [...new Set([...(previous.sources ?? []), input.context.url])],
            }
          : null,
      ),
    );
  }
  files.unshift(sourceFile(input, sourceTitle, sourceRevision));
  const contextRevision = (input.previous.context?.revision ?? 0) + 1;
  files.push(
    contextFile(
      input,
      contextTitle,
      sourceTitle,
      pageTitles,
      summaries,
      contextRevision,
      input.previous.context?.created ?? input.date,
    ),
  );
  const orphans = [...inbound.values()].filter((count) => count === 0).length;
  files.push(
    indexFile(input, sourceTitle, contextTitle, pageTitles, summaries, input.hash, orphans, carried),
  );
  return {
    files,
    logEntry: [
      `## [${input.date}] compile | ${sourceTitle}`,
      `- topic: ${input.compilation.topic}`,
      `- source: revision ${sourceRevision} \u00b7 sha256 ${input.hash.slice(0, 12)}\u2026`,
      ...(added.length ? [`- added: ${added.join('; ')}`] : []),
      ...(updated.length ? [`- updated: ${updated.join('; ')}`] : []),
      ...(merged.length ? [`- merged: ${merged.join('; ')}`] : []),
      ...(carried.length ? [`- kept: ${carried.map((page) => page.title).join('; ')}`] : []),
      `- context: revision ${contextRevision}`,
      '',
    ].join('\n'),
    folder: pageFolderName(input.context),
    sourceTitle,
    topic: input.compilation.topic,
    pageCount: unique.length,
    linkCount,
    orphans,
    carried: carried.length,
    merges: merged.length,
    pages: unique,
    openQuestions: input.compilation.openQuestions,
  };
}

/** The request body: what actually leaves the browser, and only after Compile is pressed. */
export function buildWikiRequest(
  context: WikiContext,
  notes: NotePair[],
  date: string,
  existing: ExistingPage[] = [],
): string {
  const parts: string[] = [
    `Page title: ${clip(context.title, 160) || 'Untitled page'}`,
    `URL: ${context.url}`,
    `Date: ${date}`,
  ];
  let used = 0;
  const source: string[] = [];
  context.passages.forEach((passage, index) => {
    const text = oneLine(passage).replace(/^```\s*|\s*```$/g, '');
    if (!text) return;
    const line = `P${index + 1}: ${clip(text, 900)}`;
    if (used + line.length > PASSAGE_BUDGET) return;
    used += line.length + 1;
    source.push(line);
  });
  parts.push('', '<source>', ...source, '</source>');
  if (existing.length) {
    // Every existing page is named with its small metadata, even when the excerpt budget runs
    // out; only the excerpts are rationed. Naming a title without its summary is what let a
    // second model miss a near-duplicate under a different wording.
    const base = existing.map((page) => {
      const alias = page.aliases?.length
        ? ` (also called: ${clip(page.aliases.join(', '), 100)})`
        : '';
      const summary = page.summary ? ` \u2014 ${clip(page.summary, 180)}` : '';
      return `- "${clip(page.title, 120)}"${alias}${summary}`;
    });
    // Every page is named with its small metadata before any excerpt is paid for; excerpts then
    // take only what is left, in order. Spending the budget greedily on early excerpts used to
    // drop the last pages from the list altogether.
    const pages: string[] = [];
    let used = 0;
    for (const line of base) {
      if (used + line.length + 1 > EXISTING_BUDGET) break;
      used += line.length + 1;
      pages.push(line);
    }
    const omitted = base.length - pages.length;
    const listed = pages.length;
    if (omitted)
      pages.push(
        `- ${omitted} more page${omitted === 1 ? '' : 's'} in the folder are not listed; check the index before adding a near-duplicate.`,
      );
    for (let index = 0; index < listed; index += 1) {
      const body = existing[index].body;
      const excerpt = body ? `\n  current text: ${clip(oneLine(body), 320)}` : '';
      if (!excerpt || used + excerpt.length > EXISTING_BUDGET) continue;
      used += excerpt.length;
      pages[index] += excerpt;
    }
    if (pages.length) parts.push('', '<existing_pages>', ...pages, '</existing_pages>');
  }
  if (notes.length) {
    const memory: string[] = [];
    let memoryUsed = 0;
    for (const note of notes) {
      const line = `- ${note.key}: ${clip(note.value, 400)}`;
      if (memoryUsed + line.length > MEMORY_BUDGET) break;
      memoryUsed += line.length + 1;
      memory.push(line);
    }
    parts.push('', '<memory>', ...memory, '</memory>');
  }
  const chat: string[] = [];
  let chatUsed = 0;
  const addChat = (label: string, turns: WikiTurn[]) => {
    const lines = [`${label}:`];
    for (const turn of turns) {
      if (!turn.text.trim()) continue;
      const line = `${turn.role === 'user' ? 'You' : 'Baleen'}: ${clip(turn.text, 600)}`;
      if (chatUsed + line.length > CHAT_BUDGET) break;
      chatUsed += line.length + 1;
      lines.push(line);
    }
    if (lines.length > 1) chat.push(...lines);
  };
  addChat('Reading chat', context.talk);
  for (const study of context.study.slice(-3)) addChat(`Study chat "${clip(study.name, 60)}"`, study.turns);
  if (chat.length) parts.push('', '<reader>', ...chat, '</reader>');
  return parts.join('\n').slice(0, MAX_CONTEXT_CHARS);
}
