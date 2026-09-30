const {
  app, BrowserWindow, Tray, Menu, ipcMain, dialog, screen, shell, nativeImage,
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Store } = require('./store.cjs');
const palette = require('./palette.cjs');
const { readDb, htmlToText } = require('./dbimport.cjs');

const DEV = !!process.env.NOTEDECK_DEV;
const ICON = path.join(__dirname, '..', 'build', 'icon.png');
const startedHidden = process.argv.includes('--hidden');

if (!app.requestSingleInstanceLock()) { app.quit(); }

let store;
let tray = null;
let managerWin = null;
const noteWins = new Map(); // id -> BrowserWindow
app.isQuitting = false;

const uid = () => crypto.randomBytes(8).toString('hex');
const now = () => Date.now();

// ---------- URLs ----------
function loadView(win, hash) {
  if (DEV) win.loadURL(`http://localhost:5173/#${hash}`);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash });
}

// ---------- utilidades de notas ----------
const summary = (n) => ({
  id: n.id, collapsed: !!n.collapsed, title: n.title || '', text: n.text || '', color: n.color, visible: !!n.visible, pinned: !!n.pinned,
  opacity: n.opacity ?? 1, createdAt: n.createdAt, updatedAt: n.updatedAt,
  deleted: !!n.deleted, w: n.w, h: n.h,
});
const COLLAPSED_H = 36;
const findNote = (id) => store.notes.find((n) => n.id === id);

function broadcast() {
  const list = store.notes.map(summary);
  if (managerWin && !managerWin.isDestroyed()) managerWin.webContents.send('notes:changed', list);
  refreshTray();
}

function newNote(opts = {}) {
  const wa = screen.getPrimaryDisplay().workArea;
  const off = (store.notes.length % 8) * 28;
  const n = {
    id: uid(), html: '<p></p>', text: '', color: opts.color || 'yellow',
    x: opts.x ?? wa.x + 80 + off, y: opts.y ?? wa.y + 80 + off,
    w: opts.w || 300, h: opts.h || 340, visible: opts.visible ?? true,
    pinned: false, opacity: 1, createdAt: now(), updatedAt: now(), deleted: false,
    ...(opts.extra || {}),
  };
  store.notes.push(n);
  store.saveSoon();
  return n;
}

// ---------- janelas de nota ----------
function onScreen(b) {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x + 60 < a.x + a.width && b.x + b.w - 60 > a.x && b.y + 20 < a.y + a.height && b.y + 30 > a.y;
  });
}

function openNoteWindow(id, { focus = false } = {}) {
  const n = findNote(id);
  if (!n || n.deleted) return;
  const existing = noteWins.get(id);
  if (existing && !existing.isDestroyed()) { existing.show(); if (focus) existing.focus(); return; }
  if (!onScreen(n)) { const wa = screen.getPrimaryDisplay().workArea; n.x = wa.x + 80; n.y = wa.y + 80; }
  const c = palette[n.color] || palette.yellow;
  const win = new BrowserWindow({
    x: Math.round(n.x), y: Math.round(n.y), width: Math.round(n.w), height: n.collapsed ? COLLAPSED_H : Math.round(n.h),
    minWidth: n.collapsed ? 140 : 180, minHeight: n.collapsed ? COLLAPSED_H : 140, maxHeight: n.collapsed ? COLLAPSED_H : undefined, frame: false, show: false, skipTaskbar: true,
    backgroundColor: c.bg, alwaysOnTop: !!n.pinned, opacity: n.opacity ?? 1, icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, spellcheck: true },
  });
  win.setMenuBarVisibility(false);
  noteWins.set(id, win);
  win.once('ready-to-show', () => { win.showInactive(); if (focus) win.focus(); });
  loadView(win, `/note/${id}`);

  let t;
  const saveBounds = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (win.isDestroyed()) return;
      const b = win.getBounds();
      Object.assign(n, { x: b.x, y: b.y, w: b.width });
      if (!n.collapsed) n.h = b.height;
      store.saveSoon();
    }, 250);
  };
  win.on('move', saveBounds);
  win.on('resize', saveBounds);
  win.on('closed', () => { noteWins.delete(id); });

  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:|^mailto:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('http://localhost:5173') && !url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
  win.webContents.on('context-menu', (_e, p) => {
    const tpl = [];
    if (p.misspelledWord && p.dictionarySuggestions.length) {
      p.dictionarySuggestions.slice(0, 5).forEach((s) => tpl.push({ label: s, click: () => win.webContents.replaceMisspelling(s) }));
      tpl.push({ type: 'separator' });
    }
    tpl.push(
      { label: 'Desfazer', role: 'undo', accelerator: 'Ctrl+Z' }, { label: 'Refazer', role: 'redo', accelerator: 'Ctrl+Y' },
      { type: 'separator' },
      { label: 'Recortar', role: 'cut', enabled: p.editFlags.canCut, accelerator: 'Ctrl+X' },
      { label: 'Copiar', role: 'copy', enabled: p.editFlags.canCopy, accelerator: 'Ctrl+C' },
      { label: 'Colar', role: 'paste', enabled: p.editFlags.canPaste, accelerator: 'Ctrl+V' },
      { label: 'Colar sem formatação', enabled: p.editFlags.canPaste, accelerator: 'Ctrl+Shift+V', click: () => win.webContents.pasteAndMatchStyle() },
      { type: 'separator' },
      { label: 'Selecionar tudo', role: 'selectAll', accelerator: 'Ctrl+A' },
    );
    Menu.buildFromTemplate(tpl).popup({ window: win });
  });
}

