'use strict';
/**
 * Modelo de voz OFFLINE usado só para ouvir o nome do assistente (Vosk, português, ~50 MB).
 * Baixa o zip oficial uma vez e o converte para o formato .tar.gz que o vosk-browser carrega.
 */
const fs = require('fs');
const https = require('https');
const path = require('path');
const zlib = require('zlib');
const { once } = require('events');

const URL_ZIP = 'https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip';
const TAMANHO_MIN = 10 * 1024 * 1024;

const caminhoModelo = (userData) => path.join(userData, 'modelos', 'vosk-small-pt.tar.gz');
const existe = (userData) => { try { return fs.statSync(caminhoModelo(userData)).size > TAMANHO_MIN; } catch { return false; } };

function baixar(url, destino, onProgresso, redirecoes = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'AssistenteDeVoz' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirecoes > 0) {
        res.resume();
        return resolve(baixar(new URL(res.headers.location, url).toString(), destino, onProgresso, redirecoes - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Servidor respondeu ${res.statusCode}`)); }
      const total = Number(res.headers['content-length']) || 0;
      let lido = 0;
      const out = fs.createWriteStream(destino);
      res.on('data', (c) => { lido += c.length; if (total) onProgresso?.({ etapa: 'baixando', pct: Math.round((lido / total) * 100) }); });
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve()));
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('Tempo esgotado ao baixar o modelo')));
  });
}

// ---- escritor mínimo de tar (ustar) ----
function octal(n, tam) { return n.toString(8).padStart(tam - 1, '0') + '\0'; }

function cabecalho(nome, tamanho, dir) {
  const buf = Buffer.alloc(512);
  let prefixo = '';
  if (Buffer.byteLength(nome) > 100) { // divide em prefixo/nome numa barra
    const i = nome.lastIndexOf('/', nome.length - 2);
    if (i > 0) { prefixo = nome.slice(0, i); nome = nome.slice(i + 1); }
  }
  buf.write(nome, 0, 100, 'utf8');
  buf.write(dir ? '0000755\0' : '0000644\0', 100);
  buf.write('0000000\0', 108);
  buf.write('0000000\0', 116);
  buf.write(octal(dir ? 0 : tamanho, 12), 124);
  buf.write(octal(Math.floor(Date.now() / 1000), 12), 136);
  buf.write('        ', 148);                 // checksum provisório (8 espaços)
  buf.write(dir ? '5' : '0', 156);
  buf.write('ustar\0', 257);
  buf.write('00', 263);
  if (prefixo) buf.write(prefixo, 345, 155, 'utf8');
  let soma = 0;
  for (const b of buf) soma += b;
  buf.write(octal(soma, 7) + ' ', 148);      // 6 dígitos + \0 + espaço
  return buf;
}

async function escrever(gz, dados) {
  if (!gz.write(dados)) await once(gz, 'drain');
}

async function zipParaTarGz(zipPath, destino, onProgresso) {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(zipPath);
  const entradas = zip.getEntries();
  const tmp = destino + '.parcial';
  const gz = zlib.createGzip({ level: 6 });
  const saida = fs.createWriteStream(tmp);
  gz.pipe(saida);
  let feitos = 0;
  const pastas = new Set();
  // Como o `tar` de verdade: toda pasta aparece como entrada própria ANTES dos arquivos dela
  // (sem isso o armazenamento interno do Vosk falha ao gravar o modelo).
  const garantirPastas = async (nomeArquivo, ePasta) => {
    const partes = nomeArquivo.split('/').filter(Boolean);
    const ate = ePasta ? partes.length : partes.length - 1;
    for (let i = 1; i <= ate; i++) {
      const dir = partes.slice(0, i).join('/') + '/';
      if (!pastas.has(dir)) { pastas.add(dir); await escrever(gz, cabecalho(dir, 0, true)); }
    }
  };
  for (const e of entradas) {
    const nome = e.entryName.replace(/\\/g, '/');
    if (e.isDirectory) { await garantirPastas(nome, true); continue; }
    await garantirPastas(nome, false);
    const dados = e.getData();
    await escrever(gz, cabecalho(nome, dados.length, false));
    await escrever(gz, dados);
    const resto = dados.length % 512;
    if (resto) await escrever(gz, Buffer.alloc(512 - resto));
    if (++feitos % 20 === 0) onProgresso?.({ etapa: 'preparando', pct: Math.round((feitos / entradas.length) * 100) });
  }
  await escrever(gz, Buffer.alloc(1024));
  gz.end();
  await once(saida, 'close');
  fs.renameSync(tmp, destino);
}

/** Garante que o modelo existe. Lança erro com mensagem amigável se não conseguir. */
async function garantir(userData, onProgresso) {
  if (existe(userData)) return caminhoModelo(userData);
  const destino = caminhoModelo(userData);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const zipTmp = destino + '.zip';
  try {
    onProgresso?.({ etapa: 'baixando', pct: 0 });
    await baixar(URL_ZIP, zipTmp, onProgresso);
    onProgresso?.({ etapa: 'preparando', pct: 0 });
    await zipParaTarGz(zipTmp, destino, onProgresso);
    onProgresso?.({ etapa: 'pronto', pct: 100 });
    return destino;
  } catch (e) {
    try { fs.rmSync(destino + '.parcial', { force: true }); } catch { /* ignora */ }
    throw new Error(`Não consegui preparar o reconhecimento da palavra de ativação (${e.message}). ` +
      'Verifique a internet (só é preciso na primeira vez) ou use o modo "Ouvir direto".');
  } finally {
    try { fs.rmSync(zipTmp, { force: true }); } catch { /* ignora */ }
  }
}

module.exports = { garantir, existe, caminhoModelo, zipParaTarGz, cabecalho };
