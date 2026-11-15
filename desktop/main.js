'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const isDev = !app.isPackaged;
const ROOT = isDev
  ? path.join(__dirname, '..', 'prototype')
  : path.join(process.resourcesPath, 'prototype');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.pdf': 'application/pdf', '.png': 'image/png', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2'
};

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

let win = null;
let pendingFile = null;      // .lawcase path waiting for the renderer
let rendererReady = false;

function findCaseArg(argv) {
  return argv.slice(1).find(a => /\.lawcase$/i.test(a) && !a.startsWith('--')) || null;
}

async function readCase(p) {
  const buf = await fs.promises.readFile(p);
  return { path: p, name: path.basename(p), bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
}

async function sendOpenFile(p) {
  if (!win || !rendererReady) { pendingFile = p; return; }
  try { win.webContents.send('open-file', await readCase(p)); }
  catch (e) { dialog.showErrorBox('Case Canvas', 'Could not open ' + p + '\n' + e.message); }
}

function toBuffer(b) {
  if (Buffer.isBuffer(b)) return b;
  if (b instanceof ArrayBuffer) return Buffer.from(b);
  if (ArrayBuffer.isView(b)) return Buffer.from(b.buffer, b.byteOffset, b.byteLength);
  return Buffer.from(b);
}

function handleAppProtocol() {
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const rootResolved = path.resolve(ROOT);
      const full = path.resolve(rootResolved, '.' + rel);
      if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) {
        return new Response('Forbidden', { status: 403 });
      }
      const st = await fs.promises.stat(full).catch(() => null);
      if (!st || !st.isFile()) return new Response('Not found', { status: 404 });
      const res = await net.fetch(pathToFileURL(full).toString());
      const headers = new Headers(res.headers);
      headers.set('Content-Type', MIME[path.extname(full).toLowerCase()] || 'application/octet-stream');
      return new Response(res.body, { status: 200, headers });
    } catch (e) {
      console.error('[app://] error', e);
      return new Response('Server error', { status: 500 });
    }
  });
}

function send(action) { if (win) win.webContents.send('menu', action); }

function buildMenu() {
  const template = [
    { label: 'File', submenu: [
      { label: 'New Case', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
      { label: 'Open Case…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
      { type: 'separator' },
      { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
      { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('saveAs') },
      { type: 'separator' },
      { label: 'Open PDF(s)…', accelerator: 'CmdOrCtrl+Shift+O', click: () => send('openPdf') },
      { type: 'separator' },
      { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
    ] },
    { label: 'View', submenu: [
      { role: 'reload', label: 'Reload' },
      { role: 'toggleDevTools', label: 'Toggle DevTools' },
      { type: 'separator' },
      { role: 'zoomIn', label: 'Zoom In' },
      { role: 'zoomOut', label: 'Zoom Out' },
      { role: 'resetZoom', label: 'Reset Zoom' }
    ] },
    { label: 'Help', submenu: [
      { label: 'About', click: () => dialog.showMessageBox(win, {
          type: 'info', title: 'About Case Canvas', message: 'Case Canvas',
          detail: 'Version ' + app.getVersion() + '\nStuthi Labs Private Limited\nElectron ' + process.versions.electron }) }
    ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 950, minWidth: 1000, minHeight: 650,
    title: 'Case Canvas', backgroundColor: '#111111', show: false,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  win.once('ready-to-show', () => win.show());
  const wc = win.webContents;
  wc.on('did-start-loading', () => { rendererReady = false; });
  wc.on('did-finish-load', () => {
    if (isDev) console.log('[main] did-finish-load', wc.getURL());
    rendererReady = true;
    if (pendingFile) { const p = pendingFile; pendingFile = null; sendOpenFile(p); }
  });
  wc.on('did-fail-load', (_e, code, desc, url) => console.error('[main] Failed to load', url, code, desc));
  if (isDev) wc.on('console-message', (e) => {
    console.log('[renderer:' + e.level + '] ' + e.message + ' (' + e.sourceId + ':' + e.lineNumber + ')');
  });
  wc.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.on('closed', () => { win = null; rendererReady = false; });
  win.loadURL('app://index/index.html');
}

ipcMain.handle('desktop:openCase', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open Case', properties: ['openFile'],
    filters: [{ name: 'Case Canvas case', extensions: ['lawcase'] }]
  });
  if (r.canceled || !r.filePaths.length) return null;
  return readCase(r.filePaths[0]);
});

ipcMain.handle('desktop:saveCase', async (_e, bytes, p, suggestedName) => {
  let target = p;
  if (!target) {
    const name = (suggestedName || 'case.lawcase').replace(/[\\/:*?"<>|]/g, '_');
    const r = await dialog.showSaveDialog(win, {
      title: 'Save Case', defaultPath: /\.lawcase$/i.test(name) ? name : name + '.lawcase',
      filters: [{ name: 'Case Canvas case', extensions: ['lawcase'] }]
    });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
  }
  await fs.promises.writeFile(target, toBuffer(bytes));
  return { path: target, name: path.basename(target) };
});

ipcMain.handle('desktop:saveFile', async (_e, bytes, suggestedName, filter) => {
  const name = String(suggestedName || 'export').replace(/[\\/:*?"<>|]/g, '_');
  const f = filter && filter.extensions ? filter : { name: 'All files', extensions: ['*'] };
  const r = await dialog.showSaveDialog(win, { title: 'Export', defaultPath: name, filters: [f] });
  if (r.canceled || !r.filePath) return null;
  await fs.promises.writeFile(r.filePath, toBuffer(bytes));
  return { path: r.filePath, name: path.basename(r.filePath) };
});

ipcMain.handle('desktop:openPdfs', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open PDF(s)', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF documents', extensions: ['pdf'] }]
  });
  if (r.canceled) return [];
  return Promise.all(r.filePaths.map(async (p) => {
    const buf = await fs.promises.readFile(p);
    return { name: path.basename(p), bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
  }));
});

ipcMain.on('desktop:setTitle', (_e, title) => { if (win && typeof title === 'string') win.setTitle(title); });

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  pendingFile = findCaseArg(process.argv);
  app.on('second-instance', (_e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    const f = findCaseArg(argv);
    if (f) sendOpenFile(f);
  });
  app.on('open-file', (e, p) => { e.preventDefault(); sendOpenFile(p); });
  app.whenReady().then(() => {
    handleAppProtocol();
    buildMenu();
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
