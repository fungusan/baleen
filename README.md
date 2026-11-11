# Baleen

Manifest V3 Chromium extension (`2.0.0`). She appears on every HTTP(S) page as one of ten idle
drawings, texts with you about the page in a one-line reading chat, opens a chat window beside any
section you highlight, and runs keywords or a whole-page summary through your own DeepSeek, Kimi,
Qwen, GLM, or MiniMax API key. Top-level PDFs open in a bundled reader with the same selection chat
and Study actions. Study can also compile the page into a linked wiki in an Obsidian vault.
Preferences, her memory of you, and open section chats are saved in the extension.

## Companion

Baleen has ten drawings across six models. **V4 Pro** offers the original **Maid** and the
moon-staff **Witch**, **Flash** the notebook **Maid** and the broom **Witch**, **Kimi K3.1 Pro**
the **Pumpkin** cat and the **Moonlit** flute dress, and **GLM-5.3** the gothic **Cat** and the
**Ghost** poncho. **Qwen3.8 Max** and **MiniMax M3** each have one drawing: the blue **Fan** gown
and the **Reporter**. Every model with two drawings is switchable under **Appearance › Outfit**. No outfit adds buttons to the page. The toolbar popup keeps the original
compact panel: **Appearance** (theme, show on pages and animate, size, outfit) and **Connection**
(API key, model, and memory). Each provider keeps its own key, so switching between DeepSeek, Kimi,
Qwen, GLM, and MiniMax swaps the key row. **Study** opens a second level in the same popup for keywords, summarize,
and one chats card with two choices — **Reading chat** and **Study chats** — each revealing its
export and clear or close actions. Connection also carries **Memory**, Baleen's memory of you,
whose count sits on the row and whose own page shows five entries at a time. **Back** returns to
the settings. Every surface writes the same
settings, so a choice applies to every tab at once and survives a reload. Each drawing has one idle
render. Her listening, thinking, speaking, joy, dejection and rest beats are CSS keyframes on
that drawing — no per-state art — and they are driven only by what you do in the popup or her own
chats; page text is never read until you send her a message. **Animate** off freezes those keyframes
while keeping the drawing and the bubble.
Reduced-motion users get the static drawing and the bubble. **Show on pages** in the popup hides or
restores her on every tab (Alt+Shift+G works too — Option+Shift+G on a Mac), and the extension menu
or the shortcut brings her back. Opening the popup re-injects her into any tab whose content script a
reloaded extension orphaned, so she returns without a page refresh. The popup and her chat blocks
follow the device light or dark appearance; **Theme** in the popup can pin Light or Dark instead.

## Reading chat

Click her (or focus her and press Enter) and a small speech bubble appears above her head with a
visible message field: the same hairline composer the section chat uses, so it is clear where to
type, and Enter sends.
Send a question and she replaces the field with exactly one short sentence in a rounded, friendly
face, plain text, like a friend replying. The sentence stays for a few seconds and then fades; it is
not replayed the next time you click her, which opens the field again. There is no window, thread,
header, or model picker. Before the request, the page is searched in the tab: paragraphs are scored
against your message and only the passages that match travel with it, about 3,500 characters, never
the whole page. A question that matches nothing falls back to a spread sample. The last six turns
also travel, shortened to 600 characters each, so follow-ups keep the thread. Click her again, press
Escape, or click the page to close the bubble; the conversation belongs to the page, survives a
reload in the tab's session, and stays until you pick **Clear reading chat** in Study. Her thinking, speaking, and
reaction beats follow the exchange.
Ask how to use Baleen — how to hide her, where a control lives, what Study does, what leaves the
device — and she answers from a short built-in reference. That reference travels only with messages
that ask about the extension, is trusted documentation rather than page text, and lets her answer
even on a page with no readable text.

## Section chat and Study

