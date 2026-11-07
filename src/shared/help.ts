/**
 * Trusted documentation about Baleen itself. It travels with a chat only when the reader asks
 * about the extension, so ordinary page questions stay lean and the manual never masquerades as
 * page text.
 */
export const BALEEN_HELP = `About Baleen (internal documentation about this extension; trusted reference, not page data)

Baleen is a reading companion extension. Its settings live in the toolbar popup: Appearance (Theme, Show on pages, Size, Animate) and Connection (DeepSeek API key, and model: Flash is fast, V4 Pro is stronger). Choose Study on the first level to open a second level with Keywords, Summarize, Export chats, Close all chats, and your Notes; Back returns to the settings.

Reading chat: click Baleen, or focus her and press Enter, then type and press Enter. She answers in one short sentence and the bubble fades; Escape or a click on the page closes it. She searches the page inside the tab and sends only matching passages, never the whole page. Alt/Option+Shift+G toggles Show on pages. While hidden, Ask Baleen and already-open section chats still work.

Section chat: select text, then click the Ask Baleen pill (or press Alt/Option+E). The floating window stays beside its section, has its own model picker, resizes from its edges, collapses to a bookmark with the minus button, changes color from the dot, and renders Markdown and LaTeX with expandable thinking.

Study level: Keywords extracts 5-8 research terms and Summarize gives 4-6 short bullets, both from the active page or the bundled PDF. Export chats downloads this page's section chats and reading chat as Markdown; Close all chats closes the section windows.

Notes: add, edit, or delete key/value pairs such as "tone: Prefers concise answers". They are sent with both reading chat and section chat as reference. Ask Baleen to remember something and she adds a note to the same list; you can still edit or delete it. The API key and notes stay on the reader's device. Page text, the message, and notes go only to api.deepseek.com, and only when the reader sends a message or presses a Study action. Images are not uploaded; only alt text and captions are visible.

Limits: Baleen cannot click, scroll, or edit the page for the reader, and normal talk replies are deliberately one short sentence.

Attribution: the character art is derivative fan art by ZipZipPipe (pixiv.net/artworks/148186519), based on 上善's whale-girl OC, licensed CC BY-NC-SA 4.0. It is non-commercial; the credit link is in the popup footer.`;

const ASKS_ABOUT_BALEEN = [
  /\bbaleen\b/i,
  /\bthis extension\b/i,
  /\b(?:hide|show|turn off|turn on|disable|enable|remove|update|install) (?:the|this) extension\b/i,
  /\bpopup\b/i,
  /\byour (?:menu|settings|notes?|api key|key|chat|bubble|window|model|voice|size|theme|shortcut)\b/i,
  /\b(?:hide|show|turn off|turn on|switch off|switch on) you\b/i,
  /\b(?:who|what) are you\b/i,
  /\bwhat can you do\b/i,
  /\b(?:what|which) (?:theme|model|size) (?:are you|do you)\b/i,
  /\b(?:can|do) you (?:see|read|upload|send|share) (?:images|pictures|photos)\b/i,
  /\b(?:ask baleen|export chats?|close all chats?)\b/i,
  /\b(?:my|your|the deepseek) api key\b/i,
  /\bwhere (?:is|are|do i|can i)\b.{0,40}\b(?:api key|my notes|notes panel|settings?|size|theme|model|popup)\b/i,
  /\b(?:what|how) does (?:keywords|summarize|study|export chats?|close all chats?) (?:do|work)\b/i,
  /\b(?:alt|option)\s*\+\s*(?:shift\s*\+\s*)?[a-z]\b/i,
  /\bhow (?:do|can) (?:i|you) (?:use|hide|show|export|close|save|add|delete|remove|change|edit|turn|make|resize)\b.{0,40}\b(?:you|baleen|chats?|notes?|key|popup|settings?|shortcut)\b/i,
  /\b(?:stay|stays|leave|leaves|sent|uploaded|stored|shared)\b.{0,30}\b(?:device|server|api\.deepseek|deepseek)\b/i,
];

/** True when the message is about Baleen rather than the page; precision matters more than recall. */
export function asksAboutBaleen(prompt: unknown): boolean {
  if (typeof prompt !== 'string' || !prompt.trim()) return false;
  return ASKS_ABOUT_BALEEN.some((pattern) => pattern.test(prompt));
}
