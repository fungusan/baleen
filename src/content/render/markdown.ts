import temml from 'temml';

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!$>~|]/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/**
 * Answers are rendered by building DOM nodes, never by assigning HTML. Raw HTML in a reply stays
 * literal text, so a model that echoes page content cannot inject markup into every site Baleen
 * runs on. Only the MathML subtree comes from Temml, which escapes its own TeX and refuses \href.
 */
export function renderMarkdown(source: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const fence = /^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !new RegExp(`^\\s*${marker}{3,}\\s*$`).test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      if (fence[2]) code.className = `language-${fence[2]}`;
      code.textContent = body.join('\n');
      pre.append(code);
      fragment.append(pre);
      continue;
    }
    if (line.trimStart().startsWith('$$')) {
      const after = line.trimStart().slice(2);
      const body: string[] = [];
      index += 1;
      const closing = after.indexOf('$$');
      if (closing >= 0) {
        body.push(after.slice(0, closing));
      } else {
        if (after.trim()) body.push(after);
        while (index < lines.length) {
          const end = lines[index].indexOf('$$');
          if (end >= 0) {
            body.push(lines[index].slice(0, end));
            index += 1;
            break;
          }
          body.push(lines[index]);
          index += 1;
        }
      }
      fragment.append(mathNode(body.join('\n'), true));
      continue;
    }
    const heading = /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const node = document.createElement(`h${heading[1].length}`) as HTMLHeadingElement;
      inline(node, heading[2]);
      fragment.append(node);
      index += 1;
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      fragment.append(document.createElement('hr'));
      index += 1;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        body.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      const quote = document.createElement('blockquote');
      quote.append(renderMarkdown(body.join('\n')));
      fragment.append(quote);
      continue;
    }
    const rule = lines[index + 1];
    if (
      line.includes('|') &&
      rule?.includes('|') &&
      TABLE_RULE.test(rule) &&
      !/^\s*[-*+]\s/.test(line)
    ) {
      const table = document.createElement('table');
      const head = document.createElement('thead');
      const headRow = document.createElement('tr');
      for (const cell of cells(line)) {
        const th = document.createElement('th');
        inline(th, cell);
        headRow.append(th);
      }
      head.append(headRow);
      table.append(head);
      const body = document.createElement('tbody');
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        const row = document.createElement('tr');
        for (const cell of cells(lines[index])) {
          const td = document.createElement('td');
          inline(td, cell);
          row.append(td);
        }
        body.append(row);
        index += 1;
      }
      if (body.children.length) table.append(body);
      fragment.append(table);
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      const list = parseList(lines, index, item[1].replace(/\t/g, '  ').length);
      fragment.append(list.node);
      index = list.next;
      continue;
    }
    const paragraph = document.createElement('p');
    const body: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !startsBlock(lines[index])) {
      body.push(lines[index].trim());
      index += 1;
    }
    inline(paragraph, body.join('\n'));
    fragment.append(paragraph);
  }
  return fragment;
}

function startsBlock(line: string): boolean {
  return (
    /^\s*(?:#{1,6}\s|`{3,}|~{3,}|\$\$|>)/.test(line) ||
    LIST_ITEM.test(line) ||
    /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)
  );
}

function cells(line: string): string[] {
  let value = line.trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|')) value = value.slice(0, -1);
  return value.split('|').map((cell) => cell.trim());
}

function parseList(lines: string[], start: number, baseIndent: number) {
  const first = LIST_ITEM.exec(lines[start]);
  const ordered = !!first && /\d/.test(first[2]);
  const list = document.createElement(ordered ? 'ol' : 'ul');
  let index = start;
  while (index < lines.length) {
    const match = LIST_ITEM.exec(lines[index]);
    if (!match) break;
    const indent = match[1].replace(/\t/g, '  ').length;
    if (indent < baseIndent) break;
    if (indent > baseIndent) {
      const nested = parseList(lines, index, indent);
      (list.lastElementChild ?? list).append(nested.node);
      index = nested.next;
      continue;
    }
    if (/\d/.test(match[2]) !== ordered && list.children.length) break;
    const item = document.createElement('li');
    inline(item, match[3]);
    list.append(item);
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !LIST_ITEM.test(lines[index]) &&
      /^\s+/.test(lines[index])
    ) {
      item.append(document.createElement('br'));
      inline(item, lines[index].trim());
      index += 1;
    }
  }
  return { node: list, next: index };
}

function mathNode(tex: string, display: boolean): Node {
  if (!tex.trim()) return document.createTextNode('');
  try {
    const rendered = temml.renderToString(tex.trim(), {
      displayMode: display,
      throwOnError: false,
      strict: false,
      trust: false,
    });
    const holder = document.createElement('div');
    holder.innerHTML = rendered;
    const math = holder.firstElementChild;
    if (!math) return document.createTextNode(tex);
    if (!display) return math;
    const box = document.createElement('div');
    box.className = 'math-display';
    box.append(math);
    return box;
  } catch {
    return document.createTextNode(tex);
  }
}