Save an API key for one of the five providers in the popup. Highlight a section and an **Ask Baleen** button appears
at the end of the selection; click it and a compact chat window opens beside the section, anchored to its last selected line. The window floats over the article instead of joining
its layout, so a long section never stretches or reflows the page; it stays next to its section as
you scroll. It opens below the selection, steps above it when the viewport is short of room, and can
be dragged by its header or by any answer it has written if you want it elsewhere — the offset is
remembered through scrolling and
reloads. Three marked grips resize it: the whole right edge changes width, the whole bottom edge
changes height, and the **L** corner changes both at once. Each grip is a button, so you
can also focus it and use the arrow keys (Shift for bigger steps). The size is kept with the offset,
reused by the next conversation you open, and never gives way while the page changes. **−** collapses
it to a small bookmark-shaped tab in the window's colour, with no label; click the bookmark to open
it again, or drag it by the tab to leave it anywhere on the page. Each
window highlights its section in its own color; new sections take the next unused color from a
ten-color palette, and the dot in the window header opens the palette when you want to change one.
The same color carries into the bookmark, the selection outline, the user's messages, and the send
button, so sections stay tellable apart.
The selection itself is never touched, so dragging, copying, and other browser actions behave as if
the extension were not there. Close a window with its × or Escape, or clear them all from **Study** in
the popup.
Windows are remembered on the site itself, so a reload, a new tab or a browser restart restores them
with their conversation, color, dragged position, size, and open/collapsed state, and a dragged
bookmark comes back at the exact spot it was left in; the section's outline comes back too, even on a
page that renders its text after the extension starts. Asking about the same section again reopens the
window it already has, expanding it when collapsed. The selected text and images stay outlined while
a window is open. A new window starts as **New Chat**; after its first answer it renames itself to a short
title generated from the exchange, falling back to the section's heading if that request fails. The
name sits slightly larger in the header and survives a reload. Type a question and
Send: the selected text, the question, and any image captions or alt text in that section go to
Baleen. The request behind her goes to the selected provider and carries text only, so image pixels
are never sent, and the window says so when a selection includes images. Follow-up questions keep the
same section context, and the model chosen in the popup (or in a section window) picks one of
`deepseek-flash`, `deepseek-v4-pro`, `kimi-k3.1-pro`, `qwen3.8-max`, `glm-5.3`, and `MiniMax-M3`.
Answers render Markdown (lists, tables, emphasis, inline code, fenced blocks, links) and LaTeX:
`$...$` inline and `$$...$$` on its own line. Chat answers are requested in thinking mode, and the
chain of thought comes back in a collapsible **Thought for Ns** block above the answer. Raw HTML in
a reply stays literal text.

Open **Study** in the popup: the **Wiki for Obsidian** row leads, with **Keywords** and
**Summarize** as two small buttons beneath it for the page area in view (or the whole document in
the PDF reader). Each answer opens as a chat pinned at her lower left, fixed to the screen with no
highlight, and asking the same action again reuses that chat rather than opening another. Below
those, a **Chats** card holds two choices: open **Reading chat** for **Export reading
chat** and **Clear reading chat**, or **Study chats** for **Export study chats** and **Close study
chats**. Each export is a Markdown transcript of that family on this page this session — every
section conversation filed under its auto name, or her reading chat — with its model, provider, and
message count. Study reads the tab you opened the popup from, including the bundled PDF reader, and answers
with the same Markdown and LaTeX rendering as chat. Requests go from the service worker straight to
the selected provider — `https://api.deepseek.com`, `https://api.moonshot.ai`,
`https://dashscope-intl.aliyuncs.com`, `https://api.z.ai`, or `https://api.minimax.io` — and each key is
stored in `chrome.storage.local`, never shown again after saving, and never reaches the page.

## Wiki for Obsidian

The **Wiki for Obsidian** row in Study opens a small window connected to the page you were on. It
shows one step at a time: compile, review, then save. **Compile** sends that page's passages, the
questions you asked about it, the memory, and the titles, aliases, summaries, and short excerpts of
pages already compiled for that source to the selected model once, and turns the reply into a small wiki: an immutable source
page with numbered passages, two to five concept pages whose claims carry passage-level citations, a
context page explaining why the pages were phrased for you, an index, and a detailed edit-history
log. Everything that decides what lands on disk is computed locally — link targets are checked
against the compiled pages, unknown links are unwrapped to their label, and citations to passages
that do not exist are dropped.

