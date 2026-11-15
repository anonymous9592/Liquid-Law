# Case Canvas 0.3.0 — PDF zoom, bilingual clipping cards, clearer note boxes

Renderer only (`prototype/index.html`, `prototype/lens.js`). Bump `APP_VERSION` to `0.3.0` (desktop/package.json is already 0.3.0).

## 1. Zoom in the PDF pane

- A zoom factor per document, `d.zoom` (default 1, range 0.5–3, step ×1.15), saved in the case (`case.json` documents gain `zoom`) and autosave.
- `sizePage(p)` multiplies the fitted page height by `d.zoom`: `cssH = max(300, reader.clientHeight − 170) × zoom`. Pages taller than the pane scroll vertically inside the reader (the board keeps horizontal layout; `overflow: auto` already allows both axes).
- Controls: `＋` / `−` / `⤢ fit` buttons in the floating PDF toolbar (below the export button, separated by `<hr>`), **Ctrl/⌘ + wheel** over the reader zooms around the pointer (keep the point under the cursor fixed: adjust `scrollLeft/scrollTop` after relayout), **pinch** on touch (two pointers on the reader, like the workspace's pinch), keyboard `Ctrl + =`, `Ctrl + -`, `Ctrl + 0` on the web (on desktop the native View menu already sends zoom; make the renderer ignore those keys when `window.desktop` exists — but the desktop View-menu zoom is Electron page zoom; leave it as is).
- Zoom re-paints text layers, translation patches, annotations and markers automatically because everything is page-relative; verify the lasso, selection box and flash still align after zooming.
- The filmstrip and scroll-spy keep working. Show the zoom percentage briefly in the status line ("Zoom 130%").

## 2. Clipping cards: text in a dropdown, original/translated toggle

- A clipping card keeps `text` (original OCR text) and gains `textTranslated` (string | null).
  - At creation: look up the source document's translation blocks for that page; take every block whose box overlaps the clipping's `source.bbox` by ≥ 40 % of the block's area, sorted top-to-bottom, join their `translated` text with newlines → `textTranslated`. Null if none.
  - Whenever a page's translation changes (whole-document, region, edit, remove), refresh `textTranslated` of all cards in all workspaces whose source is that page (same rule), re-render those cards, autosave.
  - Persist `textTranslated` in `case.json` cards and autosave; restore uses the stored value and refreshes from live translations when the document is open.
- Card layout:
  - Under the crop image, a compact **"Text ▾"** disclosure row (collapsed by default; remember open/closed per card in memory only). Clicking expands the extracted text block.
  - At the right end of that row, a **language toggle pill**: two segments `ಕ orig` (orange, `#D97757`-ish accent) and `EN` (green, `#2e9e5b`-ish). The active segment is filled; the other outlined. Clicking switches which text the expanded block shows (`card.showTranslated` boolean, persisted). If `textTranslated` is null, the green segment is dimmed with the title "Translate this region" and clicking it runs `translateRegion(docId, page, source.bbox)` (needs the key; show the usual banner otherwise), then the card picks up the result through the refresh rule.
  - The header badge (document · page · heading) stays as it is.
  - The master index clipping entries use whichever text the card currently shows.
  - Export JSON includes both texts.
- Default view when a clipping is created from a document currently viewed as Translated: `showTranslated = true` if `textTranslated` exists.

## 3. Note box on clipping cards

- The editable note under a clipping must read as "your note", not as extracted text: light tinted background (`#fffbe6` on light theme), a 1 px light border (`#eadfa8`), 6 px radius, 6 px inset from the card edges, a small muted label "Note" at its top-left, italic muted placeholder "Add a note…". Same treatment for the body of standalone note cards (keep them visually the same family).
- The extracted-text block keeps its serif look so the two are never confused.

## 4. Lasso shape: free or rectangle

- The lasso tool gets a shape option: **Free** (current freehand polygon) or **Box** (drag a rectangle). Show the
  choice in the tool popover (`#toolPop`, like pen colours) when the lasso tool is active; remember it in Settings
  (`lassoShape: 'free' | 'box'`, default `free`). Both produce the same selection object (words inside, bbox, text).

## 5. Manual index entries, and "drop on the left = add to index"

- **Drop target on the left.** While dragging a selection (the existing ghost drag from `selBox`/`selChip`), if the
  pointer is released over the **left sidebar** (`#index`, either tab) instead of the workspace, do not create a card;
  instead add a **manual index entry**: `{ title: first line of the selection text (≤ 80 chars, or "Clipping p.N" for
  image-only selections), page, y: bbox.y, level: 2, kind: 'manual', docId }` inserted into that document's index
  in reading order. Rebuild the tree (manual entries show with a small ✎ marker and are never removed by
  `buildIndex`'s re-detection: keep them in `d.manualIndex` and merge into `d.index` after detection). They appear in
  the Document tab and in the Master index, and scroll-spy/back-links treat them like any heading. Highlight the
  sidebar with a dashed outline while a drag hovers it, and show "Add to index" in the ghost.
- **Add manually without dragging.** A `＋ heading` button at the top of the Document tab: with a selection active it
  adds an entry from the selection (same rule); with no selection it adds an entry at the current page's top with an
  editable title ("New heading"). Double-click any manual entry to rename; right-click → Delete / Promote / Demote
  (level ±1). Drag-and-drop reordering is not required.
- Persist: `case.json` documents gain `manualIndex: [{ id, title, page, y, level }]`; autosave too; .lawcase round-trip.

## 6. Test hooks

`window.caseApp.setZoom(z, docId?)`, `cardState(cardId)` → `{ text, textTranslated, showTranslated }`,
`addIndexEntry(docId, { title, page, y, level })`, `indexEntries(docId)` (merged list with `kind`).
