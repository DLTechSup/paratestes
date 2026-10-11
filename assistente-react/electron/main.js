'use strict';
const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, nativeImage, safeStorage, protocol, net, shell, dialog, session } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFile } = require('child_process');

const nucleo = require('./nucleo');
const modelo = require('./wake-model');
const { Config } = require('./config');
const { Uso } = require('./uso');

protocol.registerSchemesAsPrivileged([
  { scheme: 'modelo', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// Áudio sem clique (início automático) e sem "economia" quando a janela está na bandeja.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

const oculto = process.argv.includes('--oculto');
let win = null, tray = null, saindo = false, cfg = null, uso = null, assistente = null, admin = false, estado = 'parado';
const ICONE = path.join(__dirname, '..', 'build', 'icon.png');
const ICONE_ATIVO = path.join(__dirname, '..', 'build', 'tray-ativo.png');

const imagem = (p) => { const i = nativeImage.createFromPath(p); return i.isEmpty() ? i : i.resize({ width: 32, height: 32 }); };

function mostrar() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function esconderOuMinimizar() {
  if (cfg.get().minimizarParaBandeja) win.hide(); else win.minimize();
}

function criarJanela() {
  win = new BrowserWindow({
    width: 1020, height: 740, minWidth: 860, minHeight: 640,
    frame: false, show: false, backgroundColor: '#0a0d14', title: 'Assistente de Voz',
    icon: ICONE,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.once('ready-to-show', () => { if (!(oculto && cfg.get().iniciarMinimizado)) win.show(); });
  win.on('minimize', (e) => { if (cfg.get().minimizarParaBandeja) { e.preventDefault(); win.hide(); } });
  win.on('close', (e) => { if (!saindo && cfg.get().minimizarParaBandeja) { e.preventDefault(); win.hide(); } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

function menuTray() {
  const escutando = estado !== 'parado';
  return Menu.buildFromTemplate([
    { label: 'Mostrar janela', click: mostrar },
    { label: escutando ? 'Pausar escuta' : 'Iniciar escuta', click: () => win?.webContents.send('tray:alternar') },
    { type: 'separator' },
    { label: 'Sair', click: sair },
  ]);
}

function criarTray() {
  tray = new Tray(imagem(ICONE));
  tray.setToolTip('Assistente de Voz');
  tray.setContextMenu(menuTray());
  tray.on('click', () => (win?.isVisible() && win.isFocused() ? win.hide() : mostrar()));
}

function atualizarTray() {
  if (!tray) return;
  const nome = cfg.get().nome;
  const rotulo = { parado: 'parado', dormindo: `aguardando “${nome}”`, conectando: 'conectando…', ouvindo: 'ouvindo', falando: 'falando' }[estado] || estado;
  tray.setToolTip(`Assistente de Voz — ${rotulo}`);
  const img = imagem(estado === 'parado' ? ICONE : ICONE_ATIVO);
  if (!img.isEmpty()) tray.setImage(img);
  tray.setContextMenu(menuTray());
}

function sair() { saindo = true; app.quit(); }

function registrarAtalho() {
  globalShortcut.unregisterAll();
  const a = cfg.get().atalhoGlobal;
  if (!a) return;
  try { globalShortcut.register(a, () => win?.webContents.send('atalho:acordar')); } catch { /* atalho inválido: ignora */ }
}

function configurarInicioComWindows(ligar) {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  // App elevado não inicia por "Run": usa o Agendador de Tarefas (nível mais alto, ao entrar no Windows).
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const args = ligar
    ? ['/Create', '/TN', 'AssistenteDeVoz', '/TR', `"${exe}" --oculto`, '/SC', 'ONLOGON', '/RL', 'HIGHEST', '/F']
    : ['/Delete', '/TN', 'AssistenteDeVoz', '/F'];
  execFile('schtasks', args, { windowsHide: true }, () => {});
}

function registrarIpc() {
  const publico = () => cfg.publico();
  ipcMain.handle('cfg:get', publico);
  ipcMain.handle('cfg:set', (_e, patch) => {
    const antes = cfg.get();
    const r = cfg.set(patch);
    if (patch.pastas) assistente.setConfig(cfg.get().pastas);
    if ('atalhoGlobal' in patch) registrarAtalho();
    if ('iniciarComWindows' in patch && patch.iniciarComWindows !== antes.iniciarComWindows) configurarInicioComWindows(!!patch.iniciarComWindows);
    if ('nome' in patch) atualizarTray();
    return r;
  });
  ipcMain.handle('key:get', () => cfg.lerChave());
  ipcMain.handle('key:set', (_e, k) => { cfg.salvarChave(k); return publico(); });
  ipcMain.handle('key:clear', () => { cfg.salvarChave(''); return publico(); });
  ipcMain.handle('tools:list', () => nucleo.FERRAMENTAS);
  ipcMain.handle('tool:run', async (_e, nome, args) => {
    const texto = await nucleo.executarFerramenta(assistente, String(nome), args && typeof args === 'object' ? args : {});
    return { texto, atual: assistente.atual };
  });
  ipcMain.handle('janela:minimizar', esconderOuMinimizar);
  ipcMain.handle('janela:fechar', esconderOuMinimizar);
  ipcMain.handle('janela:sair', sair);
  ipcMain.handle('app:info', () => ({ admin, empacotado: app.isPackaged, versao: app.getVersion(), plataforma: process.platform, dados: app.getPath('userData') }));
  ipcMain.handle('dialog:pasta', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return r.canceled ? '' : r.filePaths[0];
  });
  ipcMain.handle('abrir:externo', (_e, url) => { if (/^https:\/\/aistudio\.google\.com\//.test(String(url))) shell.openExternal(url); });
  ipcMain.handle('uso:registrar', (_e, delta) => uso.registrar(delta && typeof delta === 'object' ? delta : {}));
  ipcMain.handle('uso:obter', () => uso.resumo());
  ipcMain.handle('modelo:estado', () => ({ pronto: modelo.existe(app.getPath('userData')) }));
  ipcMain.handle('modelo:garantir', async () => {
    try {
      await modelo.garantir(app.getPath('userData'), (p) => win?.webContents.send('modelo:progresso', p));
      return { ok: true };
    } catch (e) { return { ok: false, erro: e.message }; }
  });
  ipcMain.on('status', (_e, s) => { estado = String(s); atualizarTray(); });
}

const unica = app.requestSingleInstanceLock();
if (!unica) app.quit();
else {
  app.on('second-instance', mostrar);
  app.on('before-quit', () => { saindo = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => { /* continua na bandeja */ });

  app.whenReady().then(() => {
    cfg = new Config(app.getPath('userData'), safeStorage);
    uso = new Uso(app.getPath('userData'));
    assistente = new nucleo.Assistente(cfg.get().pastas);
    nucleo.setAbridor((p) => shell.openPath(p)); // '' = sucesso
    nucleo.setAbridorUrl(async (u, navegador) => {
      if (navegador) return false; // navegador específico: o núcleo cuida (PowerShell)
      try { await shell.openExternal(u); return true; } catch { return false; }
    });
    admin = nucleo.eAdministrador();

    session.defaultSession.setPermissionRequestHandler((_wc, permissao, cb) => cb(['media', 'audioCapture'].includes(permissao)));
    session.defaultSession.setPermissionCheckHandler((_wc, permissao) => ['media', 'audioCapture'].includes(permissao));
    protocol.handle('modelo', async () => {
      const f = modelo.caminhoModelo(app.getPath('userData'));
      const cors = { 'Access-Control-Allow-Origin': '*' };
      if (!fs.existsSync(f)) return new Response('modelo ausente', { status: 404, headers: cors });
      const r = await net.fetch(pathToFileURL(f).toString());
      return new Response(r.body, { status: 200, headers: { ...cors, 'Content-Type': 'application/gzip', 'Content-Length': String(fs.statSync(f).size) } });
    });

    registrarIpc();
    criarJanela();
    criarTray();
    registrarAtalho();
    // pré-aquece a lista de pastas sem travar a abertura da janela
    setTimeout(() => { try { assistente.catalogo(); } catch { /* ignora */ } }, 1500);
  });
}
