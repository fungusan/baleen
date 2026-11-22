import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  buildWikiRequest,
  pageFolderName,
  parseCompilation,
  renderWiki,
  sessionIndexFile,
  similarTitle,
  titleOverlap,
} from '../src/shared/wiki';
import type {
  ExistingPage,
  PreviousState,
  RawPage,
  RenderInput,
  RenderResult,
  WikiContext,
} from '../src/shared/wiki';

const DATE = '2026-11-22';
const URL = 'https://example.com/whales';

function makeContext(overrides: Partial<WikiContext> = {}): WikiContext {
  return {
    title: 'Understanding Whales',
    url: URL,
    passages: ['Whales are mammals.', 'They breathe air through blowholes.'],
    talk: [],
    study: [],
    ...overrides,
  };
}

function makePage(overrides: Partial<RawPage> = {}): RawPage {
  return {
    title: 'Whale Biology',
    aliases: [],
    summary: 'Whales are marine mammals.',
    confidence: 'high',
    body: 'Whales are mammals [P1].',
    related: [],
    ...overrides,
  };
}

function makeInput(overrides: Partial<RenderInput> = {}): RenderInput {
  return {
    context: makeContext(),
    compilation: { topic: 'Whales', pages: [makePage()], openQuestions: [] },
    notes: [],
    hash: 'a'.repeat(64),
    date: DATE,
    previous: { concepts: {} },
    ...overrides,
  };
}

function fileOf(result: RenderResult, name: string) {
  const found = result.files.find((file) => file.name === name);
  assert.ok(found, `expected a file named ${name}`);
  return found;
}

describe('parseCompilation', () => {
  test('accepts fenced JSON and cleans titles, aliases, bodies, and related links', () => {
    const reply = [
      'Here is the wiki:',
      '```json',
      JSON.stringify({
        topic: '  Whales / Oceans ',
        pages: [
          {
            title: '  A/B: C ',
            aliases: ['A/B: C', 'Alias/One', '', 7],
            summary: 'One line\nsummary.',
            confidence: 'high',
            body: '# Heading\n\nBody [P1].',
            related: [
              { to: 'A/B: C', why: 'self' },
              { to: 'Other/Page', why: 'because' },
            ],
          },
        ],
        open_questions: [' What about krill? '],
      }),
      '```',
    ].join('\n');
    const parsed = parseCompilation(reply);
    assert.equal(parsed.topic, 'Whales / Oceans');
    assert.equal(parsed.pages.length, 1);
    assert.equal(parsed.pages[0].title, 'A B C');
    assert.deepEqual(parsed.pages[0].aliases, ['Alias One']);
    assert.equal(parsed.pages[0].summary, 'One line summary.');
    assert.equal(parsed.pages[0].body, 'Body [P1].');
    assert.deepEqual(parsed.pages[0].related, [
      { to: 'A B C', why: 'self' },
      { to: 'Other Page', why: 'because' },
    ]);
    assert.deepEqual(parsed.openQuestions, ['What about krill?']);
  });

  test('suffixes duplicate titles, drops unusable pages, and defaults confidence', () => {
    const reply = JSON.stringify({
      topic: '',
      pages: [
        { title: 'Same', summary: 'first', confidence: 'wat', body: 'one' },
        { title: 'Same', summary: 'second', body: 'two' },
        { title: '', summary: 'empty' },
        null,
        'nope',
        { title: 'Same', summary: 'third' },
      ],
    });
    const parsed = parseCompilation(reply);
    assert.deepEqual(
      parsed.pages.map((page) => page.title),
      ['Same', 'Same (2)', 'Same (3)'],
    );
    assert.equal(parsed.pages[0].confidence, 'medium');
    assert.equal(parsed.topic, 'Same');
  });

  test('rejects replies that are not a usable wiki', () => {
    assert.throws(() => parseCompilation('no json here'), /did not return a wiki/);
    assert.throws(() => parseCompilation('{"pages": }'), /broken wiki/);
    assert.throws(() => parseCompilation('{"pages":[]}'), /any usable pages/);
  });
});