Review the drafted pages, then choose an Obsidian vault folder once. Baleen remembers the handle and
writes plain Markdown under `Baleen/<page title>/` in that folder, one folder per reading session, so
two sources never overwrite each other. Recompiling a page continues its revision numbers and reads
that folder's `index.md`: pages it lists stay part of the wiki, new pages can link to them, and the
index simply lists them with everything else — their files are not rewritten for this. A draft that
covers the same idea as a listed page, even under a differently worded title, extends that page
instead of becoming a duplicate: the existing text and citations stay, the new reading is appended
as its own cited section, and a later compile of the same article replaces only that section. A file
you wrote yourself, or marked `review: reviewed`, is never overwritten or removed. Saving never
deletes anything: a generated page that fell out of the index is adopted back into it, and any other earlier
file stays in the folder and is reported as left in place, so you can review it in Obsidian. The
`log.md` records each compile as an edit history: the topic, source revision and hash, pages added or
updated with their revisions, pages merged into earlier ones, pages kept, files left alone, and files
left in place. When the chosen folder is a
vault root, the page offers an `obsidian://` link to open the index. No Obsidian plugin, server, or
extra key is involved, and the vault is never uploaded.

## Memory and page search

She never sends a whole page just to answer a chat message. On a web page the content script walks
the semantic blocks in the main region (on a PDF, the text extracted page by page), splits them into
passage-sized pieces, and scores them against the question with a small local lexical ranker. Text
rendered as bare divs is still indexed: when the semantic blocks cover less than about half of the
region, the rest is added paragraph by paragraph. Only the best passages and their neighbors travel
— about 3,500 characters — and a vague question gets an evenly spread sample instead. The reading
chat adds focus: your current selection if you have one, otherwise the section nearest the middle of
the screen, so "what are these exercises?" finds what you are actually looking at. Section chat
stays narrower still: it sends the selected section.

**Memory**, opened from the Connection row, is Baleen's memory of you: one key-value store in
`chrome.storage.local` shared by every tab. The row shows only its count; the page lists five
entries per page with **Prev** and **Next**. She writes an entry when you ask her to
remember something — "remember that I prefer short examples" — and when what you say in a chat
reveals a durable preference, interest, goal, or personal fact; she never records page text. Add a
key yourself such as `tone` with a value such as `Prefers short, concrete answers` (a value may hold
a short paragraph), edit it, or delete it; keys are matched case-insensitively, so saving the same
key updates it. Memory travels with section and reading chats as reference, newest first, up to
about 3,000 characters. A section chat reads and writes the same list but still sends only its
selected section, while her reading chat answers in one short sentence. Each API key sits in the
same local storage and is sent only to its provider — `https://api.deepseek.com`,
`https://api.moonshot.ai`, `https://dashscope-intl.aliyuncs.com`, `https://api.z.ai`, or
`https://api.minimax.io` — when you ask.

## PDF reader

A top-level PDF response is redirected into `viewer.html`, which renders it with pdf.js. Pages draw
lazily as you scroll, the text layer is selectable, and the companion and section chat windows work
exactly as on a web page: a selection becomes the section, and each window stays anchored to its
selection through zoom. The popup's Keywords or Summarize use the text extracted from the whole
document and open the answer as a chat on the current page, and the reading chat searches the
per-page text. **Download** saves the original file, and
**Open original** hands the URL back to Chrome's built-in viewer once. Attachments
(`Content-Disposition: attachment`) still download normally. Chrome's native PDF viewer cannot host
content scripts, so she does not mount there.

The PDF itself is fetched directly from the site by the extension, with the site's cookies, and is
never uploaded anywhere. Pages and text layers are rendered in the tab. Only the model request you
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
  the five provider hosts, CSP.
