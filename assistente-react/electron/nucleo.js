'use strict';
/**
 * Núcleo do assistente (Node puro, sem Electron): pastas (atalhos .lnk, subpastas, referências),
 * programas e controles do PC. A voz só chama `Assistente` através de `executarFerramenta`.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const WIN = process.platform === 'win32';

const CONFIG_PADRAO = {
  atalhos: {},            // { "lançamentos": "D:\\Trabalho\\Lançamentos" } (aceita caminho de .lnk)
  pastasDeAtalhos: [],    // pastas extras cheias de atalhos/pastas abríveis pelo nome
  raizes: [],             // onde procurar pastas pelo nome (vazio = pastas do usuário + discos)
  profundidadeRaiz: 3,
  profundidadeSubpasta: 4,
  profundidadeReferencia: 6,
  tempoMaxBuscaS: 12,
  ignorar: ['node_modules', '.git', '__pycache__', '$RECYCLE.BIN', 'System Volume Information', 'Windows',
    'Program Files', 'Program Files (x86)', 'AppData'],
};

// ───────────────────────── texto ─────────────────────────
function norm(txt) {
  return String(txt ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function distancia(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function semelhanca(a, b) {
  const mx = Math.max(a.length, b.length);
  return mx ? 1 - distancia(a, b) / mx : 1;
}

/** q e alvo já normalizados. 0 = sem relação. */
function pontuar(q, alvo) {
  if (!q || !alvo) return 0;
  if (q === alvo) return 100;
  const palavras = q.split(' ');
  if (palavras.every((p) => alvo.includes(p))) {
    return 82 - Math.min(Math.abs(alvo.length - q.length), 40) * 0.4 + (alvo.startsWith(q) ? 8 : 0);
  }
  const r = semelhanca(q, alvo);
  return r >= 0.78 ? r * 70 : 0;
}

const UN = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, meia: 6, sete: 7, oito: 8,
  nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16,
  dezessete: 17, dezoito: 18, dezenove: 19 };
const DZ = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 };
const CT = { cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600,
  setecentos: 700, oitocentos: 800, novecentos: 900 };
const SEP = { ponto: '.', virgula: ',', traco: '-', hifen: '-', barra: '/', menos: '-' };

