# Case Canvas — Kannada OCR and in-place translation (Lens layer)

Adds mixed Kannada/English OCR and a Google-Lens-style translation overlay, ported from the
`lens-pdf` project (same author, same Google APIs). Contract between `prototype/index.html`
(renderer) and `desktop/` (Electron shell).

## 1. Decisions

| Concern | Decision |
|---|---|
| OCR engine | Two engines, chosen in Settings: **Local** (Tesseract.js, runs offline; languages `eng`, `kan` or `kan+eng`) and **Google Cloud Vision** (`DOCUMENT_TEXT_DETECTION`, far better on Kannada scans; needs an API key). Default: Local. |
| Translation | **Google Cloud Translation v2** only (`source` optional, `target` default `en`). There is no reliable offline Kannada→English translator that fits in a browser, so translation is always a cloud call and is clearly labelled as such. |
| Key storage | Desktop: encrypted with Electron `safeStorage` through `desktop.setSecret/getSecret`. Web: `localStorage` with a visible note that it is stored in the browser. Never written into a `.lawcase`. |
| Overlay | Lens-style patches per paragraph block: background and text colour sampled from the page bitmap, font size fitted to the block, press-and-hold to peek at the original, double-click to edit, right-click → pin (show original). Toggle per document. |
| Persistence | Translations and edits are saved per document page in the case (`translations/<docId>.json`) and autosaved; re-opening a case never re-calls Google. |
| Export | "Export document as PDF" draws the translation patches too when the overlay is on for that document (rectangles + text with pdf-lib, Helvetica; non-Latin target text falls back to an image patch rendered from a canvas). |

## 2. Settings (gear icon in the top bar → dialog)

