const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('api', {
  // notas
  listNotes: () => invoke('notes:list'),
  getNote: (id) => invoke('notes:get', id),
  createNote: (opts) => invoke('notes:create', opts),
  updateNote: (id, patch) => invoke('notes:update', id, patch),
  setVisible: (id, v) => invoke('notes:setVisible', id, v),
  setAllVisible: (v) => invoke('notes:setAllVisible', v),
  duplicateNote: (id) => invoke('notes:duplicate', id),
  trashNote: (id) => invoke('notes:trash', id),
  restoreNote: (id) => invoke('notes:restore', id),
  deleteNote: (id) => invoke('notes:delete', id),
  emptyTrash: () => invoke('notes:emptyTrash'),
  exportNoteTxt: (id) => invoke('notes:exportTxt', id),
  focusNote: (id) => invoke('notes:focus', id),
  // backup
  exportBackup: () => invoke('backup:export'),
  importBackup: () => invoke('backup:import'),
  importDb: () => invoke('backup:importDb'),
  backupNow: () => invoke('backup:now'),
  pickBackupDir: () => invoke('backup:pickDir'),
  openBackupDir: () => invoke('backup:openDir'),
  // config
  getSettings: () => invoke('settings:get'),
  setSettings: (p) => invoke('settings:set', p),
  getInfo: () => invoke('app:info'),
  // janela
  winControl: (action) => invoke('win:control', action),
  openManager: () => invoke('app:openManager'),
  quit: () => invoke('app:quit'),
  onNotesChanged: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('notes:changed', h); return () => ipcRenderer.removeListener('notes:changed', h); },
  onNoteUpdated: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('note:updated', h); return () => ipcRenderer.removeListener('note:updated', h); },
  onSettingsChanged: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on('settings:changed', h); return () => ipcRenderer.removeListener('settings:changed', h); },
});
