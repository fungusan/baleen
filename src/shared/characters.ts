import type { CharacterId } from './types';

export interface Character {
  id: CharacterId;
  /** Display label used in the card's accessible name. */
  name: string;
  /** Glow colour, taken from the character's palette in the supplied art. */
  accent: string;
  /** Width / height of the trimmed full-body art, so the overlay box hugs the figure. */
  aspect: number;
}
// One girl ships in this build: DeepSeek. The ID stays stable so existing settings and art paths
// survive; the name is a label, not a claim of affiliation.
export const CHARACTERS: readonly Character[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    accent: '#2f4a8a',
    aspect: 0.667,
  },
];
export const characterById = (id: CharacterId): Character =>
  CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
/**
 * Art lives at a stable path, so Chrome happily serves a cached copy after a rebuild. Tagging the
 * URL with the extension version and art revision makes every release fetch the current render.
 */
const ART_REVISION = '23';
const assetVersion = () => {
  try {
    const version =
      typeof chrome !== 'undefined' &&
      !!chrome.runtime?.id &&
      typeof chrome.runtime?.getManifest === 'function'
        ? chrome.runtime.getManifest().version
        : 'dev';
    return `${version}-${ART_REVISION}`;
  } catch {
    // A reloaded extension invalidates this context: the getManifest reference survives, but
    // calling it throws. The tag only busts the art cache, so fall back quietly.
    return `dev-${ART_REVISION}`;
  }
};
/** The single idle render; she has no other drawings. */
export const artURL = (id: CharacterId) => `characters/${id}/full.webp?v=${assetVersion()}`;
/** Head badge derived from the same transparent render, for the companion card. */
export const headURL = (id: CharacterId) => `characters/${id}/head.png?v=${assetVersion()}`;