/** 'sete cinco vinte e seis ponto vinte e cinco vinte e seis' -> '7526.2526'. Dígitos escritos passam direto. */
function falaParaNumero(texto) {
  const sem = String(texto ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const toks = sem.match(/\d+(?:[.,\-/]\d+)*|[a-z]+/g) || [];
  const saida = [];
  let i = 0;
  const unidade = (t) => t in UN && UN[t] < 10;
  while (i < toks.length) {
    const t = toks[i];
    if (/^\d/.test(t)) { saida.push(t); i++; }
    else if (t in SEP) { saida.push(SEP[t]); i++; }
    else if (t in CT || t in DZ || t in UN) {
      let v = CT[t] ?? DZ[t] ?? UN[t];
      i++;
      if (v >= 100 && toks[i] === 'e' && i + 1 < toks.length) {
        const nx = toks[i + 1];
        if (nx in DZ || (nx in UN && UN[nx] < 20)) {
          v += DZ[nx] ?? UN[nx]; i += 2;
          if (v % 100 >= 20 && v % 10 === 0 && toks[i] === 'e' && unidade(toks[i + 1])) { v += UN[toks[i + 1]]; i += 2; }
        }
      } else if (v >= 20 && v < 100 && toks[i] === 'e' && unidade(toks[i + 1])) {
        v += UN[toks[i + 1]]; i += 2;
      }
      saida.push(String(v));
    } else i++; // palavra solta ("o", "numero", "referencia")
  }
  return saida.join('');
}

const soDigitos = (t) => String(t ?? '').replace(/\D/g, '');

// ───────────────────────── sistema ─────────────────────────
const cacheLnk = new Map();

/** Argumentos do PowerShell com o script em base64 (-EncodedCommand): nenhum problema de aspas/acentos. */
function psArgs(script) {
  return ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')];
}

function powershell(script, { env = {}, timeout = 30000 } = {}) {
  return spawnSync('powershell', psArgs(script),
    { encoding: 'utf8', env: { ...process.env, ...env }, timeout, windowsHide: true });
}

/** {caminhoDoLnk: destino}. Windows: WScript.Shell via PowerShell (uma única chamada para vários atalhos). */
function resolverAtalhos(caminhos) {
  const pend = caminhos.filter((c) => !cacheLnk.has(c));
  if (pend.length && WIN) {
    const lista = path.join(os.tmpdir(), 'assistente_lnk.txt');
    fs.writeFileSync(lista, '\ufeff' + pend.join('\n'), 'utf8');
    const ps = "[Console]::OutputEncoding=[Text.Encoding]::UTF8;$s=New-Object -ComObject WScript.Shell;" +
      "Get-Content -LiteralPath $env:LNKLIST -Encoding UTF8 | ForEach-Object { try { $_ + '|' + $s.CreateShortcut($_).TargetPath } catch {} }";
    try {
      const r = powershell(ps, { env: { LNKLIST: lista } });
      for (const linha of String(r.stdout || '').split(/\r?\n/)) {
        const k = linha.lastIndexOf('|');
        if (k > 0) cacheLnk.set(linha.slice(0, k).trim(), linha.slice(k + 1).trim());
      }
    } catch { /* sem PowerShell: atalhos ficam sem destino */ }
  }
  const out = {};
  for (const c of caminhos) { if (!cacheLnk.has(c)) cacheLnk.set(c, ''); out[c] = cacheLnk.get(c); }
  return out;
}

const ehPasta = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const ehLnk = (n) => n.toLowerCase().endsWith('.lnk');
const semLnk = (n) => (ehLnk(n) ? n.slice(0, -4) : n);

function pastasDesktop() {
  const h = os.homedir();
  const cand = [path.join(h, 'Desktop'), path.join(h, 'Área de Trabalho'), path.join(h, 'OneDrive', 'Desktop'),
    path.join(h, 'OneDrive', 'Área de Trabalho'), 'C:\\Users\\Public\\Desktop'];
  for (const v of ['OneDrive', 'OneDriveCommercial', 'OneDriveConsumer']) {
    if (process.env[v]) cand.push(path.join(process.env[v], 'Desktop'), path.join(process.env[v], 'Área de Trabalho'));
  }
  if (WIN) { // como administrador o "home" pode ser outro: inclui as Áreas de Trabalho de todos os perfis
    const users = path.join(process.env.SystemDrive || 'C:', 'Users');
    try {
      for (const u of fs.readdirSync(users, { withFileTypes: true })) {
        if (u.isDirectory() && !['Public', 'Default', 'Default User', 'All Users'].includes(u.name)) {
          cand.push(path.join(users, u.name, 'Desktop'), path.join(users, u.name, 'Área de Trabalho'),
            path.join(users, u.name, 'OneDrive', 'Desktop'), path.join(users, u.name, 'OneDrive', 'Área de Trabalho'));
        }
      }
    } catch { /* ignora */ }
  }
  return [...new Set(cand)].filter(ehPasta);
}

function eAdministrador() {
  if (!WIN) return typeof process.getuid === 'function' && process.getuid() === 0;
  try { return spawnSync('net', ['session'], { windowsHide: true, timeout: 8000 }).status === 0; } catch { return false; }
}

// Abertura padrão (o Electron troca por shell.openPath via setAbridor)
let abridor = (caminho) => new Promise((resolve) => {
  try {
    const cmd = WIN ? ['cmd.exe', ['/d', '/c', 'start', '""', `"${caminho}"`]]
      : process.platform === 'darwin' ? ['open', [caminho]] : ['xdg-open', [caminho]];
    const p = spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: WIN });
    p.on('error', (e) => resolve(String(e.message)));
    p.unref();
    resolve('');
  } catch (e) { resolve(String(e.message)); }
});
const setAbridor = (fn) => { abridor = fn; };

// ───────────────────────── sites ─────────────────────────
const SITES = {
  youtube: 'https://www.youtube.com', google: 'https://www.google.com', gmail: 'https://mail.google.com', email: 'https://mail.google.com',
  drive: 'https://drive.google.com', 'google drive': 'https://drive.google.com', agenda: 'https://calendar.google.com', 'google agenda': 'https://calendar.google.com',
  maps: 'https://maps.google.com', 'google maps': 'https://maps.google.com', tradutor: 'https://translate.google.com', 'google tradutor': 'https://translate.google.com',
  whatsapp: 'https://web.whatsapp.com', 'whatsapp web': 'https://web.whatsapp.com', facebook: 'https://www.facebook.com', instagram: 'https://www.instagram.com',
  linkedin: 'https://www.linkedin.com', twitter: 'https://x.com', x: 'https://x.com', tiktok: 'https://www.tiktok.com', github: 'https://github.com',
  netflix: 'https://www.netflix.com', spotify: 'https://open.spotify.com', amazon: 'https://www.amazon.com.br', 'mercado livre': 'https://www.mercadolivre.com.br',
  mercadolivre: 'https://www.mercadolivre.com.br', outlook: 'https://outlook.live.com', g1: 'https://g1.globo.com', globo: 'https://www.globo.com', uol: 'https://www.uol.com.br',
};
const enc = encodeURIComponent;
const BUSCAS = {
  google: (q) => `https://www.google.com/search?q=${enc(q)}`,
  youtube: (q) => `https://www.youtube.com/results?search_query=${enc(q)}`,
  amazon: (q) => `https://www.amazon.com.br/s?k=${enc(q)}`,
  'mercado livre': (q) => `https://lista.mercadolivre.com.br/${enc(q).replace(/%20/g, '-')}`,
  mercadolivre: (q) => `https://lista.mercadolivre.com.br/${enc(q).replace(/%20/g, '-')}`,
  maps: (q) => `https://www.google.com/maps/search/${enc(q)}`, 'google maps': (q) => `https://www.google.com/maps/search/${enc(q)}`,
};
const NAVEGADORES = { chrome: 'chrome', 'google chrome': 'chrome', edge: 'msedge', 'microsoft edge': 'msedge', firefox: 'firefox', brave: 'brave', opera: 'opera' };

