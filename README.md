# Baleen

Manifest V3 Chromium extension (`1.1.0`). She appears on every HTTP(S) page as a single idle drawing,
texts with you about the page in a one-line reading chat, opens a chat window beside any section you
highlight, and pulls keywords or a whole-page summary through the DeepSeek API using your own key. Top-level PDFs
open in a bundled reader with the same selection chat and Study actions. The size, position, theme,
the hidden and animation flags, and the chosen model are the only saved preferences.

## Companion

Baleen wears her maid dress. Hover her to reveal two menu buttons, **Study** (keywords, page
summary, session tools) and **Character**. The Character menu holds a **Size** slider, an
**Animate** switch, and **Show on pages**; the popup keeps the same size slider and the
show-on-pages switch. Every surface writes the same settings, so a choice applies to every tab at
once and survives a reload. She has one idle render. Her listening, thinking, speaking, joy, dejection and rest beats are CSS keyframes on
that drawing — no per-state art — and they are driven only by what you do in her own chats and Study
panel; page text is never read until you send her a message. **Animate** off freezes those keyframes
while keeping the drawing and the bubble.
Reduced-motion users get the static drawing and the bubble. **Show on pages** in the popup hides or
restores her on every tab (Alt+Shift+G works too — Option+Shift+G on a Mac); turning it off from the
Character menu hides her the same way, and the extension menu or the shortcut brings her back.
Opening the popup re-injects her into any tab whose content script a reloaded extension orphaned, so
she returns without a page refresh. The popup, her panels and her chat blocks follow the device light
or dark appearance; **Theme** in the popup can pin Light or Dark instead.

## Reading chat

Click her (or focus her and press Enter) and a small speech bubble appears above her head with a
visible message field: the same hairline composer the section chat uses, so it is clear where to
type, and Enter sends.
Send a question and she replaces the field with exactly one short sentence in a rounded, friendly
face, plain text, like a friend replying. The sentence stays for a few seconds and then fades; it is
not replayed the next time you click her, which opens the field again. There is no window, thread,
header, or model picker. She travels with the page's main readable text shortened to 6,000
characters and the last six turns of the conversation shortened to 600 characters each, so
follow-ups keep the thread without resending everything. Click her again, press Escape, or click
the page to close the bubble; the conversation belongs to the page and survives a reload in the
tab's session, and **Export chats** in Study includes it. Her thinking, speaking, and reaction beats
follow the exchange.

## Section chat and Study

Save a DeepSeek API key in the popup. Highlight a section and an **Ask Baleen** button appears
at the end of the selection; click it and a compact chat window opens beside the section, anchored to its last selected line. The window floats over the article instead of joining
its layout, so a long section never stretches or reflows the page; it stays next to its section as
you scroll. It opens below the selection, steps above it when the viewport is short of room, and can
be dragged by its header or by any answer it has written if you want it elsewhere — the offset is
remembered through scrolling and
reloads. Three marked grips resize it: the **↔** on the right edge changes width, the **↕** on the
bottom edge changes height, and the **L** corner changes both at once. Each grip is a button, so you
can also focus it and use the arrow keys (Shift for bigger steps). The size is kept with the offset,
reused by the next conversation you open, and never gives way while the page changes. **−** collapses
it to a small bookmark-shaped tab in the window's colour, with no label; click the bookmark to open
it again, or drag it by the tab to leave it anywhere on the page. Each
window highlights its section in its own color; new sections take the next unused color from a
ten-color palette, and the dot in the window header opens the palette when you want to change one.
The same color carries into the bookmark, the selection outline, the user's messages, and the send
button, so sections stay tellable apart.
The selection itself is never touched, so dragging, copying, and other browser actions behave as if
the extension were not there. Close a window with its × or Escape, or clear them all from **Study**.
Windows are remembered on the site itself, so a reload, a new tab or a browser restart restores them
with their conversation, color, dragged position, size, and open/collapsed state, and a dragged
bookmark comes back at the exact spot it was left in; the section's outline comes back too, even on a
page that renders its text after the extension starts. Asking about the same section again reopens the
window it already has, expanding it when collapsed. The selected text and images stay outlined while
a window is open. A new window starts as **New Chat**; after its first answer it renames itself to a short
title generated from the exchange, falling back to the section's heading if that request fails. The
name sits slightly larger in the header and survives a reload. Type a question and
Send: the selected text, the question, and any image captions or alt text in that section go to
Baleen. The request behind her is DeepSeek's API, which is text-only, so image pixels are never
sent, and the window says so when a selection includes images. Follow-up questions keep the same section context, and the model chosen
in the popup (or in a section window) picks between `deepseek-flash` and `deepseek-v4-pro`.
Answers render Markdown (lists, tables, emphasis, inline code, fenced blocks, links) and LaTeX:
`$...$` inline and `$$...$$` on its own line. Chat answers are requested in thinking mode, and the
chain of thought comes back in a collapsible **Thought for Ns** block above the answer. Raw HTML in
a reply stays literal text.

