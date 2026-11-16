// Android shell bridge. Inside the Capacitor WebView this defines window.desktop with the same shape as the Electron
// preload (docs/SPEC-case-file.md §6), so the renderer takes its "desktop" code paths: native open / save dialogs
// (Storage Access Framework) instead of <input type=file> and blob downloads. On the web and on Electron it does nothing.
// The native side is mobile/android/app/src/main/java/com/stuthilabs/casecanvas/CaseFilesPlugin.java.
//
// Bytes never ride on a call that opens a system dialog (Android would parcel them into the saved activity state and
// kill the app past ~1 MB): a picked document is staged in the app cache and fetched through Capacitor's local server;
// a save goes dialog → temp file (base64 chunks) → commit into the chosen document.
(() => {
  const cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;
  const plugin = cap.registerPlugin ? cap.registerPlugin('CaseFiles') : cap.Plugins && cap.Plugins.CaseFiles;
  if (!plugin) { console.warn('android.js: CaseFiles plugin missing'); return; }

  const CHUNK = 1 << 20;             // 1 MB of bytes per bridge message
  const b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const toU8 = bytes => bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const safeName = (n, ext) => { n = String(n || 'case').replace(/[\\/:*?"<>|]/g, '_'); return ext && !n.toLowerCase().endsWith(ext) ? n + ext : n; };
  const MIME = { pdf: 'application/pdf', json: 'application/json', lawcase: 'application/octet-stream' };

  // staged file → { name, path (SAF uri, for Save), bytes }
  async function fetchStaged(f) {
    if (!f || !f.path) return null;
    try {
      const r = await fetch(cap.convertFileSrc(f.path));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const bytes = new Uint8Array(await r.arrayBuffer());
      return { name: f.name || 'file', path: f.uri || null, bytes };
    } finally { plugin.discard({ path: f.path }).catch(() => {}); }
  }
  async function writeTo(uri, bytes) {
    const u = toU8(bytes);
    const { path } = await plugin.beginWrite();
    for (let i = 0; i < u.length; i += CHUNK) await plugin.appendChunk({ path, data: b64(u.subarray(i, i + CHUNK)) });
    if (!u.length) await plugin.appendChunk({ path, data: '' });
    const r = await plugin.commit({ path, uri });
    return r && r.uri ? { path: r.uri, name: r.name } : null;
  }

  window.desktop = {
    isDesktop: true,                 // the renderer's name for "there is a native shell"
    platform: 'android',
    async openCase() {
      const r = await plugin.openFiles({ mimes: ['application/octet-stream', 'application/zip', '*/*'], multiple: false, persist: true });
      return fetchStaged(r && r.files && r.files[0]);
    },
    async saveCase(bytes, path, suggestedName) {
      if (path) {                    // "Save" onto the document opened / saved before (persisted SAF permission)
        try { return await writeTo(path, bytes); }
        catch (err) { console.warn('writing the previous document failed, asking where to save', err); }
      }
      const r = await plugin.saveFile({ name: safeName(suggestedName, '.lawcase'), mime: MIME.lawcase, persist: true });
      if (!r || !r.uri) return null;
      return writeTo(r.uri, bytes);
    },
    async openPdfs() {
      const r = await plugin.openFiles({ mimes: ['application/pdf'], multiple: true, persist: false });
      const out = [];
      for (const f of (r && r.files) || []) { const x = await fetchStaged(f); if (x) out.push({ name: x.name, bytes: x.bytes }); }
      return out;
    },
    async saveFile(bytes, suggestedName, filter) {
      const ext = filter && filter.extensions && filter.extensions[0];
      const r = await plugin.saveFile({ name: safeName(suggestedName, ext ? '.' + ext : ''), mime: MIME[ext] || 'application/octet-stream', persist: false });
      if (!r || !r.uri) return null;
      return writeTo(r.uri, bytes);
    },
    setTitle() {},
    onMenu() {},                     // no native menu; everything is in the Case ▾ menu
    onOpenFile(cb) {                 // a .lawcase opened from Files / another app (VIEW intent), at launch or while running
      plugin.addListener('openFile', f => fetchStaged(f).then(x => { if (x) cb(x); }).catch(console.error));
      plugin.getLaunchFile().then(r => fetchStaged(r && r.file)).then(x => { if (x) cb(x); }).catch(() => {});
    }
    // no getSecret/setSecret: the renderer then keeps the Google key in localStorage, which on Android lives in the
    // app's private sandbox
  };
})();
