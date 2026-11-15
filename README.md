# Case Canvas

A reading and note-taking tool for lawyers: scanned PDFs get an automatic OCR layer, an
auto-generated nested index (Prayer, Pleadings A/B/C, (a)/(b)…), an infinite-scroll reader,
and a side-by-side workspace where lassoed regions become linked, annotatable cards.

| File | What it is |
|------|------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | The product/technical plan: stack, platform strategy (web, iPad, Android tablet, macOS, Windows), OCR pipeline, indexing rules, data model, phases, risks |
| [prototype/index.html](prototype/index.html) | A working single-file browser prototype of the whole loop (no build step) |
| [prototype/sample/scanned_petition.pdf](prototype/sample/scanned_petition.pdf) | A fabricated 9-page *image-only* writ petition used to test OCR and indexing |
| [prototype/sample/scanned_counter.pdf](prototype/sample/scanned_counter.pdf) | The State's 4-page counter to it, for cross-document linking |
| [tools/make_sample_pdf.py](tools/make_sample_pdf.py) | Regenerates both sample PDFs (needs `pip install pillow`) |
| [docs/SPEC-case-file.md](docs/SPEC-case-file.md) | The `.lawcase` file format, autosave rules, multi-workspace and master-index behaviour, and the renderer ↔ desktop bridge |
| [desktop/](desktop/README.md) | The Windows app (Electron shell around the same renderer): `npm start` to run, `npm run build:win` to build the installer and portable exe into `desktop/dist/` |

## Run the prototype

Any static server works; it needs HTTP (not `file://`) for the PDF and OCR workers.

```bash
python -m http.server 5173 --directory prototype
```

Open http://localhost:5173 and press **Sample: Petition** and **Sample: Counter**, or drop
your own scanned PDFs on the page (several at once is fine).
Nothing leaves the browser: PDF.js renders, Tesseract.js OCRs in a Web Worker.

## What the prototype does

- **Several PDFs, one workspace**: each open file gets a tab in the reader and its own
  index. The workspace on the right is shared, so clippings from different files sit on
  the same canvas and can be linked to each other. Cards are colour-coded by source
  document, and a card's badge switches to the right tab when you jump back.
  OCR runs across all open files, prioritising the one you are reading.
- **Auto OCR**: each page is checked for an existing text layer; scanned pages are OCR'd
  automatically, prioritising the pages you are looking at. The result is painted as an
  invisible, selectable text layer exactly over the scan.
- **Auto index**: headings are detected from typography (size, caps, centring) plus legal
  numbering rules (PART I, I., A., 1.1.1, (a), (i), ANNEXURE P-1) and legal vocabulary
  (PRAYER, PLEADINGS, GROUNDS, SYNOPSIS…), then nested to any depth. The sidebar scroll-spies
  as you read; clicking jumps to the heading.
- **Horizontal reading board**: pages sit side by side on a whiteboard and scroll sideways
  (mouse wheel, trackpad or the filmstrip), like a normal PDF scroll turned on its side.
  There is no vertical mode.
- **Export document as PDF** (toolbar ⬇ or *Case ▾ → Export document as PDF…*): writes the
  original pages with your pen marks, highlights and sticky notes burned in, plus an
  invisible text layer from the OCR so the exported file is searchable in any PDF reader. A **filmstrip** of page previews slides up from the bottom
  edge on hover (click its handle to pin it) and the current page is marked.
- **PDF mark-up toolbar** floating on the page pane: pen (colours, three widths),
  highlighter (free-hand, or select text and press *highlight* on the chip for clean
  line-by-line highlights), sticky notes, eraser, undo. Marks are stored per page in
  page-relative units so they survive zoom and view changes, and go into the JSON export.
- **Lasso / text select → workspace**: lasso a region (pen, finger or mouse) or select
  text, then drag it across the divider. The card carries the image crop, the OCR text,
  and a source badge ("p.4 · A. Brief facts of the case") that jumps back and flashes the
  source. A red margin marker on the page jumps forward to the card.
- **Workspace**: infinite pan/zoom canvas (wheel, ctrl-wheel, pinch), typed notes, pen ink
  with pressure, links between any two cards with editable labels, resize, delete, and a
  JSON export of the whole workspace.
- **Find**: searches the OCR layer and highlights hits.

- **Stateful.** Everything autosaves to the browser's IndexedDB within a second of a
  change and is restored on the next launch, including OCR results (no re-OCR), mark-up,
  workspaces, cards, links, ink, view mode and scroll positions.
- **Case files.** *Case ▾ → Save / Save as…* writes a single `.lawcase` file (a ZIP with the
  PDFs, OCR layers, mark-up, workspaces and clipping images). *Open…* loads one. On Windows
  the app registers the extension, so double-clicking a `.lawcase` opens it.
- **Multiple workspaces per case**, each with its own title (double-click to rename), and a
  **Master index** tab in the sidebar: every document's outline with that workspace's
  clippings listed under the headings they came from, with a filter box.

## What the prototype deliberately leaves out

Cloud OCR, user correction of the index, sync between devices, and the tablet shells
(Capacitor). Those are Phase 1–2 in
[ARCHITECTURE.md](ARCHITECTURE.md).
