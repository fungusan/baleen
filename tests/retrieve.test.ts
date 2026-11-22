import { afterEach, describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { findPassages, wikiPassages } from '../src/content/retrieve';

const WHALES = 'Whales migrate across the ocean each winter.';
const MARKET = 'The stock market fell sharply on Tuesday.';
const CAPTION = 'Photograph captions need alt text so screen readers can describe the image.';
const ALL = [WHALES, MARKET, CAPTION].join('\n\n');

type Shared = {
  __baleenPageTexts?: unknown;
  __baleenPagePassage?: unknown;
};
const shared = globalThis as Shared;

/** Exercise the extractor with PDF text, so the ranker runs without a DOM. */
function setPdf(pages: string[], passage?: string) {
  shared.__baleenPageTexts = pages;
  shared.__baleenPagePassage = passage;
}

afterEach(() => {
  delete shared.__baleenPageTexts;
  delete shared.__baleenPagePassage;
});

describe('findPassages', () => {
  test('takes the passage that matches the rare terms when the budget is tight', () => {
    setPdf([ALL]);
    assert.equal(findPassages('where do whales migrate', 50), WHALES);
  });

  test('matches case-insensitively', () => {
    setPdf([ALL]);
    assert.equal(findPassages('WHALE', 50), WHALES);
  });

  test('brings the neighbors of a hit and restores reading order', () => {
    setPdf([ALL]);
    assert.equal(findPassages('stock market', 200), ALL);
  });

  test('falls back to a spread sample for a vague question', () => {
    setPdf([ALL]);
    assert.equal(findPassages('what is this about?', 800), ALL);
    assert.equal(findPassages('the and of', 800), ALL);
  });

  test('falls back to a spread sample when nothing matches lexically', () => {
    setPdf([ALL]);
    assert.equal(findPassages('quantum chromodynamics', 800), ALL);
  });

  test('prepends the focus passage and keeps it out of the retrieved text', () => {
    setPdf([ALL]);
    const focus = 'Krill form the base of the food web.';
    const focused = findPassages('whales', 120, focus);
    assert.ok(focused.startsWith(`${focus}\n\n`));
    assert.ok(focused.includes(WHALES));

    const repeated = findPassages('whales', 400, WHALES);
    assert.equal(repeated.split(WHALES).length - 1, 1);
  });

  test('never exceeds the budget', () => {
    setPdf([ALL]);
    for (const budget of [60, 120, 200, 800]) {
      assert.ok(findPassages('whales', budget).length <= budget, `budget ${budget}`);
    }
  });

  test('splits one long PDF line into retrievable pieces', () => {
    setPdf(['The ocean is deep and cold. '.repeat(80)]);
    const result = findPassages('cold', 900);
    assert.ok(result.length <= 900);
    assert.ok(result.includes('cold'));
  });
});

describe('wikiPassages', () => {
  test('keeps reading order, skips short passages, and respects the budget', () => {
    setPdf([[MARKET, WHALES, CAPTION].join('\n\n')]);
    assert.deepEqual(wikiPassages(80), [MARKET]);
    assert.deepEqual(wikiPassages(200), [MARKET, WHALES, CAPTION]);
  });

  test('drops a passage repeated across PDF pages', () => {
    setPdf([[WHALES, MARKET].join('\n\n'), WHALES]);
    assert.deepEqual(wikiPassages(200), [WHALES, MARKET]);
    assert.deepEqual(wikiPassages(80), [WHALES]);
  });

  test('reads the single-passage fallback as one page', () => {
    setPdf([], `${WHALES}\n\n${MARKET}`);
    assert.deepEqual(wikiPassages(200), [WHALES, MARKET]);
  });
});