/** A `$` only opens math when it is not followed by a space and no closer looks like a currency. */
function dollarClose(text: string, start: number): number {
  if (start >= text.length || /\s/.test(text[start])) return -1;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '\\') {
      index += 1;
      continue;
    }
    if (text[index] !== '$') continue;
    if (index === start || /\s/.test(text[index - 1])) return -1;
    if (/\d/.test(text[index + 1] ?? '')) return -1;
    return index;
  }
  return -1;
}

function safeHref(raw: string): string | null {
  const value = raw.trim().replace(/^<|>$/g, '');
  if (!value) return null;
  try {
    const url = new URL(value, location.href);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function inline(parent: Node, text: string) {
  let buffer = '';
  let index = 0;
  const flush = () => {
    if (!buffer) return;
    parent.appendChild(document.createTextNode(buffer));
    buffer = '';
  };
  while (index < text.length) {
    const char = text[index];
    if (char === '\n') {
      flush();
      parent.appendChild(document.createElement('br'));
      index += 1;
      continue;
    }
    if (char === '\\') {
      if (text.startsWith('\\(', index)) {
        const end = text.indexOf('\\)', index + 2);
        if (end > index) {
          flush();
          parent.appendChild(mathNode(text.slice(index + 2, end), false));
          index = end + 2;
          continue;
        }
      }
      if (text.startsWith('\\[', index)) {
        const end = text.indexOf('\\]', index + 2);
        if (end > index) {
          flush();
          parent.appendChild(mathNode(text.slice(index + 2, end), false));
          index = end + 2;
          continue;
        }
      }
      const next = text[index + 1] ?? '';
      if (ESCAPABLE.test(next)) {
        buffer += next;
        index += 2;
        continue;
      }
      buffer += char;
      index += 1;
      continue;
    }
    if (char === '`') {
      let ticks = 1;
      while (text[index + ticks] === '`') ticks += 1;
      const marker = '`'.repeat(ticks);
      const end = text.indexOf(marker, index + ticks);
      if (end > index) {
        flush();
        const code = document.createElement('code');
        code.textContent = text.slice(index + ticks, end).trim();
        parent.appendChild(code);
        index = end + ticks;
        continue;
      }
      buffer += marker;
      index += ticks;
      continue;
    }
    if (char === '$') {
      const end = dollarClose(text, index + 1);
      if (end > index) {
        flush();
        parent.appendChild(mathNode(text.slice(index + 1, end), false));
        index = end + 1;
        continue;
      }
    }
    if (text.startsWith('**', index) || text.startsWith('__', index)) {
      const marker = text.slice(index, index + 2);
      const end = text.indexOf(marker, index + 2);
      if (end > index + 2) {
        flush();
        const strong = document.createElement('strong');
        inline(strong, text.slice(index + 2, end));
        parent.appendChild(strong);
        index = end + 2;
        continue;
      }
    }
    if (text.startsWith('~~', index)) {
      const end = text.indexOf('~~', index + 2);
      if (end > index + 2) {
        flush();
        const deleted = document.createElement('del');
        inline(deleted, text.slice(index + 2, end));
        parent.appendChild(deleted);
        index = end + 2;
        continue;
      }
    }
    if (char === '*' || char === '_') {
      if (char === '_' && /\w/.test(text[index - 1] ?? '')) {
        buffer += char;
        index += 1;
        continue;
      }
      const end = text.indexOf(char, index + 1);
      if (end > index + 1 && !/\s/.test(text[end - 1])) {
        flush();
        const emphasis = document.createElement('em');
        inline(emphasis, text.slice(index + 1, end));
        parent.appendChild(emphasis);
        index = end + 1;
        continue;
      }
    }
    if (char === '[') {
      const close = text.indexOf('](', index + 1);
      const end = close > index ? text.indexOf(')', close + 2) : -1;
      if (end > close) {
        const href = safeHref(text.slice(close + 2, end));
        if (href) {
          flush();
          const link = document.createElement('a');
          link.href = href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          inline(link, text.slice(index + 1, close));
          parent.appendChild(link);
          index = end + 1;
          continue;
        }
      }
    }
    if (char === '<') {
      const auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/.exec(text.slice(index));
      const href = auto ? safeHref(auto[1]) : null;
      if (auto && href) {
        flush();
        const link = document.createElement('a');
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = auto[1];
        parent.appendChild(link);
        index += auto[0].length;
        continue;
      }
    }
    buffer += char;
    index += 1;
  }
  flush();
}
