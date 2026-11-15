# Case Canvas — persistence, case file format, multi-workspace, desktop shell

This spec is the contract between the renderer (`prototype/index.html`) and the desktop shell (`desktop/`).
Both are built in parallel; neither may change the contract without updating this file.

## 1. Goals

1. **Stateful**: nothing is lost on reload. Every change (documents opened, OCR results, headings, workspaces,
   cards, links, ink, PDF mark-up, view state, scroll positions) is autosaved locally and restored on next launch.
2. **Case file**: the whole state can be saved to and opened from a single file, `*.lawcase`, including the PDFs.
3. **Multiple workspaces** inside a case, each with its own title and its own **master index**.
4. **Windows app**: an installable desktop build that opens `.lawcase` files natively (double-click, File menu).

## 2. The `.lawcase` file

A ZIP archive (use JSZip 3.10.x from cdnjs in the renderer). Layout:

```
manifest.json                 { "format": "lawcase", "version": 1, "app": "Case Canvas", "title", "createdAt", "updatedAt" }
case.json                     see §3
documents/<docId>.pdf         the original PDF bytes, unmodified
ocr/<docId>.json              { "pages": [ { "n": 1, "source": "ocr"|"text", "words": [ {text,x,y,w,h,conf?} ] } | null, ... ] }
annotations/<docId>.json      { "pages": [ { "n": 1, "items": [ Mark ] }, ... ] }
clips/<cardId>.png            the cropped image of a clipping card
```

`x,y,w,h` in OCR words are fractions of the page (0..1), as today. Marks (`Mark`) are stored in the page-relative
units the renderer already uses: `{ kind: "pen"|"hl"|"note", color, width, opacity, pts: [[x,y],...] | null, rect: {x,y,w,h} | null, text? }`
where x is 0..1000 across the page width and y is scaled by page aspect, exactly as drawn today.

## 3. `case.json`

```jsonc
{
  "title": "Ramesh Kumar v. State — WP 14521/2024",
  "createdAt": "ISO", "updatedAt": "ISO",
  "readerView": "vertical" | "board",
  "activeDocumentId": 1,
  "activeWorkspaceId": 1,
  "documents": [
    { "id": 1, "name": "scanned_petition.pdf", "hue": 18, "pageCount": 9,
      "pages": [ { "n": 1, "w": 595.2, "h": 841.9 } ],          // PDF points, for layout before the PDF is parsed
      "scrollTop": 0, "scrollLeft": 0 }
  ],
  "workspaces": [
    { "id": 1, "title": "Limitation argument", "createdAt": "ISO",
      "view": { "x": 40, "y": 40, "z": 1 },
      "cards": [ { "id": 3, "type": "clipping"|"note", "x": 0, "y": 0, "w": 320, "text": "...", "note": "...",
                   "source": { "docId": 1, "page": 4, "bbox": {x,y,w,h}, "heading": "A. Brief facts of the case" } | null } ],
      "edges": [ { "id": 9, "from": 3, "to": 4, "label": "contradicts" } ],
      "strokes": [ { "pts": [[x,y],...], "width": 2.2 } ] }
  ]
}
```

Ids are integers unique within the case. `nextId` counters are derived on load (max + 1).

## 4. Renderer behaviour (prototype/index.html)

### Autosave (web and desktop)
- IndexedDB database `casecanvas`, object stores: `meta` (key `current` → the `case.json` object plus the OCR and
  annotation payloads inline), `pdfs` (docId → ArrayBuffer), `clips` (cardId → Blob).
