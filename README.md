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
- **Infinite-scroll canvas**: all pages in one vertical scroll, virtualised.
- **Lasso / text select → workspace**: lasso a region (pen, finger or mouse) or select
  text, then drag it across the divider. The card carries the image crop, the OCR text,
  and a source badge ("p.4 · A. Brief facts of the case") that jumps back and flashes the
  source. A red margin marker on the page jumps forward to the card.
- **Workspace**: infinite pan/zoom canvas (wheel, ctrl-wheel, pinch), typed notes, pen ink
  with pressure, links between any two cards with editable labels, resize, delete, and a
  JSON export of the whole workspace.
- **Find**: searches the OCR layer and highlights hits.

## What the prototype deliberately leaves out

Persistence across reloads, cloud OCR, user correction of the index, and the native
shells (Capacitor / Tauri). Those are Phase 1–2 in
[ARCHITECTURE.md](ARCHITECTURE.md).
