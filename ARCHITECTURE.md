# Case Canvas — Architecture & Build Plan

A legal reading tool: scanned PDFs become searchable, auto-indexed, infinitely scrolling
documents, and any region can be lassoed and dragged into a linked note-taking workspace.
Targets: web, iPad, Android tablet, macOS, Windows.

---

## 1. The core idea in one sentence

**One codebase (web / TypeScript) that renders a PDF as a scrollable canvas with an
invisible OCR text layer, extracts a structural index from that text, and lets the user
pull "clippings" (page + rectangle + text) into a second infinite canvas where clippings,
notes, and ink are nodes that can be connected — every node keeps a backlink to its exact
source location.**

---

## 2. Platform strategy (how we hit 5 platforms with one team)

| Target        | Shell                           | Why |
|---------------|----------------------------------|-----|
| Web           | PWA (installable)                | Zero install, works today |
| iPad          | Capacitor (WKWebView) → App Store | Native Apple Pencil pressure/tilt via PointerEvents; file picker; iCloud |
| Android tab   | Capacitor (WebView) → Play Store  | Same code, stylus via PointerEvents |
| macOS         | Tauri 2 (or Mac Catalyst of the iPad app) | Small binary, native menus, file system |
| Windows       | Tauri 2                          | Same as macOS |

Everything the lawyer touches is the same React app. Only the shell differs.
Pencil / stylus input is handled by the web PointerEvents API (`pointerType === "pen"`,
`pressure`, `tiltX/Y`), which works in Safari on iPadOS, Chrome on Android, and WebView2.

**Decision to make early:** does the firm need *offline* on iPad (court rooms with bad
signal)? If yes, OCR must run on device too (see §4). Recommended: yes, hybrid.

---

## 3. Recommended stack

| Layer | Choice | Notes |
|-------|--------|-------|
| UI | React 18 + TypeScript + Vite | Standard, hireable |
| PDF rendering | **PDF.js** (Mozilla) | Renders pages to `<canvas>`; we build our own text layer on top |
| Virtualised infinite scroll | `@tanstack/react-virtual` | Only pages near the viewport are rendered; a 2,000-page brief stays smooth |
| Workspace canvas | **tldraw** (preferred) or React Flow | tldraw gives infinite canvas, pen ink, text, arrows, selection, undo/redo, multi-touch out of the box. We add custom shapes: `ClippingShape`, `NoteShape` |
| OCR (device) | **Tesseract.js** (WASM) | Runs in a Web Worker; fine for English legal typeset text; slow on 500-page files |
| OCR (cloud, optional) | Google Document AI / Azure Document Intelligence / AWS Textract | 10–50× faster, far better on poor scans and tables; returns word boxes + reading order. Use when online; fall back to Tesseract offline |
| Index extraction | Rule engine + optional LLM pass | See §5 |
| Local storage | IndexedDB via Dexie (web) / SQLite via Capacitor & Tauri plugins | Documents, OCR layers, workspaces cached on device |
| Sync (phase 2) | Supabase (Postgres + Storage + Auth) or Firebase | Multi-device; row-level security per matter |
| Search | MiniSearch / FlexSearch in-browser; Postgres FTS on server | "Find every mention of 'Section 138'" across a matter |
| Export | pdf-lib | Write the OCR text back into the PDF as a real invisible text layer so the file is searchable in any viewer |

---

## 4. OCR pipeline

```
PDF uploaded
  └─► PDF.js: does page N already have text? ──yes──► use it (born-digital PDF)
            │ no (scanned image)
            ▼
     Render page @ 300 DPI to bitmap
            ▼
     OCR worker pool (Tesseract.js, 2–4 workers)      ──or──► Cloud OCR API
            ▼
     Words with bounding boxes + confidence
            ▼
     Store: ocr_layers(doc_id, page, words[] {text, x, y, w, h, conf})
            ▼
     Text layer DOM: absolutely-positioned transparent <span>s over the page image
     (exactly what PDF.js does for digital PDFs — "hidden text on top of the original")
```

- OCR starts automatically on upload, page by page, **in reading order from page 1**, so the
  lawyer can start reading immediately while later pages finish in the background.
- Progress indicator per page in the thumbnail rail.
- Pages the user scrolls to get bumped to the front of the OCR queue.
- Language packs: `eng` by default; add `hin`, `kan`, etc. as needed (Tesseract supports ~100).
- Legal scans often have stamps, punch holes, skew. Pre-processing (deskew, binarise, despeckle)
  improves Tesseract a lot; cloud APIs handle it internally.

---

## 5. Auto-indexing (Prayer, Pleadings A/B/C, nested to any depth)

Headings are detected from the OCR words using layout + text rules, then nested into a tree.

**Signals used, per text line:**

1. **Typography** — line height noticeably larger than body median; ALL CAPS; centred on page;
   bold (from OCR font attributes when available); preceded/followed by extra vertical whitespace.
2. **Numbering pattern** — a configurable list of regexes, each mapped to a *level class*:
   - `^(PART|CHAPTER|VOLUME)\s+[IVXLC]+` → level 1
   - `^[IVXLC]+\.\s` (Roman) → level 2
   - `^[A-Z]\.\s` (A., B., C.) → level 3
   - `^\d+\.\s` / `^\d+\.\d+(\.\d+)*` (1., 1.1, 1.1.1) → depth = number of dot-segments
   - `^\([a-z]\)` / `^\([ivx]+\)` → deeper levels
   - `^(Annexure|Exhibit|Schedule)\s+[A-Z0-9-]+` → level 2, tagged `annexure`
