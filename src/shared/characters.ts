import type { CharacterId } from './types';

export interface Character {
  id: CharacterId;
  /** Accessible name for the card. */
  name: string;
  /** Glow colour, taken from the character's palette in the supplied art. */
  accent: string;
  /** Width / height of the trimmed full-body art, so the overlay box hugs the figure. */
  aspect: number;
  /** How far the drawn head sits from the canvas top and right edges, as canvas fractions. */
  inset: { top: number; right: number };
  /** Pixels to raise the fixed-size emote bubble above hair that reaches the canvas top. */
  lift: number;
}
// One girl ships in this build, in one outfit, so the art, storage key and overlay geometry all
// live in a single entry and there is no outfit to choose.
export const CHARACTERS: readonly Character[] = [
  {
    id: 'baleen',
    name: 'Baleen',
    accent: '#2f4a8a',
    aspect: 0.553,
    inset: { top: 0, right: 0.094 },
    lift: 0,
  },
];
export const DEFAULT_CHARACTER: CharacterId = 'baleen';
export const characterById = (id: CharacterId): Character =>
  CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
/**
 * Art lives at a stable path, so Chrome happily serves a cached copy after a rebuild. Tagging the
 * URL with the extension version and art revision makes every release fetch the current render.
 */
const ART_REVISION = '31';
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