/** 'youtube' | 'youtube.com' | 'https://x.com/a' -> URL https válida; '' se não parecer um endereço. Só http/https. */
function normalizarUrl(entrada) {
  let s = String(entrada ?? '').trim().replace(/^["'`]+|["'`]+$/g, '');
  if (!s || s.length > 2000) return '';
  const n = norm(s);
  if (SITES[n]) return SITES[n];
  if (/^[a-z][a-z0-9+.-]*:(?!\/\/|\d)/i.test(s)) return ''; // javascript:, mailto:, data: ... (só aceita "host:porta" e http(s)://)
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    if (/\s/.test(s)) return '';
    if (!s.includes('.')) s = `www.${s}.com`;
    s = `https://${s}`;
  }
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.') || u.username || u.password) return '';
    return u.href;
  } catch { return ''; }
}

// Abre uma URL no navegador padrão (o Electron troca por shell.openExternal via setAbridorUrl)
let abridorUrl = (url, navegador = '') => new Promise((resolve) => {
  try {
    let cmd;
    if (WIN) {
      const ps = navegador ? 'Start-Process $env:NAV -ArgumentList $env:URL' : 'Start-Process $env:URL';
      cmd = ['powershell', psArgs(ps)];
    } else cmd = process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    const p = spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, URL: url, NAV: navegador } });
    p.on('error', () => resolve(false)); p.unref(); resolve(true);
  } catch { resolve(false); }
});
const setAbridorUrl = (fn) => { abridorUrl = fn; };

