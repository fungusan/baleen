import { artURL, characterById } from '../../shared/characters';
import { isExtension } from '../../shared/settings';
import type { CharacterId, Look } from '../../shared/types';
import characterCSS from './character.css?inline';
export { characterCSS };

const emotes: Record<Look, string> = {
  idle: '',
  listen: '?',
  thinking: '···',
  speak: '',
  happy: '♡',
  sad: '…',
  rest: 'z z',
};

/** The idle render with a transparent background; every look is CSS on this one image. */
export function createCharacter(id: CharacterId) {
  const element = document.createElement('div');
  element.className = 'fg-character';
  const body = document.createElement('div');
  body.className = 'fg-body';
  const image = document.createElement('img');
  image.className = 'fg-art';
  image.draggable = false;
  image.alt = '';
  const emote = document.createElement('span');
  emote.className = 'fg-emote';
  emote.setAttribute('aria-hidden', 'true');
  body.append(image);
  element.append(body, emote);
  let look: Look = 'idle';
  function source(value: CharacterId) {
    const url = artURL(value);
    if (!isExtension()) return `/${url}`;
    try {
      return chrome.runtime.getURL(url);
    } catch {
      // The extension was reloaded after the check; the card is being torn down anyway.
      return `/${url}`;
    }
  }
  function setLook(value: Look) {
    if (value === look) return;
    look = value;
    element.dataset.pose = value;
    emote.textContent = emotes[value];
  }
  function setCharacter(value: CharacterId) {
    if (element.dataset.character === value) return;
    const character = characterById(value);
    element.dataset.character = value;
    element.style.setProperty('--accent', character.accent);
    element.style.setProperty('--art-top', String(character.inset.top));
    element.style.setProperty('--art-right', String(character.inset.right));
    element.style.setProperty('--art-lift', `${character.lift}px`);
    element.setAttribute('aria-label', character.name);
    image.src = source(value);
    image.alt = character.name;
  }
  function setAnimated(value: boolean) {
    element.dataset.animated = String(value);
  }
  function visibility() {
    element.dataset.paused = String(document.hidden);
  }
  document.addEventListener('visibilitychange', visibility);
  setCharacter(id);
  element.dataset.pose = look;
  setAnimated(true);
  visibility();
  return {
    element,
    setCharacter,
    setLook,
    setAnimated,
    destroy() {
      document.removeEventListener('visibilitychange', visibility);
      element.remove();
    },
  };
}
