/**
 * Trusted documentation about Baleen itself. It travels with a chat only when the reader asks
 * about the extension, so ordinary page questions stay lean and the manual never masquerades as
 * page text.
 */
export const BALEEN_HELP = `About Baleen (internal documentation about this extension; trusted reference, not page data)

Baleen is a reading companion extension. Its settings live in the toolbar popup: Appearance (Theme, Show on pages, Size, Animate), Connection (an API key, the model, and Memory), and Study. Flash is fast and V4 Pro is stronger, both served by DeepSeek; Kimi K3.1 Pro is Kimi's flagship and Kimi K3 is the previous generation, both served by Kimi. Each provider keeps its own key, and the key row follows the model you pick. Memory sits at the bottom of Connection and opens its own page, where you can view, edit, or delete what Baleen remembers, five entries per page. Study opens a second level with Keywords and Summarize and a Chats card where Reading chat and Study chats each reveal their own two actions; Back returns to the settings.

Reading chat: click Baleen, or focus her and press Enter, then type and press Enter. She answers in one short sentence and the bubble fades; Escape or a click on the page closes it. She searches the page inside the tab — the text you selected if there is a selection, otherwise what you are reading — and sends only matching passages, never the whole page. Alt/Option+Shift+G toggles Show on pages. While hidden, Ask Baleen and already-open section chats still work.

Section chat: select text, then click the Ask Baleen pill (or press Alt/Option+E). The floating window stays beside its section, has its own model picker, resizes from its edges, collapses to a bookmark with the minus button, changes color from the dot, and renders Markdown and LaTeX with expandable thinking.

Study level: Keywords extracts 5-8 research terms and Summarize gives 4-6 short bullets, both from the page area in view or the bundled PDF. Each opens as a chat pinned at Baleen's lower left without highlighting any text, and clicking the same action again reopens that chat instead of starting another. In Chats, open Reading chat for Export reading chat and Clear reading chat, or Study chats for Export study chats and Close study chats. Each export is a Markdown transcript with its model, provider, and message count; Clear reading chat empties her bubble conversation, and Close study chats closes the section windows.

Memory: the Memory row at the bottom of Connection opens its own page with Baleen's memory of you, kept as key/value pairs such as "tone: Prefers concise answers"; one value may hold a short paragraph. The row shows only the count; the page lists five entries at a time. She adds an entry when you ask her to remember something and when what you say reveals a durable preference, interest, or fact — never from page text. Every entry can be viewed, edited, or deleted. The memory is sent with reading chat and section chat as reference, up to about 3,000 characters. The API keys and memory stay on the reader's device. Page text, the message, and the memory go only to the provider behind the selected model, api.deepseek.com for DeepSeek and api.moonshot.ai for Kimi, and only when the reader sends a message or presses a Study action. Images are not uploaded; only alt text and captions are visible.

Limits: Baleen cannot click, scroll, or edit the page for the reader, and normal talk replies are deliberately one short sentence.

Attribution: the character art is derivative fan art by ZipZipPipe (pixiv.net/artworks/148186519), based on 上善's whale-girl OC, licensed CC BY-NC-SA 4.0. The Kimi costume renders are also by ZipZipPipe; Kimi is a Moonshot AI character, used here as non-commercial fan art and not affiliated with or endorsed by Moonshot. It is non-commercial; the credit link is in the popup footer.`;

const ASKS_ABOUT_BALEEN = [
  /\bbaleen\b/i,
  /\bthis extension\b/i,
  /\b(?:hide|show|turn off|turn on|disable|enable|remove|update|install) (?:the|this) extension\b/i,
  /\bpopup\b/i,
  /\byour (?:menu|settings|notes?|memory|api key|key|chat|bubble|window|model|voice|size|theme|shortcut)\b/i,
  /\b(?:hide|show|turn off|turn on|switch off|switch on) you\b/i,
  /\b(?:who|what) are you\b/i,
  /\bwhat can you do\b/i,
  /\b(?:what|which) (?:theme|model|size) (?:are you|do you)\b/i,
  /\b(?:can|do) you (?:see|read|upload|send|share) (?:images|pictures|photos)\b/i,
  /\b(?:ask baleen|export (?:study |reading )?chats?|close (?:all |study )?chats?|clear (?:the |my )?reading chat)\b/i,
  /\b(?:my|your|the (?:deepseek|kimi)) api key\b/i,
  /\bwhere (?:is|are|do i|can i)\b.{0,40}\b(?:api key|my notes|notes panel|memory|settings?|size|theme|model|popup)\b/i,
  /\b(?:what|how) does (?:keywords|summarize|study|export (?:study |reading )?chats?|close (?:all |study )?chats?|clear (?:the )?reading chat|memory) (?:do|work)\b/i,
  /\b(?:alt|option)\s*\+\s*(?:shift\s*\+\s*)?[a-z]\b/i,
  /\bhow (?:do|can) (?:i|you) (?:use|hide|show|export|close|save|add|delete|remove|change|edit|turn|make|resize)\b.{0,40}\b(?:you|baleen|chats?|notes?|key|popup|settings?|shortcut)\b/i,
  /\b(?:stay|stays|leave|leaves|sent|uploaded|stored|shared)\b.{0,30}\b(?:device|server|api\.deepseek|deepseek|api\.moonshot|moonshot|kimi)\b/i,
];

/** True when the message is about Baleen rather than the page; precision matters more than recall. */
export function asksAboutBaleen(prompt: unknown): boolean {
  if (typeof prompt !== 'string' || !prompt.trim()) return false;
  return ASKS_ABOUT_BALEEN.some((pattern) => pattern.test(prompt));
}
