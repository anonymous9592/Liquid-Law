# Round 6 — Android tablet build and touch mapping (v0.6.0)

## 1. Android shell (`mobile/`)

Capacitor 8 around the unchanged renderer (`prototype/`), Android 15+ (minSdk 35), tablets only. See
[mobile/README.md](../mobile/README.md) for building, signing and the emulator.

- `prototype/android.js` runs before the app module. Inside the Capacitor WebView it defines `window.desktop` with
  the Electron preload's shape (`isDesktop`, `openCase`, `saveCase`, `openPdfs`, `saveFile`, `setTitle`, `onMenu`,
  `onOpenFile`; no `getSecret`/`setSecret`), so the renderer needs no platform branches. On the web and in Electron
  the file does nothing.
- `CaseFilesPlugin.java` (Capacitor plugin `CaseFiles`) wraps the Storage Access Framework. A `.lawcase` keeps its
  SAF uri as `path`, with a persisted permission, so *Save* overwrites it without a dialog; *Save as…* and PDF export
  use the system "create document" dialog. `.lawcase` files opened from Files / Drive arrive through a VIEW intent
  (`getLaunchFile` at launch, the `openFile` event while running).
- **Bytes never travel on a call that opens a dialog.** Capacitor parcels the pending call into the activity's saved
  state while the dialog is up; Android kills the app past ~1 MB (`TransactionTooLargeException`, found with the
  first save). So: picked documents are copied into the app cache and fetched by the renderer through Capacitor's
  local server (`Capacitor.convertFileSrc`), then discarded; a save is `saveFile` (dialog → uri), `beginWrite` →
  temp path, `appendChunk` × n (1 MB base64 each), `commit(path, uri)`.
- Libraries are vendored under `prototype/vendor/` (pdf.js + worker, Tesseract.js + worker + WASM cores, pdf-lib,
  JSZip) for every build; only Tesseract language data is still downloaded once.
- Icons and splash: `tools/make_android_icons.py` (adaptive icon = cream starburst on terracotta).
- `backgroundThrottling: false` on the Electron window (desktop): OCR keeps its pace behind other windows.

## 2. Touch mapping (reader and workspace)

Goal: a finger or stylus behaves like it does in a pencil app on an iPad — the active tool owns it, nothing else
reacts.

| Tool | One finger / stylus | Two fingers |
|---|---|---|
| Hand | pans the board | pinch zooms, and pans |
| Text | drags a selection over the OCR words between the first and last touched word (reading order); the chip appears as with the mouse | pinch + pan |
| Lasso (free / box) | draws the lasso | pinch + pan (cancels the lasso) |
| Pen / Highlighter / Eraser | draws / erases | pinch + pan (cancels the stroke) |
| Sticky note | taps place a note | — |
| Region translate | drags the rectangle | pinch + pan |
| Workspace, Move | pans the canvas | pinch + pan |
| Workspace, Pen | inks (finger or stylus) | pinch + pan (cancels the stroke) |

How:

- `#reader` is `user-select: none` / `-webkit-touch-callout: none`; only the Text tool's text layer, sticky-note
  bodies and patches being edited are selectable. Native drag-selection only exists for the mouse, so the Text tool
  gets its own finger/stylus selection (`tsel`, `nearestWordIdx`, `touchSelRange`).
- `touch-action: none` on the reader for every tool but Hand (the rule sits after the board rule it used to lose to),
  and on the selection box, chip, lasso path, region rectangle and sticky-note handles.
- A capture-phase `pointerdown` on the reader calls `preventDefault()` for non-mouse pointers whenever a tool other
  than Hand is active and the target is a page (not an editable): no native selection, no long-press callout, no
  scroll. The reader's `contextmenu` is suppressed in the same cases.
- Two-finger gestures: the reader's pinch handler now also pans by the midpoint delta; the workspace pinch does the
  same. In workspace Pen mode a second finger cancels the stroke and starts the pinch.

Verified on the API 35 Pixel Tablet emulator by injecting touch gestures (`adb shell input swipe` / `motionevent`)
and probing the renderer over the WebView's DevTools socket: free and box lasso, text drag-select, pen stroke,
hand pan, long press (nothing selected, no menu), workspace finger ink. Pinch was not verified (the emulator's
`input` cannot inject two pointers).

## 3. Hooks

- `window.caseApp.openPdf(name, bytes)`, `pageStats()`, `find()`, `closeFind()` (round 5) are used by the emulator
  checks; `window.desktop.platform === 'android'` identifies the shell.
