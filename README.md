# Baleen

Manifest V3 Chromium extension (`0.0.0`). She appears on every HTTP(S) page as a single idle drawing,
opens a chat window beside any section you highlight, and pulls keywords or a whole-page summary
through the DeepSeek API using your own key. Top-level PDFs
open in a bundled reader with the same selection chat and Study actions. The outfit, size, position,
theme, the hidden and animation flags, and the chosen model are the only saved preferences.

## Companion

DeepSeek wears one of two outfits: her maid dress or a school uniform. Hover her to reveal two menu
buttons, **Study** (keywords, page summary, session tools) and **Character**. The Character menu
holds her **Outfit** cards, a **Size** slider under them, an **Animate** switch, and **Show on
pages**; the popup keeps the same size slider and the show-on-pages switch. Every surface writes the
same settings, so a choice applies to every tab at once and survives a reload. Each outfit is one
idle render. Her listening, thinking, speaking, joy, dejection and rest beats are CSS keyframes on
that drawing — no per-state art — and they are driven only by what you do in her own chat blocks and
Study panel; page text is never read. **Animate** off freezes those keyframes while keeping the
drawing and the bubble.
Reduced-motion users get the static drawing and the bubble. **Show on pages** in the popup hides or
restores her on every tab (Alt+Shift+G works too — Option+Shift+G on a Mac); turning it off from the
Character menu hides her the same way, and the extension menu or the shortcut brings her back.
Opening the popup re-injects her into any tab whose content script a reloaded extension orphaned, so
she returns without a page refresh. The popup, her panels and her chat blocks follow the device light
or dark appearance; **Theme** in the popup can pin Light or Dark instead.

## Section chat and Study

Save a DeepSeek API key in the popup. Highlight a section and a small **Ask DeepSeek** pill appears at
the end of the selection; click it (or press Alt+E) and a compact chat window opens beside the
section, anchored to its last selected line. The window floats over the article instead of joining
its layout, so a long section never stretches or reflows the page; it stays next to its section as
you scroll. It opens below the selection, steps above it when the viewport is short of room, and can
be dragged by its header if you want it elsewhere — the offset is remembered through scrolling and
reloads. Three marked grips resize it: the **↔** on the right edge changes width, the **↕** on the
bottom edge changes height, and the **L** corner changes both at once. Each grip is a button, so you
can also focus it and use the arrow keys (Shift for bigger steps). The size is kept with the offset,
reused by the next conversation you open, and never gives way while the page changes. **−** collapses it to a
narrow one-line chip, and **+** on that chip opens it again. Each
window highlights its section in its own color; new sections take the next unused color from a
six-color palette, and the dot in the window header opens the palette when you want to change one.
The selection itself is never touched, so dragging, copying, and other browser actions behave as if
the extension were not there. Close a window with its × or Escape, or clear them all from **Study**.
Windows live in the tab's session, so a reload restores them with their conversation, color, dragged
position, size, and open/collapsed state; asking about the same section again reopens the window it
already has, expanding it when collapsed. The selected text and images stay outlined while a window
is open. Each window names itself after the heading its section sits under, falling back to the first
words of the selection, the image's caption, or the page title; the name sits in the header, is what
the collapsed chip shows, and survives a reload. Type a question and
Send: the selected text, the question, and any image captions or alt text in that section go to
DeepSeek. DeepSeek's API is text-only, so image pixels are never sent, and the window says so when a
selection includes images. Follow-up questions keep the same section context, and the model chosen
in the popup (or in a section window) picks between `deepseek-flash` and `deepseek-v4-pro`.
Answers render Markdown (lists, tables, emphasis, inline code, fenced blocks, links) and LaTeX:
`$...$` inline and `$$...$$` on its own line. Chat answers are requested in thinking mode, and the
chain of thought comes back in a collapsible **Thought for Ns** block above the answer. Raw HTML in
a reply stays literal text.

Open **Study** beside her for **Keywords** or **Summarize** across the page's main readable text,
plus **Export chats** (a Markdown transcript of what you asked on this page this session, with each
conversation filed under its auto name) and
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
- `src/shared/` — outfit metadata, settings sanitization, and message types.
- `public/characters/` — one folder per outfit with its bundled WebP render and head crop.
- `public/pdf/` — pdf.js worker, CMaps, fonts, WASM decoders, and ICC profiles.
- `public/privacy.html` — privacy notice linked from the popup.
- `public/icons/` — toolbar icons.
- `art-src/` — the supplied cut-out behind the shipped render, its reference sheets, and the
  generation prompts kept for provenance.

## Artwork

The maid render comes from the user's supplied cut-out; the school-uniform render was generated for
this build. Both are cut from a solid green background, cleaned of its rim, and normalised to one
solid-alpha height. Source art was produced for this personal build from the user's supplied
samples. The samples' creator/license has not been established; no redistribution rights are
claimed. See `LICENSE`.
