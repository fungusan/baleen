import type { CharacterId, Model } from './types';

export interface Character {
  id: CharacterId;
  /** Accessible name for the card. */
  name: string;
  /** Costume name, shown when a model offers more than one drawing. */
  label: string;
  /** Glow colour, taken from the character's palette in the supplied art. */
  accent: string;
  /** Width / height of the trimmed full-body art, so the overlay box hugs the figure. */
  aspect: number;
}
// A model offers one or more drawings and the reader picks among them. Both DeepSeek models pair
// their maid with a witch: the broom for Flash and the moon-staff gown for V4 Pro. Kimi K3.1 Pro
// pairs the pumpkin cat with the moonlit flute dress; GLM-5.3 pairs the gothic Cat with the
// Ghost poncho; Qwen and MiniMax each have one drawing.
export const CHARACTERS: readonly Character[] = [
  {
    id: 'baleen',
    name: 'Baleen',
    label: 'Maid',
    accent: '#2f4a8a',
    aspect: 0.553,
  },
  {
    id: 'baleen-flash',
    name: 'Baleen',
    label: 'Maid',
    accent: '#2f4a8a',
    aspect: 0.522,
  },
  {
    id: 'baleen-flash-witch',
    name: 'Baleen',
    label: 'Witch',
    accent: '#5d468c',
    aspect: 0.5538,
  },
  {
    id: 'baleen-pro-witch',
    name: 'Baleen',
    label: 'Witch',
    accent: '#5b4a7e',
    aspect: 0.5548,
  },
  {
    id: 'baleen-kimi',
    name: 'Baleen',
    label: 'Moonlit',
    accent: '#3b3f7a',
    aspect: 0.5346,
  },
  {
    id: 'baleen-kimi-halloween',
    name: 'Baleen',
    label: 'Pumpkin',
    accent: '#b8601f',
    aspect: 0.5375,
  },
  {
    id: 'baleen-qwen',
    name: 'Baleen',
    label: 'Fan',
    accent: '#5667c9',
    aspect: 0.5192,
  },
  {
    id: 'baleen-glm',
    name: 'Baleen',
    label: 'Cat',
    accent: '#35507d',
    aspect: 0.5404,
  },
  {
    id: 'baleen-glm-ghost',
    name: 'Baleen',
    label: 'Ghost',
    accent: '#c9782f',
    aspect: 0.5596,
  },
  {
    id: 'baleen-minimax',
    name: 'Baleen',
    label: 'Reporter',
    accent: '#d97a63',
    aspect: 0.5365,
  },
];
const COSTUMES: Record<Model, readonly CharacterId[]> = {
  'deepseek-v4-pro': ['baleen', 'baleen-pro-witch'],
  'deepseek-flash': ['baleen-flash', 'baleen-flash-witch'],
  'kimi-k3.1-pro': ['baleen-kimi-halloween', 'baleen-kimi'],
  'qwen3.8-max': ['baleen-qwen'],
  'glm-5.3': ['baleen-glm', 'baleen-glm-ghost'],
  'minimax-m3': ['baleen-minimax'],
};
export const costumesFor = (model: Model): readonly CharacterId[] => COSTUMES[model];
/** The chosen drawing for a model, falling back to its first when nothing valid was stored. */
export const costumeFor = (
  model: Model,
  outfits: Partial<Record<Model, CharacterId>>,
): CharacterId => {
  const chosen = outfits[model];
  return chosen && COSTUMES[model].includes(chosen) ? chosen : COSTUMES[model][0];
};
export const characterById = (id: CharacterId): Character =>
  CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
/**
 * Art lives at a stable path, so Chrome happily serves a cached copy after a rebuild. Tagging the
 * URL with the extension version and art revision makes every release fetch the current render.
 */
const ART_REVISION = '41';
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