Open **Study** beside her for **Keywords** or **Summarize** across the page's main readable text,
plus **Export chats** (a Markdown transcript of what you asked on this page this session: each
section conversation filed under its auto name, followed by her reading chat) and
**Close all chats**. Study answers use the same Markdown and LaTeX rendering as chat. Requests go from the service worker straight to `https://api.deepseek.com`; the
key is stored in `chrome.storage.local`, never shown again after saving, and never reaches the page.

## PDF reader

A top-level PDF response is redirected into `viewer.html`, which renders it with pdf.js. Pages draw
lazily as you scroll, the text layer is selectable, and the companion, section chat windows, and
Study work exactly as on a web page: a selection becomes the section, each window stays anchored to
its selection through zoom, and Keywords or Summarize use the text extracted from the whole document. **Download** saves the original file, and **Open original** hands
the URL back to Chrome's built-in viewer once. Attachments (`Content-Disposition: attachment`) still
download normally. Chrome's native PDF viewer cannot host content scripts, so she does not mount
there.

The PDF itself is fetched directly from the site by the extension, with the site's cookies, and is
never uploaded anywhere. Pages and text layers are rendered in the tab. Only the DeepSeek request you
trigger sends text, and only its usual selected section or page passage.

`public/pdf/` holds the pdf.js worker, CMaps, standard fonts, WASM decoders, and ICC profiles copied
from `pdfjs-dist` 6.4.299 (Apache-2.0, license included).

## Build

Requires Node 22.12+.

```sh
npm install
npm run typecheck
npm run build
```

Load the generated `dist/` folder from `chrome://extensions` with **Developer mode** enabled and
**Load unpacked**.

## Source

- `src/manifest.ts` — MV3 manifest; content script, storage, scripting, webRequest, site access,
  DeepSeek host permission, CSP.
- `src/viewer/` — bundled pdf.js reader: lazy page rendering, selectable text layer, whole-document
  text extraction for Study, download and open-original escape hatches.
- `src/popup/` — show-on-pages switch, size slider, model choice, and API key management.
- `src/background.ts` — serialized preference writes, the show/hide shortcut, tab re-injection, and
  DeepSeek requests.
- `src/shared/deepseek.ts` — DeepSeek client, model selection, and prompts.
- `src/shared/key.ts` — API key validation and local storage.
- `src/content/` — companion card, the Study and Character menus, and the anchored section chat
  windows.
- `src/shared/` — character metadata, settings sanitization, and message types.
- `public/characters/` — her bundled WebP render.
- `public/pdf/` — pdf.js worker, CMaps, fonts, WASM decoders, and ICC profiles.
- `public/icons/` — toolbar icons.
- `art-src/baleen/` — the supplied cut-out behind the shipped render.

## Artwork

The render comes from the user's supplied cut-out. It is matted off the white page it was lifted
from — the flat-white band along the silhouette and inside hair loops is removed, while the shaded
white of the apron, ruffles and tights is kept — then normalised to one solid-alpha height. Source
art was produced for this personal build from the user's supplied samples. The samples' creator/license has not been established; no redistribution rights are
claimed. See `LICENSE`.
