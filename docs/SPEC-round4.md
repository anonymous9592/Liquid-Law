# Case Canvas 0.4.0 — closing a document keeps it in the case

Renderer only (`prototype/index.html`, `prototype/lens.js`). Set `APP_VERSION = '0.4.0'`; desktop/package.json will be bumped by the coordinator.

## 1. Close = hide, not remove

- Closing a document tab (× on the tab, or the keyboard/menu close) **no longer removes it from the case**. It sets
  `d.closed = true`, removes its tab from the reader, unloads its page DOM and PDF.js document to free memory, but
  keeps everything in memory and in the case: PDF bytes, OCR words and blocks, manual index entries, annotations,
  translations, zoom, scroll position, and every workspace card that references it (cards stay on their boards;
  their badges still work and **reopen the document** on click).
- Persisted: `case.json` documents gain `closed: boolean` (default false); the `.lawcase` still contains the PDF and
  all per-document files for closed documents; autosave likewise. Restore recreates closed documents as closed.
- If the active document is closed, activate the next open one; if none is open, the reader shows the drop
  prompt but the case keeps its documents.

## 2. Master index shows closed documents

- The Master index lists **all** documents of the case, open and closed. Closed documents are grouped last under a
  divider "Closed documents", shown greyed with a small "closed" tag and a `Reopen` link. Their heading trees remain
  browsable (collapsed by default); clicking a heading or a clipping of a closed document reopens it first.
- Right-click on any document group header (open or closed) → menu: `Reopen` / `Close`, `Rename…` (display name only),
  `Delete from case…`.

## 3. Delete from case, with confirmation and undo

- `Delete from case…` opens an in-app confirm dialog (not `window.confirm`): "Delete *name* from this case? Its OCR,
  mark-up, translations and N clipping(s) in M workspace(s) will be removed. You can undo this until the case is
  next saved." Buttons: Delete (red) / Cancel.
- On Delete: the document and its cards (and edges touching those cards) are moved to `caseTrash` (in memory and in
  the autosave, so a crash does not lose the undo), removed from the UI, and a toast shows "Deleted *name* — Undo"
  with an Undo link (stays 15 s; also `Ctrl+Z` while the toast is visible).
- Undo restores the document (closed state as it was) and its cards/edges to their workspaces at their old positions.
- The trash is **emptied when the case is saved to a file** (Save / Save as) and when a different case is opened or
  a new case is created. Until then the Case menu shows "Undo delete (name)" entries. Autosave does not empty it.
- `.lawcase` export never includes trashed documents.

## 4. Test hooks

`window.caseApp.closeDocument(id)`, `reopenDocument(id)`, `deleteDocument(id)` (skips the dialog), `undoDelete()`,
`trash()` → `[ { id, name, cards } ]`, `state().documents[i].closed`.

## 5. Must not regress

Everything from rounds 1–3: lasso/box → workspace, sidebar drop → index entry, highlight chip, pen/sticky/eraser,
board scroll + zoom, multi-doc, master index filter, save/open case, autosave restore, Export PDF dialog, region
translate, view toggle, bilingual cards.
