/**
 * Move focus through menu items as the reader types a name. A repeated letter cycles the
 * options that share it, and the buffer resets after a pause. Returns true when it moved.
 */
export function typeAhead<T extends HTMLElement>(
  items: readonly T[],
  label: (item: T) => string,
  active: () => T | null,
): (event: KeyboardEvent) => boolean {
  let query = '';
  let at = 0;
  return (event) => {
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return false;
    const now = Date.now();
    query = (now - at > 700 ? event.key : query + event.key).toLowerCase();
    at = now;
    if (query.length > 1 && /^(.)\1*$/.test(query)) query = event.key.toLowerCase();
    const names = items.map((item) => label(item).toLowerCase());
    // Names repeat their provider ("DeepSeek V4 Pro", "DeepSeek Flash"), so a letter may
    // start any word, not only the name. A letter that cannot extend the buffer starts a
    // new one, so fast jumps between initials still work.
    const matches = (name: string, needle: string) =>
      name.startsWith(needle) || name.split(/[\s_-]+/).some((word) => word.startsWith(needle));
    const needles = query.length > 1 ? [query, event.key.toLowerCase()] : [query];
    const current = items.indexOf(active() as T);
    for (const needle of needles) {
      for (let step = 1; step <= items.length; step += 1) {
        const index = (current + step + items.length) % items.length;
        if (matches(names[index], needle)) {
          query = needle;
          items[index].focus();
          return true;
        }
      }
    }
    return false;
  };
}