- Google Cloud API key (password field, "Test key" button that calls Translation with `q=["ಪರೀಕ್ಷೆ"]` and reports the result).
- OCR engine: Local / Google Vision.
- OCR languages (local engine): English, Kannada, Kannada + English. Vision gets `languageHints` from the same choice (`en`, `kn`).
- Translation: target language (default English), source language (Auto / Kannada / English).
- Settings are case-independent (stored in `localStorage` key `casecanvas.settings`; the key via `desktop.getSecret('googleApiKey')` on desktop).
- Changing OCR engine or languages offers "Re-OCR this document" (clears that document's OCR words and re-queues its pages).

## 3. OCR pipeline changes

- `extractPage(p)`: if the PDF text layer exists but is unreadable (>3% unmapped glyphs — many Indic PDFs), treat as scanned (port `isUnreadableText` from lens-pdf).
- Local: `Tesseract.createWorker(langs)` where `langs` ∈ `eng`, `kan`, `kan+eng`; one worker per language set, re-created when the setting changes. Keep the existing word output; also keep Tesseract's `paragraphs` boxes as the block list when available.
- Google Vision: render page at scale 2 (cap longest side at 2600 px), JPEG base64, `POST https://vision.googleapis.com/v1/images:annotate?key=…` with `features:[{type:'DOCUMENT_TEXT_DETECTION'}]` and `imageContext.languageHints`. Convert `fullTextAnnotation` to words (`{text,x,y,w,h}` normalised 0..1) and paragraphs (`{text,lineCount,x,y,w,h}`), exactly as `lens-pdf/src/main/google.ts` does. Errors (no key, quota) surface in the page's OCR tag and the status line; the page stays `queued` for retry.
- Blocks for translation: Vision paragraphs when present; otherwise port lens-pdf `groupLines` + `groupBlocks` (`layout.ts`) over the words.

## 4. Translation layer

- Per document toggle in the PDF toolbar (`文A` button) and in the Case menu; state stored per document (`translateOn`).
- When on, pages near the viewport are translated first (same priority as OCR). Per page: blocks → `POST https://translation.googleapis.com/language/translate/v2?key=…` `{ q:[...], target, format:'text', source? }` in chunks of ≤128 segments / 25k chars. Store `{ blocks: [{ text, translated, detectedLang, box, fontSize, lineCount, pinned?, machine? }], detectedLang }`. Drop blocks whose detected language equals the target or whose translation equals the source (nothing to show).
- Render a `.trans` layer per page above the text layer and below the annotation layer: one `div.block` per block, positioned by its normalised box, `background`/`color` from `sampleColors` on the page canvas (port from `fitText.ts`), font fitted by `fitFontSize` (binary search), single-line blocks vertically centred, overflowing blocks grow downwards. Pointer-down = peek (patch fades to show the original), double-click = edit (contenteditable; Enter commits, Esc cancels; keeps `machine` for restore), right-click menu: Edit / Pin (always show original) / Restore machine translation.
- Selection and lasso still work on the original text layer; when a selection falls under a patch, the patch lifts while the selection is active.
- Search covers translated text too: hits inside patches are highlighted in the patch.
- Status: "Translating 3/9 pages…", and a clear message when no API key is set ("Add a Google Cloud API key in Settings to translate").

## 5. Case file additions

```
translations/<docId>.json   { "target": "en", "pages": [ { "n": 1, "detectedLang": "kn", "blocks": [ Block ] } | null ] }
```
`case.json` documents gain `translateOn: boolean`, `ocrEngine: "local"|"vision"`, `ocrLangs: "eng"|"kan"|"kan+eng"` (what produced the stored OCR).
Autosave stores the same in IndexedDB `meta`.

## 6. Bridge additions (`window.desktop`)

```ts
getSecret(name: string): Promise<string | null>;        // decrypted with safeStorage; null if absent
setSecret(name: string, value: string | null): Promise<void>;   // null deletes
```
Stored in `<userData>/settings.json` as base64 ciphertext (`{ secrets: { googleApiKey: { v: "...", enc: true } } }`).
Implemented in `desktop/main.js` + `desktop/preload.js`.

## 7. Round 2: region translate, view toggle, export layers

### 7.1 Separate "translate" (an action) from "view" (a toggle)
- **View toggle** in the PDF toolbar: a two-state control `Original | Translated` for the active document
  (keyboard `T`). It only shows/hides the translation patches that already exist; it never calls Google.
  Per-document state `viewTranslated: boolean`, saved in the case. Patches keep hold-to-peek, edit, pin.
- **Settings → "Show translated documents as"**: `Translated` (default) or `Original`. Applied when a document
  first gets any translation (whole-document or region).
- **Translate whole document** becomes an explicit action: toolbar button `文A` → small menu
  `Translate whole document` / `Translate a region (drag)` / `Remove all translations on this page`, and the same in the Case menu.
  Running it switches the view to Translated when it finishes (unless the setting says Original).
- **Stale OCR guard**: before whole-document translation, if a page's OCR was produced with a different
  engine or language set than the current settings (`p.ocrEngine`/`p.ocrLangs` vs settings), re-OCR that page
  first (automatically, no prompt), because translating English-only OCR of a Kannada page yields nothing.
- **Visible progress**: a slim banner at the top of the PDF pane (not only the status line):
  "Translating page 2 of 9 with Google…", "Translated 9 pages · 31 blocks", or the exact Google error in red
  with a "Settings" link. Stays until the next action or dismissed.

### 7.2 Region translate tool (box select)
- New tool in the PDF toolbar: `⬚文` "Translate a region". Drag a rectangle on a page (pointer events,
  like the lasso but a rectangle; works with pen, mouse, finger). On release, if the box is at least
  2% of the page in each dimension:
  1. Crop the page render (scale 2, from `ensureRendered` or a fresh render) to the box.
  2. OCR the crop: Google Vision when a key exists (regardless of the OCR-engine setting, because the
     user asked for translation and Vision is far better on Kannada), otherwise local Tesseract with the
     current languages. Convert word/paragraph boxes back to page-normalised coordinates (offset by the box).
  3. Translate the paragraph texts (Translation v2, current source/target).
  4. Add the resulting blocks to that page's translation record with `manual: true` and `region: {x,y,w,h}`,
     merge (replace) any existing blocks whose box overlaps the region by more than 50%, switch the
     document's view to Translated (per the setting), paint, autosave.
  5. If the crop has no text, say so in the banner. Without a key and with local OCR, translation still needs
     the key: show the no-key banner but keep the region's OCR words in the page text layer.
- Region blocks show even if the document was never whole-translated. Right-click on a patch adds
  `Remove this translation`.
- Persist `manual` and `region` in `translations/<docId>.json` and autosave; survive reload and .lawcase round-trip.

### 7.3 Export dialog (which layers)
- "Export document as PDF" opens a small modal before writing:
  - Pages: `All` / `Current page` / range input (`1-3,7`).
  - Layers (checkboxes): `Searchable text layer (OCR)` (on), `Mark-up: pen, highlights, sticky notes` (on when any exist),
    `Translation overlays` (on when the document is currently viewed as Translated, enabled only when translations exist).
  - Buttons: Export / Cancel. Remember the last choices for the session.
- Exporting with only the original and text layer produces the plain searchable PDF as before.

### 7.4 Test hooks
`window.caseApp.translateRegion(docId, page, box)` (box normalised), `setViewTranslated(on, docId?)`,
`exportDocumentPdf(docId?, { pages, textLayer, markup, translation })`.

## 8. Test material

- `prototype/sample/kannada-scanned-sample.pdf` (image-only Kannada notice) and `prototype/sample/kannada-sample.pdf`
  (digital Kannada PDF with an unreadable text layer) copied from lens-pdf; add buttons "Sample: Kannada (scan)".
- Ground truth for the scanned sample's first lines: "ಗ್ರಾಮ ಪಂಚಾಯತಿ ಸೂಚನೆ", "ಎಲ್ಲಾ ಗ್ರಾಮಸ್ಥರಿಗೆ ತಿಳಿಸುವುದೇನೆಂದರೆ, ಮುಂದಿನ ಸೋಮವಾರದಿಂದ ಕುಡಿಯುವ ನೀರಿನ ಸರಬರಾಜು …".
- Without an API key the Google paths must fail gracefully; test them against a fetch stub that returns canned Vision / Translation responses.
