import type { Model } from './types';

// Monochrome glyphs on a 16px grid, filled with currentColor so both pickers follow their theme.
const GLYPHS: Record<Model, string> = {
  'deepseek-flash': '<path d="M9.6 1 3 9.2h4L6.4 15 13 6.8H9z"/>',
  'deepseek-v4-pro': '<path d="M8 1 9.55 6.45 15 8 9.55 9.55 8 15 6.45 9.55 1 8 6.45 6.45Z"/>',
  'kimi-k3.1-pro': '<path d="M14 8.5A6 6 0 1 1 7.5 2a4.7 4.7 0 0 0 6.5 6.5Z"/>',
  // Simplified provider marks: Qwen's knot, the GLM "Z" tile, MiniMax's signal bars.
  'qwen3.8-max':
    '<path fill-rule="evenodd" d="M8 1.4a6.6 6.6 0 1 0 0 13.2A6.6 6.6 0 0 0 8 1.4Zm0 2.4a4.2 4.2 0 1 1 0 8.4 4.2 4.2 0 0 1 0-8.4ZM8 4.7 11.3 8 8 11.3 4.7 8Z"/>',
  'glm-5.3': '<path d="M2.2 2.6h11.6v2.1L5.5 11.5h8.3v2H2.2v-2.1l8.3-6.8H2.2Z"/>',
  'minimax-m3': '<path d="M2 8h2.2v6H2zM5.6 3h2.2v11H5.6zM9.2 6h2.2v8H9.2zM12.8 4h1.6v10h-1.6z"/>',
};

export const modelIcon = (id: Model) =>
  `<svg class="model-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${GLYPHS[id]}</svg>`;