function closeNoteWindow(id) {
  const w = noteWins.get(id);
  if (w && !w.isDestroyed()) w.destroy();
  noteWins.delete(id);
}

function setVisible(id, v) {
  const n = findNote(id);
  if (!n) return;
  n.visible = !!v;
  store.saveSoon();
  if (v) openNoteWindow(id, { focus: true }); else closeNoteWindow(id);
  broadcast();
}

// ---------- gerenciador ----------
function openManager() {
  if (managerWin && !managerWin.isDestroyed()) {
    if (managerWin.isMinimized()) managerWin.restore();
    managerWin.show(); managerWin.focus(); return;
  }
  managerWin = new BrowserWindow({
    width: 1040, height: 700, minWidth: 780, minHeight: 520, show: false, icon: ICON,
    title: 'NoteDeck — DLTechSup', backgroundColor: '#14161b', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  managerWin.setMenuBarVisibility(false);
  managerWin.once('ready-to-show', () => managerWin.show());
  managerWin.on('close', (e) => {
    if (!app.isQuitting) { e.preventDefault(); managerWin.hide(); }
  });
  managerWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  loadView(managerWin, '/manager');
}

// ---------- bandeja ----------
function refreshTray() {
  if (!tray) return;
  const live = store.notes.filter((n) => !n.deleted);
  const items = live.slice(0, 20).map((n) => ({
    label: (n.title || (n.text || '').split('\n')[0] || 'Nota vazia').slice(0, 40),
    type: 'checkbox', checked: !!n.visible, click: () => setVisible(n.id, !n.visible),
  }));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir NoteDeck', click: openManager },
    { label: 'Nova nota', click: () => { const n = newNote(); openNoteWindow(n.id, { focus: true }); broadcast(); } },
    { type: 'separator' },
    ...(items.length ? items : [{ label: 'Nenhuma nota criada', enabled: false }]),
    { type: 'separator' },
    { label: 'Mostrar todas', click: () => setAll(true) },
    { label: 'Ocultar todas', click: () => setAll(false) },
    { type: 'separator' },
    { label: 'Sair', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.setToolTip(`NoteDeck — ${live.filter((n) => n.visible).length} de ${live.length} notas na tela`);
}

function setAll(v) {
  store.notes.filter((n) => !n.deleted).forEach((n) => {
    n.visible = v;
    if (v) openNoteWindow(n.id); else closeNoteWindow(n.id);
  });
  store.saveSoon();
  broadcast();
}

function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.on('click', openManager);
  refreshTray();
}

// ---------- backup ----------
function backupPayload() {
  return {
    app: 'NoteDeck', publisher: 'DLTechSup', format: 1, exportedAt: new Date().toISOString(),
    notes: store.notes,
  };
}
const stamp = () => { const d = new Date(); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };

function autoBackup(force = false) {
  const s = store.settings;
  if (!force && !s.autoBackup) return null;
  if (!force && now() - (s.lastAutoBackup || 0) < 24 * 3600 * 1000) return null;
  try {
    fs.mkdirSync(s.backupDir, { recursive: true });
    const file = path.join(s.backupDir, `NoteDeck-backup-${stamp()}.json`);
    fs.writeFileSync(file, JSON.stringify(backupPayload(), null, 2));
    s.lastAutoBackup = now();
    store.saveSoon();
    const olds = fs.readdirSync(s.backupDir).filter((f) => /^NoteDeck-backup-.*\.json$/.test(f)).sort();
    while (olds.length > Math.max(1, s.backupKeep)) fs.unlinkSync(path.join(s.backupDir, olds.shift()));
    return file;
  } catch (e) { console.error('Backup automático falhou', e); return null; }
}

function applyImported(list, mode) {
  if (mode === 'replace') { [...noteWins.keys()].forEach(closeNoteWindow); store.notes.length = 0; }
  let added = 0, updated = 0;
  for (const raw of list) {
    const ex = raw.id && findNote(raw.id);
    if (ex) {
      if ((raw.updatedAt || 0) > (ex.updatedAt || 0)) { Object.assign(ex, raw); updated++; }
    } else {
      store.notes.push({ ...raw, id: raw.id || uid(), deleted: !!raw.deleted }); added++;
    }
  }
  store.saveSoon();
  store.notes.filter((n) => n.visible && !n.deleted).forEach((n) => {
    const w = noteWins.get(n.id);
    if (w && !w.isDestroyed()) w.webContents.send('note:updated', n); else openNoteWindow(n.id);
  });
  broadcast();
  return { added, updated };
}

// ---------- IPC ----------
function noteFromEvent(e) {
  for (const [id, w] of noteWins) if (!w.isDestroyed() && w.webContents === e.sender) return id;
  return null;
}

function setupIpc() {
  ipcMain.handle('notes:list', () => store.notes.map(summary));
  ipcMain.handle('notes:get', (_e, id) => findNote(id));
  ipcMain.handle('notes:create', (_e, opts) => {
    const n = newNote(opts || {});
    if (n.visible) openNoteWindow(n.id, { focus: true });
    broadcast();
    return summary(n);
  });
  ipcMain.handle('notes:update', (_e, id, patch) => {
    const n = findNote(id);
    if (!n) return null;
    const allowed = ['html', 'text', 'title', 'color', 'opacity', 'pinned', 'collapsed'];
    for (const k of allowed) if (k in patch) n[k] = patch[k];
    if ('html' in patch) { n.updatedAt = now(); if (!('text' in patch)) n.text = htmlToText(n.html); }
    store.saveSoon();
    const w = noteWins.get(id);
    if (w && !w.isDestroyed()) {
      if ('pinned' in patch) w.setAlwaysOnTop(!!n.pinned);
      if ('opacity' in patch) w.setOpacity(Math.min(1, Math.max(0.3, n.opacity)));
      if ('color' in patch) w.setBackgroundColor((palette[n.color] || palette.yellow).bg);
    }
    if ('collapsed' in patch && w && !w.isDestroyed()) {
      const b = w.getBounds();
      if (n.collapsed) {
        n.h = b.height;
        w.setMinimumSize(140, COLLAPSED_H); w.setMaximumSize(10000, COLLAPSED_H);
        w.setBounds({ x: b.x, y: b.y, width: b.width, height: COLLAPSED_H });
      } else {
        w.setMaximumSize(0, 0); w.setMinimumSize(180, 140);
        w.setBounds({ x: b.x, y: b.y, width: b.width, height: Math.max(140, Math.round(n.h || 340)) });
      }
    }
    if ('title' in patch && w && !w.isDestroyed()) w.setTitle(n.title || 'Nota');
    broadcast();
    return summary(n);
  });
  ipcMain.handle('notes:setVisible', (_e, id, v) => setVisible(id, v));
  ipcMain.handle('notes:setAllVisible', (_e, v) => setAll(v));
  ipcMain.handle('notes:duplicate', (_e, id) => {
    const o = findNote(id); if (!o) return;
    const n = newNote({ color: o.color, x: (o.x || 80) + 30, y: (o.y || 80) + 30, w: o.w, h: o.h, visible: o.visible, extra: { html: o.html, text: o.text, title: o.title ? `${o.title} (cópia)` : '' } });
    if (n.visible) openNoteWindow(n.id);
    broadcast();
  });
  ipcMain.handle('notes:trash', (_e, id) => {
    const n = findNote(id); if (!n) return;
    n.deleted = true; n.visible = false; closeNoteWindow(id); store.saveSoon(); broadcast();
  });
  ipcMain.handle('notes:restore', (_e, id) => { const n = findNote(id); if (n) { n.deleted = false; store.saveSoon(); broadcast(); } });
  ipcMain.handle('notes:delete', (_e, id) => {
    closeNoteWindow(id);
    const i = store.notes.findIndex((n) => n.id === id);
    if (i >= 0) store.notes.splice(i, 1);
    store.saveSoon(); broadcast();
  });
  ipcMain.handle('notes:emptyTrash', () => {
    for (let i = store.notes.length - 1; i >= 0; i--) if (store.notes[i].deleted) store.notes.splice(i, 1);
    store.saveSoon(); broadcast();
  });
  ipcMain.handle('notes:focus', (_e, id) => openNoteWindow(id, { focus: true }));
  ipcMain.handle('notes:exportTxt', async (e, id) => {
    const n = findNote(id); if (!n) return;
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showSaveDialog(win, { defaultPath: `${(n.text || 'nota').split('\n')[0].slice(0, 30).replace(/[\\/:*?"<>|]/g, '')}.txt`, filters: [{ name: 'Texto', extensions: ['txt'] }] });
    if (!r.canceled) fs.writeFileSync(r.filePath, n.text || '', 'utf8');
  });

  // arrastar a nota (implementado à mão para permitir clique/duplo clique na barra)
  let drag = null;
  ipcMain.on('win:dragStart', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) drag = { win, b: win.getBounds(), c: screen.getCursorScreenPoint() };
  });
  ipcMain.on('win:dragMove', () => {
    if (!drag || drag.win.isDestroyed()) return;
    const c = screen.getCursorScreenPoint();
    drag.win.setBounds({ x: drag.b.x + c.x - drag.c.x, y: drag.b.y + c.y - drag.c.y, width: drag.b.width, height: drag.b.height });
  });
  ipcMain.on('win:dragEnd', () => { drag = null; });

  // janela
  ipcMain.handle('win:control', (e, action) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const id = noteFromEvent(e);
    if (!win) return;
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') (win.isMaximized() ? win.unmaximize() : win.maximize());
    else if (action === 'hide' && id) setVisible(id, false);
    else if (action === 'close') win.close();
  });
  ipcMain.handle('app:openManager', openManager);
  ipcMain.handle('app:quit', () => { app.isQuitting = true; app.quit(); });
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), dataFile: store.file, packaged: app.isPackaged, platform: process.platform }));

  // configurações
  ipcMain.handle('settings:get', () => store.settings);
  ipcMain.handle('settings:set', (_e, patch) => {
    Object.assign(store.settings, patch);
    store.saveSoon();
    if ('autostart' in patch) applyAutostart();
    if (managerWin && !managerWin.isDestroyed()) managerWin.webContents.send('settings:changed', store.settings);
    return store.settings;
  });

  // backup
  ipcMain.handle('backup:export', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showSaveDialog(win, { title: 'Exportar backup', defaultPath: `NoteDeck-backup-${stamp()}.json`, filters: [{ name: 'Backup NoteDeck', extensions: ['json'] }] });
    if (r.canceled) return { ok: false };
    fs.writeFileSync(r.filePath, JSON.stringify(backupPayload(), null, 2));
    return { ok: true, file: r.filePath, count: store.notes.length };
  });
  ipcMain.handle('backup:import', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showOpenDialog(win, { title: 'Importar backup NoteDeck', properties: ['openFile'], filters: [{ name: 'Backup NoteDeck', extensions: ['json'] }] });
    if (r.canceled) return { ok: false };
    let data;
    try { data = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); } catch { return { ok: false, error: 'Arquivo inválido.' }; }
    if (!Array.isArray(data.notes)) return { ok: false, error: 'Este arquivo não é um backup do NoteDeck.' };
    const mode = await askMode(win, data.notes.length);
    if (!mode) return { ok: false };
    autoBackup(true);
    return { ok: true, ...applyImported(data.notes, mode) };
  });
  ipcMain.handle('backup:importDb', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showOpenDialog(win, { title: 'Importar backup .db (Simple Sticky Notes)', properties: ['openFile'], filters: [{ name: 'Banco de dados', extensions: ['db', 'sqlite', 'sqlite3'] }, { name: 'Todos', extensions: ['*'] }] });
    if (r.canceled) return { ok: false };
    try {
      const { notes, schema } = await readDb(r.filePaths[0], palette);
      if (!notes.length) return { ok: false, error: 'Nenhuma nota foi encontrada neste arquivo.', schema };
      const mode = await askMode(win, notes.length, true);
      if (!mode) return { ok: false };
      autoBackup(true);
      const list = notes.map((x, i) => {
        const wa = screen.getPrimaryDisplay().workArea;
        return {
          id: uid(), html: x.html, text: htmlToText(x.html), color: x.color || 'yellow',
          x: wa.x + 60 + (i % 10) * 26, y: wa.y + 60 + (i % 10) * 26,
          w: x.w && x.w > 180 && x.w < 1200 ? x.w : 300, h: x.h && x.h > 140 && x.h < 1200 ? x.h : 340,
          visible: false, pinned: false, opacity: 1, deleted: false,
          createdAt: x.createdAt || now(), updatedAt: x.updatedAt || now(),
        };
      });
      return { ok: true, ...applyImported(list, mode), schema };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('backup:now', () => { const f = autoBackup(true); return f ? { ok: true, file: f } : { ok: false, error: 'Não foi possível gravar o backup na pasta escolhida.' }; });
  ipcMain.handle('backup:pickDir', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showOpenDialog(win, { title: 'Pasta dos backups automáticos', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled) return store.settings;
    store.settings.backupDir = r.filePaths[0]; store.saveSoon();
    return store.settings;
  });
  ipcMain.handle('backup:openDir', () => { fs.mkdirSync(store.settings.backupDir, { recursive: true }); return shell.openPath(store.settings.backupDir); });
}

async function askMode(win, count, fromDb = false) {
  const r = await dialog.showMessageBox(win, {
    type: 'question', title: 'Importar notas', cancelId: 2, defaultId: 0,
    message: `${count} nota(s) encontradas${fromDb ? ' no arquivo .db' : ' no backup'}.`,
    detail: 'Mesclar mantém as notas atuais e adiciona as novas.\nSubstituir apaga as notas atuais (um backup automático é feito antes).',
    buttons: ['Mesclar', 'Substituir tudo', 'Cancelar'],
  });
  return r.response === 0 ? 'merge' : r.response === 1 ? 'replace' : null;
}

function applyAutostart() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!store.settings.autostart, args: ['--hidden'] });
}

// ---------- ciclo de vida ----------
app.on('second-instance', () => openManager());

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.dltechsup.notedeck');
  store = new Store();
  setupIpc();
  createTray();
  applyAutostart();
  store.notes.filter((n) => n.visible && !n.deleted).forEach((n) => openNoteWindow(n.id));
  const firstRun = store.notes.length === 0;
  if (firstRun) {
    const n = newNote({ extra: { html: '<p><strong>Bem-vindo ao NoteDeck!</strong></p><p>Escolha no gerenciador quais notas ficam na tela.</p>', text: 'Bem-vindo ao NoteDeck!\nEscolha no gerenciador quais notas ficam na tela.' } });
    openNoteWindow(n.id);
  }
  if (!startedHidden || firstRun) openManager();
  broadcast();
  autoBackup();
  setInterval(() => autoBackup(), 3600 * 1000);
});

app.on('before-quit', () => { app.isQuitting = true; if (store) store.saveNow(); });
app.on('window-all-closed', (e) => { if (!app.isQuitting) e.preventDefault?.(); });