- `src/viewer/` — bundled pdf.js reader: lazy page rendering, selectable text layer, whole-document
  text extraction for Study, download and open-original escape hatches.
- `src/popup/` — the compact Appearance and Connection panel, Study, and the Memory page.
- `src/background.ts` — serialized preference writes, the show/hide shortcut, tab re-injection, and
  the model requests.
- `src/shared/chat.ts` — provider client (DeepSeek, Kimi, Qwen, GLM, and MiniMax), request bodies,
  and prompts.
- `src/shared/key.ts` — per-provider key validation and local storage.
- `src/shared/help.ts` — the trusted built-in reference about Baleen, attached only to messages that
  ask about the extension.
- `src/shared/notes.ts` — Baleen's memory of the reader, kept as editable key-value pairs.
- `src/content/` — companion card, the anchored section chat windows, and the reading chat.
- `src/content/retrieve.ts` — the local passage ranker that keeps whole pages out of requests.
- `src/wiki/` — the wiki tab and the vault writer (folder picker, revisions, ownership checks).
- `src/shared/wiki.ts` — deterministic wiki compiler: prompt, JSON parsing, link and citation
  validation, Markdown rendering, request building.
- `src/shared/` — character metadata, settings sanitization, and message types.
- `public/characters/` — her bundled WebP renders, one per drawing.
- `public/pdf/` — pdf.js worker, CMaps, fonts, WASM decoders, and ICC profiles.
- `public/icons/` — toolbar icons, rasterized from `baleen.svg`.
- `art-src/baleen/` — the supplied cut-outs behind the shipped renders.

## Artwork

The character renders are derivative fan art, not original work for this project.

- Character: DeepSeek 娘化 ("AI娘化") by [ZipZipPipe](https://www.pixiv.net/en/artworks/148186519)
  (Pixiv, 2026-08-09). The artist's terms: credit the author, no commercial use.
- Kimi costumes: the moonlit flute dress and the pumpkin cat are also renders by ZipZipPipe. Kimi is
  a Moonshot AI character; they are used here as non-commercial fan art and imply no affiliation
  with or endorsement by Moonshot.
- Flash costume: the broom witch is also a ZipZipPipe render.
- Pro costume: the moon-staff witch gown is a ZipZipPipe render.
- All ten drawings are by ZipZipPipe: the maid, the moon-staff and broom witches, the moonlit and
  pumpkin Kimi costumes, and the Qwen, GLM, and MiniMax sheets (the Fan gown, the gothic Cat, the
  Ghost poncho, and the Reporter). Qwen is Alibaba's, GLM is Zhipu's (Z.AI), and MiniMax is
  MiniMax's; all are used as non-commercial fan art and imply no affiliation with or endorsement by
  those companies.
- Kept source, not bundled: the wisteria-swing drawing by 阮米糕 (Pixiv and X under that name;
  credit the source when reposting, no commercial use) stays under `art-src/baleen/raw/` as a
  supplied master for a future look, but no build ships it.
- Original design: the whale-girl OC 溟月 by [上善](https://www.pixiv.net/en/users/62155430),
  reused under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
- This build keeps every condition: the credit is shown in the popup footer and attributed here,
  it is non-commercial, and any redistribution of the art stays under the same share-alike license.

Processing: the supplied drawings are matted off their backgrounds — the maid cut-out's flat-white
band and hair-loop pockets, and the Flash, moonlit, pumpkin, Fan, and Reporter drawings'
off-white pages, are removed while the shaded white of the aprons, notebook, ruffles, gowns, coat,
and socks is kept. The GLM Cat's page was matted with Leonardo's background remover (the remove.bg
engine) because its ground shadow survived the local key. The broom witch and the Ghost poncho
arrived already transparent, so both were trimmed and resized directly. Every render is then
trimmed and normalised to one solid-alpha height.
The toolbar icon is a separate whale-tail mark, not derived from the character art. The art process
is in `art-src/baleen/WORKFLOW.md`. See `LICENSE`.
