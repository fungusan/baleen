import type { CharacterId, Model } from './types';

export interface Character {
  id: CharacterId;
  /** Accessible name for the card. */
  name: string;
  /** Glow colour, taken from the character's palette in the supplied art. */
  accent: string;
  /** Width / height of the trimmed full-body art, so the overlay box hugs the figure. */
  aspect: number;
}
// The chat model chooses which drawing is on the page: the maid for V4 Pro, the notebook for Flash,
// the pumpkin cat for Kimi K3.1 Pro and the moonlit flute dress for Kimi K3. There is no outfit picker.
export const CHARACTERS: readonly Character[] = [
  {
    id: 'baleen',
    name: 'Baleen',
    accent: '#2f4a8a',
    aspect: 0.553,
  },
  {
    id: 'baleen-flash',
    name: 'Baleen',
    accent: '#2f4a8a',
    aspect: 0.522,
  },
  {
    id: 'baleen-kimi',
    name: 'Baleen',
    accent: '#3b3f7a',
    aspect: 0.5346,
  },
  {
    id: 'baleen-kimi-halloween',
    name: 'Baleen',
    accent: '#b8601f',
    aspect: 0.5375,
  },
];
export const characterForModel = (model: Model): CharacterId => {
  if (model === 'deepseek-v4-pro') return 'baleen';
  if (model === 'kimi-k3.1-pro') return 'baleen-kimi-halloween';
  if (model === 'kimi-k3') return 'baleen-kimi';
  return 'baleen-flash';
};
export const characterById = (id: CharacterId): Character =>
  CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
/**
 * Art lives at a stable path, so Chrome happily serves a cached copy after a rebuild. Tagging the
 * URL with the extension version and art revision makes every release fetch the current render.
 */
const ART_REVISION = '35';
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
/** The idle render for one outfit; she has no other drawings. */
export const artURL = (id: CharacterId) => `characters/${id}/full.webp?v=${assetVersion()}`;