// ───────────────────────── fechar janelas / programas (Windows) ─────────────────────────
/** Caminhos das pastas abertas em janelas do Explorador de Arquivos. */
function listarJanelasPasta() {
  if (!WIN) return [];
  const ps = "[Console]::OutputEncoding=[Text.Encoding]::UTF8;$s=New-Object -ComObject Shell.Application;$r=@();" +
    "foreach($w in @($s.Windows())){ try{ if($w.FullName -like '*\\explorer.exe'){ $p=$w.Document.Folder.Self.Path; if($p -and $p -notlike '::*'){ $r+=$p } } }catch{} };" +
    "ConvertTo-Json -InputObject @($r) -Compress";
  try {
    const r = powershell(ps, { timeout: 15000 });
    const v = JSON.parse(String(r.stdout || '[]').trim() || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

/** Fecha as janelas do Explorador cujos caminhos estão na lista. Devolve quantas fechou. */
function fecharJanelasPasta(caminhos) {
  if (!WIN || !caminhos.length) return 0;
  const ps = "$alvo=@($env:ALVOS -split \"`n\");$s=New-Object -ComObject Shell.Application;$n=0;" +
    "foreach($w in @($s.Windows())){ try{ if($w.FullName -like '*\\explorer.exe'){ $p=$w.Document.Folder.Self.Path; if($alvo -contains $p){ $w.Quit(); $n++ } } }catch{} };$n";
  try {
    const r = powershell(ps, { env: { ALVOS: caminhos.join('\n') }, timeout: 15000 });
    return parseInt(String(r.stdout || '0').trim(), 10) || 0;
  } catch { return 0; }
}

const PROCESSOS_PROTEGIDOS = ['explorer', 'dwm', 'ShellExperienceHost', 'SearchHost', 'StartMenuExperienceHost', 'TextInputHost', 'Assistente de Voz', 'powershell', 'cmd'];
const PROC_POR_NOME = { chrome: 'chrome', 'google chrome': 'chrome', edge: 'msedge', excel: 'EXCEL', word: 'WINWORD', powerpoint: 'POWERPNT',
  outlook: 'OUTLOOK', 'bloco de notas': 'notepad', paint: 'mspaint', calculadora: 'CalculatorApp', firefox: 'firefox', spotify: 'Spotify', whatsapp: 'WhatsApp' };

/** Pede educadamente que o programa feche (CloseMainWindow: ele ainda pergunta se quer salvar). Devolve nomes dos processos fechados. */
function fecharProgramaPorNome(nome, procSugerido) {
  if (!WIN) return [];
  const ps = "$n=[WildcardPattern]::Escape($env:ALVO);$proc=$env:PROC;$prot=@($env:PROTEGIDOS -split ',');$feito=@();" +
    "foreach($x in @(Get-Process)){ try{ if($x.MainWindowHandle -ne 0 -and ($prot -notcontains $x.ProcessName) -and " +
    "( ($proc -and $x.ProcessName -eq $proc) -or $x.ProcessName -like \"*$n*\" -or $x.MainWindowTitle -like \"*$n*\" )){ if($x.CloseMainWindow()){ $feito+=$x.ProcessName } } }catch{} };" +
    "[Console]::OutputEncoding=[Text.Encoding]::UTF8; ConvertTo-Json -InputObject @($feito | Select-Object -Unique) -Compress";
  try {
    const r = powershell(ps, { env: { ALVO: nome, PROC: procSugerido || '', PROTEGIDOS: PROCESSOS_PROTEGIDOS.join(',') }, timeout: 20000 });
    const v = JSON.parse(String(r.stdout || '[]').trim() || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

// ───────────────────────── assistente ─────────────────────────
class Assistente {
  constructor(cfg = {}) {
    this.cfg = { ...CONFIG_PADRAO, ...cfg };
    this.atual = null;       // pasta onde "estamos" (fica memorizada entre comandos)
    this.historico = [];     // pilha para "voltar"
    this._catalogo = null;
    this._catalogoT = 0;
    this._programas = null;
    this.abertas = [];       // pastas que o assistente abriu (a mais recente por último)
    this.sys = { win: WIN, listarJanelasPasta, fecharJanelasPasta, fecharProgramaPorNome }; // trocável nos testes
  }

  setConfig(cfg) {
    this.cfg = { ...CONFIG_PADRAO, ...cfg };
    this._catalogo = null;
    this._programas = null;
  }

  _ignorar() { return new Set(this.cfg.ignorar.map((i) => i.toLowerCase())); }

  _destino(dir, ent) {
    const p = path.join(dir, ent.name);
    try {
      if (ehLnk(ent.name)) {
        const alvo = resolverAtalhos([p])[p];
        return alvo ? [alvo, ehPasta(alvo)] : [p, false];
      }
      if (ent.isSymbolicLink()) return [p, ehPasta(p)];
      return [p, ent.isDirectory()];
    } catch { return [p, false]; }
  }

  _definirAtual(c) {
    if (this.atual && this.atual !== c) this.historico.push(this.atual);
    this.atual = c;
  }

  _raizes() {
    if (this.cfg.raizes.length) return this.cfg.raizes;
    const h = os.homedir();
    let r = [];
    try { r = fs.readdirSync(h, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => path.join(h, d.name)); } catch { /* ignora */ }
    if (WIN) for (const l of 'DEFGH') if (fs.existsSync(`${l}:\\`)) r.push(`${l}:\\`);
    return r;
  }

  _varrerRaizes() {
    const ign = this._ignorar(), itens = [], limite = Date.now() + this.cfg.tempoMaxBuscaS * 1000;
    for (const raiz of this._raizes()) {
      const pilha = [[raiz, 0]];
      while (pilha.length) {
        if (Date.now() > limite) return itens;
        const [dir, prof] = pilha.pop();
        if (prof >= this.cfg.profundidadeRaiz) continue;
        let ents;
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of ents) {
          if (!e.isDirectory() || e.name.startsWith('.') || ign.has(e.name.toLowerCase())) continue;
          const p = path.join(dir, e.name);
          itens.push({ nn: norm(e.name), nome: e.name, caminho: p, prio: 1 });
          pilha.push([p, prof + 1]);
        }
      }
    }
    return itens;
  }

  _construirCatalogo() {
    const itens = [];
    for (const [nome, caminho] of Object.entries(this.cfg.atalhos || {})) {
      const real = ehLnk(caminho) ? resolverAtalhos([caminho])[caminho] : caminho;
      if (real && ehPasta(real)) itens.push({ nn: norm(nome), nome, caminho: real, prio: 3 });
    }
    for (const loc of [...pastasDesktop(), ...(this.cfg.pastasDeAtalhos || [])]) {
      let ents;
      try { ents = fs.readdirSync(loc, { withFileTypes: true }); } catch { continue; }
      resolverAtalhos(ents.filter((e) => ehLnk(e.name)).map((e) => path.join(loc, e.name)));
      for (const e of ents) {
        const [real, dir] = this._destino(loc, e);
        if (dir) itens.push({ nn: norm(semLnk(e.name)), nome: semLnk(e.name), caminho: real, prio: 2 });
      }
    }
    itens.push(...this._varrerRaizes());
    this._catalogo = itens;
    this._catalogoT = Date.now();
  }

  catalogo(forcar = false) {
    if (forcar || !this._catalogo || Date.now() - this._catalogoT > 600000) this._construirCatalogo();
    return this._catalogo;
  }

  _melhorGlobal(nome, minimo = 60) {
    const q = norm(nome);
    let melhor = null, mp = 0;
    for (const it of this.catalogo()) {
      let p = pontuar(q, it.nn);
      if (p <= 0) continue;
      p += it.prio * 4 - it.caminho.split(path.sep).length * 0.2;
      if (p > mp) { melhor = it; mp = p; }
    }
    return mp >= minimo ? melhor : null;
  }

  /** BFS ao vivo dentro de `base`. avaliar(nn, nome, ePasta)->pontuação. */
  _buscarDentro(base, avaliar, profMax, { soPastas = false, maxResultados = 50 } = {}) {
    const ign = this._ignorar(), achados = [], limiteT = Date.now() + this.cfg.tempoMaxBuscaS * 1000;
    let nivel = [base];
    const ordenar = () => achados.sort((a, b) => b.p - a.p || a.prof - b.prof).slice(0, maxResultados);
    for (let prof = 1; prof <= profMax; prof++) {
      const proximo = [];
      for (const pasta of nivel) {
        let ents;
        try { ents = fs.readdirSync(pasta, { withFileTypes: true }); } catch { continue; }
        const lnks = ents.filter((e) => ehLnk(e.name)).map((e) => path.join(pasta, e.name));
        if (lnks.length) resolverAtalhos(lnks);
        for (const e of ents) {
          if (Date.now() > limiteT) return ordenar();
          if (e.name.startsWith('.') || ign.has(e.name.toLowerCase())) continue;
          const [real, dir] = this._destino(pasta, e);
          if (soPastas && !dir) continue;
          const nome = semLnk(e.name);
          const p = avaliar(norm(nome), nome, dir);
          if (p > 0) achados.push({ p: p - (prof - 1) * 6, prof, nome, caminho: real, ePasta: dir });
          if (dir && !ehLnk(e.name)) proximo.push(real);
        }
      }
      if (achados.length && Math.max(...achados.map((a) => a.p)) >= 70 - (prof - 1) * 6) break;
      nivel = proximo;
    }
    return ordenar();
  }

  async _abrir(caminho) {
    const erro = await abridor(caminho);
    if (!erro && ehPasta(caminho)) { this.abertas = this.abertas.filter((p) => p !== caminho); this.abertas.push(caminho); }
    return !erro;
  }

  // ---------- ferramentas ----------
  async abrirPasta(nome, naRaiz = false) {
    const q = norm(nome);
    if (this.atual && !naRaiz) {
      const r = this._buscarDentro(this.atual, (nn, n, d) => (d ? pontuar(q, nn) : 0), this.cfg.profundidadeSubpasta, { soPastas: true });
      if (r.length && r[0].p >= 55) {
        const { nome: n, caminho: c } = r[0];
        if (await this._abrir(c)) {
          this._definirAtual(c);
          const extra = r.length > 1 && r[1].p >= r[0].p - 3 ? ` (também achei ${r.length - 1} parecida(s))` : '';
          return `Abri a pasta ${n}, dentro de ${path.basename(this.historico[this.historico.length - 1])}.${extra}`;
        }
      }
    }
    let g = this._melhorGlobal(nome);
    if (!g && this._catalogo) { this.catalogo(true); g = this._melhorGlobal(nome); }
    if (g && (await this._abrir(g.caminho))) {
      this._definirAtual(g.caminho);
      return `Abri a pasta ${g.nome}.`;
    }
    return `Não encontrei nenhuma pasta parecida com '${nome}'.`;
  }

  async pesquisarReferencia(referencia, marca = '') {
    if (!this.atual) return 'Nenhuma pasta aberta. Peça primeiro para abrir uma pasta, como Lançamentos.';
    const refTxt = /[a-zA-Z]/.test(referencia) ? falaParaNumero(referencia) : referencia;
    const dig = soDigitos(refTxt);
    let base = this.atual;
    if (marca && pontuar(norm(marca), norm(path.basename(this.atual))) >= 55) marca = ''; // já estamos nela
    if (marca) {
      const qm = norm(marca);
      const rm = this._buscarDentro(this.atual, (nn, n, d) => (d ? pontuar(qm, nn) : 0), this.cfg.profundidadeSubpasta, { soPastas: true });
      if (!rm.length || rm[0].p < 55) return `Não achei a marca '${marca}' dentro de ${path.basename(this.atual)}.`;
      base = rm[0].caminho;
    }
    let av;
    if (!dig) { const q = norm(referencia); av = (nn) => pontuar(q, nn); }
    else av = (nn, n) => { const dn = soDigitos(n); return dn === dig ? 100 : dn.includes(dig) ? 85 : 0; };
    const r = this._buscarDentro(base, av, this.cfg.profundidadeReferencia);
    if (!r.length) return `Não encontrei '${refTxt || referencia}' dentro de ${path.basename(base)}.`;
    r.sort((a, b) => b.p - a.p || (b.ePasta - a.ePasta) || a.prof - b.prof); // melhor, pasta antes de arquivo, mais raso
    const { nome: n, caminho: c } = r[0];
    if (await this._abrir(c)) {
      // A pasta atual continua sendo a marca: a próxima referência é procurada no mesmo lugar.
      const outras = r.slice(1, 4).map((x) => x.nome);
      return `Abri ${n}.` + (outras.length ? ` Também há ${r.length - 1} resultado(s): ${outras.join(', ')}.` : '');
    }
    return `Achei ${n}, mas não consegui abrir.`;
  }

  listar(limite = 15) {
    if (!this.atual) return 'Nenhuma pasta aberta.';
    let nomes;
    try { nomes = fs.readdirSync(this.atual, { withFileTypes: true }).filter((e) => !e.name.startsWith('.')).map((e) => semLnk(e.name)).sort(); }
    catch (e) { return `Não consegui listar: ${e.message}`; }
    if (!nomes.length) return `A pasta ${path.basename(this.atual)} está vazia.`;
    const mais = nomes.length > limite ? ` e mais ${nomes.length - limite}` : '';
    return `Em ${path.basename(this.atual)} há ${nomes.length} itens: ${nomes.slice(0, limite).join(', ')}${mais}.`;
  }

  async voltar() {
    if (!this.historico.length) return 'Não há pasta anterior.';
    this.atual = this.historico.pop();
    await this._abrir(this.atual);
    return `Voltei para ${path.basename(this.atual)}.`;
  }

  ondeEstou() { return this.atual ? `Estou em ${this.atual}.` : 'Nenhuma pasta aberta.'; }

  limparContexto() { this.atual = null; this.historico = []; return 'Pronto, comecei do zero.'; }

  atualizarLista() {
    this.catalogo(true);
    this._programas = null;
    return `Lista atualizada: ${this._catalogo.length} pastas conhecidas.`;
  }

  // ---------- sites ----------
  async abrirSite(url = '', busca = '', navegador = '') {
    busca = String(busca || '').trim();
    let alvo = '';
    if (busca) {
      const f = BUSCAS[norm(url)] || BUSCAS.google;
      alvo = f(busca);
    } else alvo = normalizarUrl(url);
    if (!alvo) return `Não entendi o endereço '${url}'. Diga o site completo, como youtube.com.`;
    const nav = NAVEGADORES[norm(navegador)] || '';
    let ok = await abridorUrl(alvo, nav);
    if (!ok && nav) ok = await abridorUrl(alvo, ''); // navegador pedido não existe: usa o padrão
    if (!ok) return 'Não consegui abrir o navegador.';
    const host = new URL(alvo).hostname.replace(/^www\./, '');
    return `Abri ${host}${busca ? ` pesquisando “${busca}”` : ''}${nav ? ` no ${navegador}` : ''}.`;
  }

  // ---------- fechar ----------
  async fecharPasta(nome = '', todas = false) {
    if (!this.sys.win) return 'Fechar janelas de pasta só funciona no Windows.';
    const janelas = this.sys.listarJanelasPasta();
    if (!janelas.length) return 'Não há nenhuma janela de pasta aberta.';
    const mesmo = (a, b) => a.toLowerCase() === b.toLowerCase();
    const rotulo = (p) => path.basename(p) || p;
    let alvos = [];
    if (todas) alvos = janelas;
    else if (nome) {
      const q = norm(nome);
      // vale o nome da própria pasta e, com desconto, o das pastas-mãe ("fecha a Vizzano" fecha Vizzano\\7526.2526)
      const pontua = (p) => Math.max(pontuar(q, norm(rotulo(p))), ...p.split(/[\\/]/).slice(0, -1).filter(Boolean).map((c) => pontuar(q, norm(c)) - 8));
      const pontos = janelas.map((p) => [p, pontua(p)]);
      const melhor = Math.max(...pontos.map((x) => x[1]));
      if (melhor < 55) return `Não achei uma janela de pasta aberta parecida com '${nome}'. Abertas: ${janelas.map(rotulo).join(', ')}.`;
      alvos = pontos.filter((x) => x[1] >= melhor - 3).map((x) => x[0]);
    } else {
      const candidatas = [this.atual, ...[...this.abertas].reverse()].filter(Boolean);
      const achada = candidatas.map((c) => janelas.find((j) => mesmo(j, c))).find(Boolean);
      if (achada) alvos = [achada];
      else if (janelas.length === 1) alvos = janelas;
      else return `Há ${janelas.length} janelas de pasta abertas: ${janelas.map(rotulo).join(', ')}. Diga qual fechar, ou "todas".`;
    }
    const n = this.sys.fecharJanelasPasta(alvos);
    if (!n) return 'Não consegui fechar a janela da pasta.';
    return `Fechei ${n === 1 ? `a janela ${rotulo(alvos[0])}` : `${n} janelas de pasta`}.`;
  }

  async fecharPrograma(nome) {
    if (!this.sys.win) return 'Fechar programas só funciona no Windows.';
    const q = norm(nome);
    if (!q) return 'Diga qual programa fechar.';
    if (['explorador', 'explorador de arquivos', 'pasta', 'pastas'].includes(q)) return this.fecharPasta('', q.startsWith('pasta'));
    const proc = PROC_POR_NOME[q] || '';
    const fechados = this.sys.fecharProgramaPorNome(nome, proc);
    return fechados.length ? `Pedi para fechar ${nome}. Se ele perguntar se quer salvar, responda na tela.` : `Não achei o programa '${nome}' aberto (ou ele não respondeu ao pedido de fechar).`;
  }

  // ---------- programas ----------
  _indiceProgramas() {
    if (this._programas) return this._programas;
    const itens = [];
    const varrer = (dir, ext, prof = 0) => {
      let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const p = path.join(dir, e.name);
        if (e.isDirectory() && prof < 4) varrer(p, ext, prof + 1);
        else if (ext.some((x) => e.name.toLowerCase().endsWith(x))) {
          const n = path.parse(e.name).name;
          itens.push({ nn: norm(n), nome: n, caminho: p });
        }
      }
    };
    if (WIN) {
      for (const d of [path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'),
        path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs'), ...pastasDesktop()]) varrer(d, ['.lnk', '.exe', '.url']);
    } else if (process.platform === 'darwin') varrer('/Applications', ['.app'], 3);
    else for (const d of ['/usr/share/applications', path.join(os.homedir(), '.local/share/applications')]) varrer(d, ['.desktop']);
    this._programas = itens;
    return itens;
  }

  async abrirPrograma(nome) {
    const q = norm(nome);
    if (WIN) {
      const alias = ALIAS_WIN[q];
      if (alias) { // constantes seguras: "start" resolve App Paths (chrome, excel...) e protocolos (ms-settings:)
        const ok = await new Promise((res) => {
          const p = spawn('cmd.exe', ['/d', '/c', `start "" ${alias}`], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true });
          p.on('error', () => res(false)); p.on('exit', (c) => res(c === 0)); p.unref();
        });
        if (ok) return `Abri ${nome}.`;
      }
    }
    let melhor = null, mp = 0;
    for (const it of this._indiceProgramas()) { const p = pontuar(q, it.nn); if (p > mp) { melhor = it; mp = p; } }
    if (melhor && mp >= 60) {
      return (await this._abrir(melhor.caminho)) ? `Abri ${melhor.nome}.` : `Achei ${melhor.nome}, mas não consegui abrir.`;
    }
    return `Não encontrei o programa '${nome}'.`;
  }

  // ---------- controles do computador ----------
  controlarPc(acao, passos = 1) {
    acao = norm(acao).replace(/ /g, '_');
    if (!ACOES.includes(acao)) return 'Ação desconhecida. Opções: ' + ACOES.join(', ');
    passos = Math.max(1, Math.min(parseInt(passos, 10) || 1, 25));
    if (!WIN) return 'Os controles do PC só estão disponíveis no Windows.';
    const sk = (tecla, vezes = 1) => `$w=New-Object -ComObject WScript.Shell; 1..${vezes} | ForEach-Object { $w.SendKeys(${tecla}); Start-Sleep -Milliseconds 30 }`;
    const scripts = {
      volume_mais: sk('[char]175', passos), volume_menos: sk('[char]174', passos), mudo: sk('[char]173'),
      play_pause: sk('[char]179'), proxima: sk('[char]176'), anterior: sk('[char]177'),
      minimizar_tudo: '(New-Object -ComObject Shell.Application).MinimizeAll()',
      bloquear_tela: 'rundll32.exe user32.dll,LockWorkStation',
      captura_tela: 'Start-Process ms-screenclip:',
      fechar_janela: sk("'%{F4}'"), trocar_janela: sk("'%{TAB}'"),
    };
    try {
      const p = spawn('powershell', psArgs(scripts[acao]), { detached: true, stdio: 'ignore', windowsHide: true });
      p.on('error', () => {}); p.unref();
      return 'Feito.';
    } catch (e) { return `Não consegui: ${e.message}`; }
  }
}

const ALIAS_WIN = {
  calculadora: 'calc.exe', 'bloco de notas': 'notepad.exe', explorador: 'explorer.exe', 'explorador de arquivos': 'explorer.exe',
  paint: 'mspaint.exe', prompt: 'cmd.exe', terminal: 'wt.exe', 'painel de controle': 'control.exe',
  'gerenciador de tarefas': 'taskmgr.exe', configuracoes: 'ms-settings:', chrome: 'chrome', 'google chrome': 'chrome',
  edge: 'msedge', excel: 'excel', word: 'winword', powerpoint: 'powerpnt', outlook: 'outlook',
};
const ACOES = ['volume_mais', 'volume_menos', 'mudo', 'play_pause', 'proxima', 'anterior', 'minimizar_tudo',
  'bloquear_tela', 'captura_tela', 'fechar_janela', 'trocar_janela'];

const obj = (properties = {}, required = []) => ({ type: 'OBJECT', properties, ...(required.length ? { required } : {}) });
const FERRAMENTAS = [
  { name: 'abrir_pasta',
    description: 'Abre uma pasta pelo nome (atalho, pasta ou subpasta). Se já há uma pasta aberta (ex.: Lançamentos), procura primeiro DENTRO dela, ' +
      'então serve para abrir a marca e depois a subpasta da marca. Use na_raiz=true só para ignorar a pasta atual.',
    parameters: obj({ nome: { type: 'STRING', description: "Nome da pasta como o usuário falou, ex.: 'lançamentos', 'modare', 'referências'" },
      na_raiz: { type: 'BOOLEAN', description: 'true para procurar fora da pasta atual' } }, ['nome']) },
  { name: 'pesquisar_referencia',
    description: 'Procura e abre a pasta (ou arquivo) de uma REFERÊNCIA numérica dentro da pasta atual ou de uma marca. ' +
      "Escreva a referência em dígitos, ex.: 'sete cinco vinte e seis ponto vinte e cinco vinte e seis' -> '7526.2526'.",
    parameters: obj({ referencia: { type: 'STRING', description: "Referência em dígitos, ex.: '7526.2526'" },
      marca: { type: 'STRING', description: 'Marca/pasta onde procurar (opcional; padrão = pasta atual)' } }, ['referencia']) },
  { name: 'listar_pasta_atual', description: 'Lista o que há dentro da pasta atual.', parameters: obj() },
  { name: 'voltar', description: 'Volta para a pasta anterior.', parameters: obj() },
  { name: 'onde_estou', description: 'Diz qual é a pasta atual.', parameters: obj() },
  { name: 'limpar_contexto', description: 'Esquece a pasta atual e recomeça do zero.', parameters: obj() },
  { name: 'abrir_programa', description: 'Abre um programa/aplicativo do computador (Chrome, Excel, Word, calculadora...).',
    parameters: obj({ nome: { type: 'STRING' } }, ['nome']) },
  { name: 'controlar_pc', description: 'Controla o computador: ' + ACOES.join(', ') + '.',
    parameters: obj({ acao: { type: 'STRING', enum: ACOES }, passos: { type: 'INTEGER', description: 'Quantas vezes repetir (volume). Padrão 1; cada passo ≈ 2%.' } }, ['acao']) },
  { name: 'abrir_site',
    description: "Abre um site no navegador, na página certa (não só o navegador). Ex.: url 'youtube.com' ou 'youtube'. Para PESQUISAR: busca='receita de bolo' e url='google' (ou 'youtube', 'amazon', 'mercado livre'). Use navegador só se o usuário citar um (chrome, edge, firefox).",
    parameters: obj({ url: { type: 'STRING', description: "Endereço ou nome do site: 'youtube.com', 'https://...', 'gmail'" },
      busca: { type: 'STRING', description: 'Texto a pesquisar no site (opcional)' },
      navegador: { type: 'STRING', description: 'chrome | edge | firefox (opcional)' } }) },
  { name: 'fechar_pasta',
    description: 'Fecha janelas de pasta (Explorador de Arquivos). Sem nome: fecha a última pasta aberta. Com nome: fecha a janela daquela pasta. todas=true só se o usuário pedir para fechar todas.',
    parameters: obj({ nome: { type: 'STRING', description: 'Nome da pasta a fechar (opcional)' }, todas: { type: 'BOOLEAN', description: 'true para fechar todas as janelas de pasta' } }) },
  { name: 'fechar_programa', description: 'Fecha um programa aberto pelo nome (Chrome, Excel, Word, Bloco de Notas...). Pede educadamente; o programa ainda pergunta se quer salvar.',
    parameters: obj({ nome: { type: 'STRING' } }, ['nome']) },
  { name: 'atualizar_lista', description: 'Refaz a lista de pastas e programas conhecidos (use se criou pastas novas).', parameters: obj() },
];

async function executarFerramenta(a, nome, args = {}) {
  try {
    switch (nome) {
      case 'abrir_pasta': return await a.abrirPasta(args.nome || '', !!args.na_raiz);
      case 'pesquisar_referencia': return await a.pesquisarReferencia(args.referencia || '', args.marca || '');
      case 'listar_pasta_atual': return a.listar();
      case 'voltar': return await a.voltar();
      case 'onde_estou': return a.ondeEstou();
      case 'limpar_contexto': return a.limparContexto();
      case 'abrir_programa': return await a.abrirPrograma(args.nome || '');
      case 'controlar_pc': return a.controlarPc(args.acao || '', args.passos || 1);
      case 'abrir_site': return await a.abrirSite(args.url || '', args.busca || '', args.navegador || '');
      case 'fechar_pasta': return await a.fecharPasta(args.nome || '', !!args.todas);
      case 'fechar_programa': return await a.fecharPrograma(args.nome || '');
      case 'atualizar_lista': return a.atualizarLista();
      default: return `Ferramenta desconhecida: ${nome}`;
    }
  } catch (e) { return `Erro ao executar ${nome}: ${e.message}`; } // nunca derruba a conversa
}

module.exports = { Assistente, CONFIG_PADRAO, FERRAMENTAS, ACOES, executarFerramenta, setAbridor, norm, pontuar, falaParaNumero, soDigitos,
  eAdministrador, resolverAtalhos, pastasDesktop, psArgs, setAbridorUrl, normalizarUrl };
