'use strict';
// "Teste de fumaça" do processo principal: roda electron/main.js com um Electron de mentira e chama os handlers de IPC.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

test('main.js inicia e responde aos comandos do app', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ud-'));
  const handlers = {}, ons = {}, enviados = [], chamadas = [];
  const noop = () => {};
  let janela = null, tray = null;
  class BW {
    constructor(o) { janela = this; this.opts = o; this.webContents = { send: (...a) => enviados.push(a), setWindowOpenHandler: noop, on: noop };
      this.eventos = {}; }
    removeMenu() {} loadFile(f) { this.arquivo = f; } once(e, fn) { this.eventos[e] = fn; } on(e, fn) { this.eventos[e] = fn; }
    show() { chamadas.push('show'); } hide() { chamadas.push('hide'); } isVisible() { return true; } isFocused() { return false; }
    isMinimized() { return false; } restore() {} focus() {} minimize() { chamadas.push('minimize'); }
  }
  class Tray { constructor() { tray = this; this.tip = ''; } setToolTip(t) { this.tip = t; } setContextMenu() {} setImage() {} on() {} }
  const eletron = {
    app: { commandLine: { appendSwitch: noop }, requestSingleInstanceLock: () => true, on: noop, quit: () => chamadas.push('quit'),
      whenReady: () => Promise.resolve(), getPath: () => userData, isPackaged: false, getVersion: () => '2.0.0' },
    BrowserWindow: BW, Tray, Menu: { buildFromTemplate: (t) => t },
    ipcMain: { handle: (c, fn) => { handlers[c] = fn; }, on: (c, fn) => { ons[c] = fn; } },
    globalShortcut: { register: (a, fn) => { chamadas.push('atalho:' + a); }, unregisterAll: noop },
    nativeImage: { createFromPath: () => ({ isEmpty: () => true, resize() { return this; } }) },
    safeStorage: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from('X' + s), decryptString: (b) => b.toString().slice(1) },
    protocol: { registerSchemesAsPrivileged: noop, handle: (esq, fn) => { handlers['protocol:' + esq] = fn; } },
    net: { fetch: async () => ({ body: null }) }, shell: { openPath: async () => '', openExternal: noop },
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ['D:\\Pasta'] }) },
    session: { defaultSession: { setPermissionRequestHandler: (fn) => { handlers.perm = fn; }, setPermissionCheckHandler: noop } },
  };
  const orig = Module._load;
  Module._load = function (req, ...r) { return req === 'electron' ? eletron : orig.call(this, req, ...r); };
  try { require('../electron/main.js'); await new Promise((r) => setTimeout(r, 30)); } finally { Module._load = orig; }

  assert.ok(janela && tray, 'janela e bandeja criadas');
  assert.equal(janela.opts.frame, false); assert.equal(janela.opts.webPreferences.contextIsolation, true);
  assert.equal(janela.opts.webPreferences.backgroundThrottling, false);
  assert.match(janela.arquivo, /dist[\\/]index\.html$/);
  assert.ok(chamadas.includes('atalho:Control+Alt+Space'));

  const c0 = await handlers['cfg:get']();
  assert.equal(c0.temChave, false); assert.equal(c0.modo, 'ativacao'); assert.ok(!('chaveEnc' in c0));
  const c1 = await handlers['cfg:set']({}, { nome: 'Luna', modo: 'direto', pastas: { atalhos: { 'lançamentos': userData } } });
  assert.equal(c1.nome, 'Luna'); assert.equal(c1.pastas.atalhos['lançamentos'], userData);
  await handlers['key:set']({}, 'AIzaSyEXEMPLO1234567890abcdefghijk');
  assert.equal(await handlers['key:get'](), 'AIzaSyEXEMPLO1234567890abcdefghijk');
  assert.equal((await handlers['cfg:get']()).temChave, true);
  assert.ok(!fs.readFileSync(path.join(userData, 'config.json'), 'utf8').includes('AIzaSyEXEMPLO'), 'a chave não fica em texto puro');

  const ferr = await handlers['tools:list']();
  assert.ok(ferr.length >= 9);
  const r = await handlers['tool:run']({}, 'abrir_pasta', { nome: 'lançamentos' });
  assert.match(r.texto, /Abri a pasta/); assert.equal(r.atual, userData);
  assert.match((await handlers['tool:run']({}, 'onde_estou', {})).texto, new RegExp(path.basename(userData)));
  const u1 = await handlers['uso:registrar']({}, { tokens: 120, segundos: 10, sessoes: 1 });
  assert.equal(u1.hoje.tokens, 120); assert.equal((await handlers['uso:obter']()).hoje.segundos, 10);
  assert.equal((await handlers['uso:registrar']({}, 'lixo')).hoje.tokens, 120);
  assert.equal((await handlers['modelo:estado']()).pronto, false);
  assert.equal((await handlers['dialog:pasta']()), 'D:\\Pasta');

  await handlers['janela:minimizar']();
  assert.ok(chamadas.includes('hide'), 'minimizar vai para a bandeja');
  await handlers['cfg:set']({}, { minimizarParaBandeja: false });
  await handlers['janela:fechar']();
  assert.ok(chamadas.includes('minimize'));

  ons.status({}, 'dormindo');
  assert.match(tray.tip, /aguardando “Luna”/);
  const resp = await handlers['protocol:modelo']({ url: 'modelo://vosk/pt.tar.gz' });
  assert.equal(resp.status, 404);
  let permitido; handlers.perm({}, 'media', (v) => { permitido = v; }); assert.equal(permitido, true);
  handlers.perm({}, 'geolocation', (v) => { permitido = v; }); assert.equal(permitido, false);
});