describe('title matching', () => {
  test('ignores filler words and requires two shared words', () => {
    assert.equal(similarTitle('Reading and Memory', 'Memory in Reading'), true);
    assert.equal(titleOverlap('Whale Migration', 'Whale Migration Patterns'), 2 / 3);
    assert.equal(titleOverlap('Whale Migration', 'Cooking Pasta'), 0);
    assert.equal(titleOverlap('Whale', 'Whale'), 0);
  });
});

describe('pageFolderName', () => {
  test('sanitizes the title into a folder name', () => {
    assert.equal(pageFolderName(makeContext({ title: 'A/B: C?' })), 'A B C');
    assert.equal(pageFolderName(makeContext({ title: '' })), 'Untitled page');
    assert.equal(pageFolderName(makeContext({ title: '   ' })), 'Untitled page');
  });
});

describe('renderWiki', () => {
  test('renders source, concept, context, and index files without trusting the reply', () => {
    const body =
      'Whales are mammals [P1], not fish [P9]. See [[Unknown Page]], ' +
      '[[Understanding Whales]], and [[Whale Biology]].';
    const result = renderWiki(
      makeInput({
        compilation: {
          topic: 'Whales',
          pages: [
            makePage({
              body,
              related: [
                { to: 'Understanding Whales', why: 'the source' },
                { to: 'Nope', why: 'unknown' },
              ],
            }),
          ],
          openQuestions: ['Why do they sing?'],
        },
      }),
    );

    assert.equal(result.folder, 'Understanding Whales');
    assert.equal(result.sourceTitle, 'Understanding Whales');
    assert.equal(result.pageCount, 1);
    assert.equal(result.linkCount, 2);
    assert.equal(result.merges, 0);
    assert.deepEqual(
      result.files.map((file) => file.role),
      ['source', 'concept', 'context', 'index'],
    );

    const concept = fileOf(result, 'Whale Biology');
    assert.equal(concept.role, 'concept');
    assert.equal(concept.dir, 'concepts');
    assert.ok(!concept.content.includes('[[Unknown Page]]'));
    assert.ok(!concept.content.includes('[P9]'));
    assert.ok(!concept.content.includes('[^p9]'));
    assert.ok(concept.content.includes('[^p1]'));
    assert.ok(
      concept.content.includes(
        '[^p1]: [[Understanding Whales#Passages|Understanding Whales]], P1',
      ),
    );
    assert.match(concept.content, /revision: 1/);
    assert.match(concept.content, /review: unreviewed/);

    const source = fileOf(result, 'Understanding Whales');
    assert.equal(source.role, 'source');
    assert.equal(source.dir, 'sources');
    assert.ok(source.content.includes('immutable: true'));
    assert.ok(source.content.includes('**P1.** Whales are mammals.'));
    assert.ok(source.content.includes('**P2.** They breathe air through blowholes.'));
    assert.ok(!source.content.includes('**P3.**'));

    const context = fileOf(result, 'Reader context — Whales');
    assert.equal(context.role, 'context');
    assert.ok(context.content.includes('There was no chat on this page'));
    assert.ok(context.content.includes('There was no saved memory for this session.'));
    assert.ok(context.content.includes('Why do they sing?'));

    const index = fileOf(result, 'index');
    assert.equal(index.dir, '');
    assert.match(index.content, /Orphan pages: 1/);
    assert.ok(index.content.includes('Open review items:'));
    assert.ok(index.content.includes('Why do they sing?'));

    assert.match(result.logEntry, /compile \| Understanding Whales/);
    assert.match(result.logEntry, /added: Whale Biology \(revision 1\)/);
  });

  test('keeps the source title and suffixes a colliding draft', () => {
    const result = renderWiki(
      makeInput({
        compilation: {
          topic: 'Whales',
          pages: [makePage({ title: 'Understanding Whales', body: 'A draft.' })],
          openQuestions: [],
        },
      }),
    );
    assert.equal(result.sourceTitle, 'Understanding Whales');
    assert.deepEqual(
      result.files.filter((file) => file.role === 'concept').map((file) => file.name),
      ['Understanding Whales (2)'],
    );
  });

  test('extends a merged page, prefixes its footnotes, and continues revisions', () => {
    const previous: PreviousState = {
      concepts: {
        'Whale Biology': {
          revision: 2,
          created: '2026-11-01',
          history: ['- 2026-11-01 — compiled from [[Earlier Page]] (revision 2).'],
          body: 'Earlier text about baleen [^p1].',
          footnotes: '[^p1]: earlier',
        },
      },
      context: { revision: 1, created: '2026-11-01', history: [] },
      source: { revision: 3, created: '2026-11-01', history: [] },
      existing: [
        { title: 'Whale Biology', summary: 'Marine mammals.' },
        { title: 'Krill', summary: 'Tiny crustaceans.' },
      ],
    };
    const result = renderWiki(
      makeInput({
        previous,
        compilation: {
          topic: 'Whales',
          pages: [
            makePage({
              title: 'Whale Feeding',
              mergeInto: 'whale biology',
              body: 'New section [P1].',
            }),
          ],
          openQuestions: [],
        },
      }),
    );

    assert.equal(result.merges, 1);
    assert.equal(result.carried, 1);
    assert.equal(result.pages[0].merged, true);
    const concept = fileOf(result, 'Whale Biology');
    assert.match(concept.content, /revision: 3/);
    assert.ok(concept.content.includes('Earlier text about baleen [^p1].'));
    assert.ok(concept.content.includes('## From [[Understanding Whales]]'));
    assert.ok(concept.content.includes('New section [^r4p1].'));
    assert.ok(
      concept.content.includes(
        '[^r4p1]: [[Understanding Whales#Passages|Understanding Whales]], P1',
      ),
    );
    assert.match(result.logEntry, /merged: Whale Biology \(2 → 3/);
    assert.match(result.logEntry, /kept: Krill/);
    assert.ok(fileOf(result, 'index').content.includes('[[Krill]]'));
  });

  test('refreshes an exact title in place instead of merging into it', () => {
    const previous: PreviousState = {
      concepts: {
        'Whale Biology': {
          revision: 2,
          created: '2026-11-01',
          history: [],
          body: 'Old body [^p1].',
        },
      },
      existing: [{ title: 'Whale Biology', summary: 'Old.' }],
    };
    const result = renderWiki(
      makeInput({
        previous,
        compilation: {
          topic: 'Whales',
          pages: [makePage({ body: 'New body [P1].' })],
          openQuestions: [],
        },
      }),
    );

    assert.equal(result.merges, 0);
    const concept = fileOf(result, 'Whale Biology');
    assert.match(concept.content, /revision: 3/);
    assert.ok(concept.content.includes('New body [^p1].'));
    assert.ok(!concept.content.includes('Old body'));
    assert.ok(!concept.content.includes('## From [[Understanding Whales]]'));
    assert.match(result.logEntry, /updated: Whale Biology \(2 → 3\)/);
  });

  test('lists pages from earlier compiles as carried, not redefined', () => {
    const previous: PreviousState = {
      concepts: {},
      existing: [{ title: 'Krill', summary: 'Tiny crustaceans.' }],
    };
    const result = renderWiki(makeInput({ previous }));
    assert.equal(result.carried, 1);
    assert.equal(result.pageCount, 1);
    assert.ok(fileOf(result, 'index').content.includes('- [[Krill]]'));
  });
});

describe('buildWikiRequest', () => {
  test('numbers passages, lists existing pages, and includes memory and reader chat', () => {
    const existing: ExistingPage[] = [
      {
        title: 'Whale Biology',
        aliases: ['Cetaceans'],
        summary: 'Marine mammals.',
        body: 'Old text.',
      },
    ];
    const context = makeContext({
      title: 'A long read',
      talk: [
        { role: 'user', text: 'Why do whales sing?' },
        { role: 'assistant', text: 'To communicate.' },
      ],
      study: [{ name: 'Sound', turns: [{ role: 'user', text: 'How deep?' }] }],
    });
    const request = buildWikiRequest(
      context,
      [{ key: 'tone', value: 'direct' }],
      DATE,
      existing,
    );

    assert.match(request, /^Page title: A long read\nURL: https:\/\/example\.com\/whales/);
    assert.ok(request.includes('<source>'));
    assert.ok(request.includes('P1: Whales are mammals.'));
    assert.ok(request.includes('P2: They breathe air through blowholes.'));
    assert.ok(request.includes('<existing_pages>'));
    assert.ok(request.includes('- "Whale Biology" (also called: Cetaceans) — Marine mammals.'));
    assert.ok(request.includes('current text: Old text.'));
    assert.ok(request.includes('<memory>'));
    assert.ok(request.includes('- tone: direct'));
    assert.ok(request.includes('<reader>'));
    assert.ok(request.includes('Reading chat:'));
    assert.ok(request.includes('You: Why do whales sing?'));
    assert.ok(request.includes('Baleen: To communicate.'));
    assert.ok(request.includes('Study chat "Sound":'));
    assert.ok(request.includes('You: How deep?'));
  });

  test('stops adding passages once the passage budget is spent', () => {
    const passages = Array.from({ length: 10 }, () => 'x'.repeat(1000));
    const request = buildWikiRequest(makeContext({ passages }), [], DATE);
    assert.ok(request.includes('P1: '));
    assert.ok(request.includes('P7: '));
    assert.ok(!request.includes('P8: '));
  });

  test('unwraps fenced code and enforces the overall request cap', () => {
    const fenced = buildWikiRequest(
      makeContext({ passages: ['```\nconst x = 1;\n```'] }),
      [],
      DATE,
    );
    assert.ok(fenced.includes('P1: const x = 1;'));

    const huge = buildWikiRequest(
      makeContext({
        passages: Array.from({ length: 40 }, () => 'y'.repeat(1000)),
        talk: Array.from({ length: 40 }, () => ({
          role: 'user' as const,
          text: 'z'.repeat(1000),
        })),
      }),
      Array.from({ length: 40 }, (_, index) => ({
        key: `k${index}`,
        value: 'w'.repeat(400),
      })),
      DATE,
      Array.from({ length: 40 }, (_, index) => ({
        title: `Page ${index}`,
        summary: 's'.repeat(180),
        body: 'b'.repeat(400),
      })),
    );
    assert.ok(huge.length <= 11_500, `request was ${huge.length} characters`);
  });
});

describe('sessionIndexFile', () => {
  test('summarizes a multi-tab session with matching plurals', () => {
    const file = sessionIndexFile({
      title: 'Whale session',
      date: DATE,
      sources: [
        { title: 'One', url: 'https://a.example' },
        { title: 'Two', url: 'https://b.example' },
      ],
      concepts: [{ title: 'Migration', summary: '' }],
      contexts: ['Reader context — One'],
      openQuestions: [],
      orphans: 2,
    });
    assert.equal(file.name, 'index');
    assert.equal(file.dir, '');
    assert.match(
      file.content,
      /2 pages read on 2026-11-22, compiled into 1 concept page and 1 context page\./,
    );
    assert.ok(file.content.includes('- [[One]]'));
    assert.ok(file.content.includes('- [[Two]]'));
    assert.ok(file.content.includes('Orphan pages: 2'));
    assert.ok(file.content.includes('Open review items: none recorded.'));
  });
});