- Any state change schedules a save, debounced 800 ms. OCR completion of a page also schedules a save.
- On startup: if `meta.current` exists, restore it silently (documents re-open from `pdfs`, OCR layers come from the
  saved words so **no re-OCR** happens for pages that were already done; pages never OCR'd resume in the queue).
- Show a small save indicator in the top bar: "Saved", "Saving…", or "Unsaved changes" when a file path is known
  and the autosave is newer than the last file save.

### Case menu (top bar, left of the title)
- **New case** (confirm if there are unsaved changes), **Open…** (`.lawcase`), **Save**, **Save as…**.
- Editable case title (click to edit) shown in the top bar and in the window title.
- Web fallback: Open = `<input type=file accept=".lawcase">`; Save = download the ZIP; Save keeps the last file name.
- Desktop: use `window.desktop` (§6) when present. `Save` with a known path writes without a dialog.

### Multiple workspaces
- The right pane gets a workspace tab strip: tabs with titles, a **+** tab, double-click (or an edit icon) to rename,
  × to delete (confirm; a case always keeps at least one workspace).
- Each workspace has its own cards, edges, strokes and view transform. Switching tabs swaps them in place.
  Documents are case-level and shared by all workspaces.
- Clipping cards, margin markers and back-links keep working across workspaces: a page's margin markers show only
  the active workspace's clippings.

### Master index (per workspace)
- The left sidebar gets two tabs: **Document** (the active document's outline, as today) and **Master index**.
- The master index for the active workspace lists every document in the case, grouped by document (collapsible,
  colour dot per document), each with its heading tree. Under each heading, show the active workspace's clippings
  taken from that heading as small entries (first ~50 chars of text). Headings with clippings show a count badge.
- Clicking a heading jumps the reader to it (switching document tabs as needed). Clicking a clipping entry pans the
  workspace to that card and selects it.
- A filter box at the top filters headings and clipping text.

### Everything else already in the prototype must keep working
Lasso/text selection → drag to workspace, cross-document links, board view, filmstrip, pen/highlighter/sticky/eraser/undo,
search, OCR prioritisation. Do not regress them.

## 5. Desktop shell (desktop/) — Electron

- `desktop/package.json`, `desktop/main.js`, `desktop/preload.js`, `desktop/build/` (icon).
- Serves the renderer from the shared `prototype/` folder through a custom privileged scheme `app://` (so relative
  `fetch` of `sample/*.pdf` and ES-module imports work; do **not** disable web security). The CDN scripts
  (pdf.js, tesseract.js, jszip) may load from the network; that is acceptable for this phase.
- Native application menu: File → New Case, Open Case…, Save, Save As…, Open PDF(s)…, Quit; View → Reload, Toggle DevTools, Zoom.
- Opening a `.lawcase` by double-click / "Open with" (argv on first launch, `second-instance` and `open-file` later) sends
  the file to the renderer via `onOpenFile`.
- `electron-builder` config: `appId com.casecanvas.app`, product name "Case Canvas", Windows targets `nsis` and
  `portable`, `fileAssociations` for `.lawcase` (description "Case Canvas case"), `win.signAndEditExecutable: false`
  (avoids the winCodeSign download that fails without admin symlink rights). Output in `desktop/dist/`.
- npm scripts: `start` (electron .), `build:win` (electron-builder --win).

## 6. The bridge: `window.desktop`

Exposed by `preload.js` via `contextBridge`. Absent in the browser; the renderer must feature-detect it.

```ts
interface Desktop {
  isDesktop: true;
  version: string;                                            // app version
  openCase(): Promise<{ path: string; name: string; bytes: Uint8Array } | null>;        // native Open dialog (*.lawcase)
  saveCase(bytes: Uint8Array, path: string | null, suggestedName: string)
        : Promise<{ path: string; name: string } | null>;    // path null → Save As dialog; returns null if cancelled
  openPdfs(): Promise<Array<{ name: string; bytes: Uint8Array }>>;                       // native multi-select (*.pdf)
  saveFile(bytes: Uint8Array, suggestedName: string, filter: { name: string; extensions: string[] })
        : Promise<{ path: string; name: string } | null>;    // generic Save dialog, used by "Export document as PDF"
  setTitle(title: string): void;                              // window title
  onMenu(cb: (action: 'new' | 'open' | 'save' | 'saveAs' | 'openPdf') => void): void;
  onOpenFile(cb: (file: { path: string; name: string; bytes: Uint8Array }) => void): void;  // double-clicked .lawcase
}
```

Bytes cross the bridge as `Uint8Array` (structured clone). The renderer calls `window.desktop.setTitle` whenever the
case title or dirty state changes (`"Title — Case Canvas"`, with a leading `• ` when unsaved).