3. **Legal vocabulary dictionary** — `PRAYER`, `PLEADINGS`, `SYNOPSIS`, `LIST OF DATES`,
   `GROUNDS`, `VERIFICATION`, `AFFIDAVIT`, `MEMO OF PARTIES`, `WRITTEN STATEMENT`,
   `INDEX`, `INTERIM RELIEF` … These become level-1 anchors even without numbering.
4. **The document's own index page** — if page 1–3 looks like a table of contents
   (lines ending in page numbers), parse it and use it as the *primary* index; the heuristics
   then only fill in sub-headings.

**Tree construction:** a stack-based outline builder. Each heading has a `levelClass`
(from the matched rule) and we push/pop a stack so that `A.` under `II.` under `PART I`
becomes a 3-deep node. Depth is unbounded.

**Optional LLM pass (phase 2):** send the detected heading candidates (not the whole doc)
to a model to fix mis-levelled nodes and give clean titles. Cheap and accurate.

**Output:** `index_nodes(doc_id, id, parent_id, title, page, y, level, kind)`.
The sidebar renders this tree; clicking scrolls the canvas to `(page, y)`; the current
heading is highlighted as the user scrolls (scroll-spy). The user can drag to re-order
or fix a heading by hand; corrections are stored and win over auto-detection.

---

## 6. The reading canvas (left pane)

- Vertical infinite scroll of all pages, virtualised; pinch-zoom (iPad) / ctrl-wheel (desktop).
- Layers per page, bottom to top: `<canvas>` (page bitmap) → text layer (transparent spans) →
  highlights/annotations SVG → selection overlay.
- Tools: **Hand / Text-select / Lasso / Highlight / Pen**.
- **Lasso**: freehand polygon drawn with pen or finger. On release, we compute which OCR
  word boxes fall inside the polygon → selection = { page, bbox (union), words[], text }.
  A "Send to workspace →" chip appears; the selection is also draggable.
- Dragging across the split divider drops a `Clipping` onto the workspace at the drop point.
  The clipping carries: the cropped page image at the bbox, the OCR text, and a `SourceRef`.

## 7. The workspace (right pane)

Infinite canvas (tldraw). Node types:

| Node | Content | Notes |
|------|---------|-------|
| **Clipping** | Image crop + extracted text + source badge ("p. 14, ¶ B.2") | Click badge → left pane scrolls to source and flashes it. Resizable, text copyable |
| **Note** | Rich text (typing) | Markdown-ish, checklists |
| **Ink** | Pen strokes | Pressure-sensitive; can be grouped with a clipping |
| **Connector** | Arrow between any two nodes, optional label ("contradicts", "supports", "see also") | Stored as edges |
| **Group / Frame** | Visual container ("Issue 1: Limitation") | |

- A workspace belongs to a *matter*, not a single file: several PDFs (petition, counter,
  rejoinder, annexures) are open as tabs in the reader, every clipping carries a
  `SourceRef` that names its document, and cards from different documents link freely.
  Cards are colour-coded per source document; a back-link switches the reader tab.
  (Proven in the Phase 0 prototype.)
- Split view is resizable; on iPad the workspace can also be a full-screen tab; on phones (not a target) it collapses.
- Everything is **bi-directional**: the left pane shows a small margin marker where clippings
  were taken from; tapping it jumps to the clipping in the workspace.

## 8. Data model (simplified)

```
Matter          id, title
Document        id, matter_id, title, file_hash, page_count, ocr_status
OcrPage         doc_id, page, width, height, words[] (text, bbox, conf)
IndexNode       id, doc_id, parent_id, order, title, page, y, level, kind, user_edited
Workspace       id, matter_id, title
WsNode          id, workspace_id, type (clipping|note|ink|frame), x, y, w, h, props(json)
SourceRef       ws_node_id, doc_id, page, bbox, index_node_id, text_snapshot
WsEdge          id, workspace_id, from_node, to_node, label
```

## 9. Phased delivery

**Phase 0 — Prototype (this folder, `prototype/`)** — proves the loop end to end in a browser.
**Phase 1 — MVP (6–8 weeks, 2 devs)**
- Vite + React + TS app; PDF.js virtualised viewer; Tesseract.js worker pool; rule-based indexer;
  lasso → clipping; tldraw workspace with Clipping/Note/Ink/Connector; IndexedDB persistence;
  PWA. Ship on web + iPad (Capacitor).
**Phase 2 (4–6 weeks)** — Cloud OCR option, multi-document matters, Supabase sync, full-text
search, export workspace to PDF/DOCX, Tauri desktop builds, Android.
**Phase 3** — LLM-assisted indexing and summaries, citation detection (links "Section 138 NI Act"
to the bare act), team sharing, audit trail.

## 10. Risks & mitigations

- **OCR speed on device** for 500+ page files → prioritised queue + cloud OCR when online.
- **Bad scans** (skew, stamps) → pre-processing; show confidence; let user re-OCR a page.
- **Heading detection accuracy** varies by court/format → make rules editable per firm; user
  corrections persist; LLM pass in phase 2.
- **iPad memory** with huge PDFs → virtualisation; downsample page bitmaps outside the viewport.
- **Pencil latency** → use tldraw's ink (already tuned) rather than hand-rolled canvas drawing.
