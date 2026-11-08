import type { Model } from './types';

// Monochrome glyphs on a 16px grid, filled with currentColor so both pickers follow their theme.
const GLYPHS: Record<Model, string> = {
  'deepseek-flash': '<path d="M9.6 1 3 9.2h4L6.4 15 13 6.8H9z"/>',
  'deepseek-v4-pro': '<path d="M8 1 9.55 6.45 15 8 9.55 9.55 8 15 6.45 9.55 1 8 6.45 6.45Z"/>',
  'kimi-k3.1-pro': '<path d="M14 8.5A6 6 0 1 1 7.5 2a4.7 4.7 0 0 0 6.5 6.5Z"/>',
  'kimi-k3': '<circle cx="8" cy="8" r="5.2"/>',
};

export const modelIcon = (id: Model) =>
  `<svg class="model-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${GLYPHS[id]}</svg>`;
