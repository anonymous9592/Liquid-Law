# Round 5 — large files and find (v0.5.0)

## 1. Why big PDFs ate all the memory

Rendering was already virtualised (the bitmap of a page far from the viewport was dropped), but three things were not:

1. **pdf.js keeps every decoded page image** until `page.cleanup()` is called. The OCR pass renders *every* page
   once, so after OCR a 500-page scan held 500 decoded bitmaps (tens of MB each) inside pdf.js.
2. **The OCR text layer was painted for every page** — one `<span>` per word, hundreds of thousands of DOM nodes.
3. **Every filmstrip thumbnail was rendered at open** (one decode per page, kept forever).

## 2. The page window

`prototype/index.html`, "page window" section. A page is **live** when it is within `PAGE_WINDOW` (= 5) pages of the
page being read (`currentPageNo()`), or within the render observer's 1200 px margin. Only live pages have:

- the on-screen bitmap (the existing IntersectionObserver still decides *which* live pages are rendered),
- the selectable text layer (`paintTextLayer` returns at once for a page that is not live),
- translation patches (`paintTrans`, likewise),
- pdf.js's decoded images and operator list.

A page that leaves the window (`setLive(p, false)`) has its text layer and patches emptied, its canvas dropped and
`pdfPage.cleanup()` called (`releasePage`). The `.page` box keeps its size, so the board's geometry, scroll positions,
markers, mark-up SVGs and sticky notes are untouched. OCR words, marks and translations stay in memory as data.

The window is recomputed (`updateWindow`) on scroll (60 ms timer, not rAF, so it also runs when the window is occluded),
on tab switch, zoom, relayout, after a document opens, and the target page of a jump (`scrollToPos`) is made live at
once so find highlights are visible as it scrolls in. Pages of documents that are not the active tab are never live.

`runOcrQueue` and `thumbOf` call `releasePage` after their own renders when the page is not live, and `drawTransPatches`
(export) does the same. OCR progress autosaves with a 5 s delay (`changed(false, 5000)`) instead of 800 ms, so a long
OCR run does not serialise the whole case after every page.

Thumbnails: rendered when their slot scrolls into the strip (IntersectionObserver on `#thumbs`); at most `THUMB_CACHE`
(150) are kept, the farthest from the current page are forgotten first.

Opening reports progress every 25 pages ("Opening x.pdf… page 250 of 900").

What is still held for the whole document: the PDF bytes (once in the renderer for saving/export, once inside the pdf.js
worker), one `PDFPageProxy` per page (small), the OCR words, and the per-page DOM boxes.

## 3. Find

The top-bar input is gone. A 🔍 button sits at the right end of the bar (before ⚙); it and **Ctrl+F** open a drop-down
box under it with the query, a "n / total" counter, ↑ ↓ and ✕.

- Enter / ↓ = next match, Shift+Enter / ↑ = previous, wrapping around; Esc / ✕ close the box and clear the highlights.
- Matches are collected over every open document (active document first, reading order): OCR words, and translated
  patches on documents shown translated. They are recollected on every step, since OCR keeps finishing pages.
- Clicking elsewhere closes an *empty* box; a box with a query stays open.

## 4. Desktop

`backgroundThrottling: false` on the window: OCR, translation and autosave keep running at full speed while the window
is behind another application.

## 5. Hooks (`window.caseApp`)

- `openPdf(name, bytes)` → document id.
- `pageStats(docId?)` → `[{ n, live, rendered, spans, patches, ocr, thumb }]`.
- `find(query, dir = 1)` → `{ open, hits, at, count }`; `closeFind()`.
