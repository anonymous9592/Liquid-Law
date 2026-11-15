'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const pkg = require('./package.json');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  version: pkg.version,
  openCase: () => ipcRenderer.invoke('desktop:openCase'),
  saveCase: (bytes, path, suggestedName) => ipcRenderer.invoke('desktop:saveCase', bytes, path, suggestedName),
  openPdfs: () => ipcRenderer.invoke('desktop:openPdfs'),
  // generic "save a file" (used for PDF export): filter = { name, extensions: ['pdf'] }
  saveFile: (bytes, suggestedName, filter) => ipcRenderer.invoke('desktop:saveFile', bytes, suggestedName, filter),
  setTitle: (title) => ipcRenderer.send('desktop:setTitle', String(title)),
  onMenu: (cb) => { ipcRenderer.on('menu', (_e, action) => cb(action)); },
  onOpenFile: (cb) => { ipcRenderer.on('open-file', (_e, file) => cb(file)); }
});
