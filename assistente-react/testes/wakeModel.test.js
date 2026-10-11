'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const AdmZip = require('adm-zip');
const { zipParaTarGz } = require('../electron/wake-model');

test('zip do Vosk vira .tar.gz válido, com uma pasta no topo', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-'));
  const zip = new AdmZip();
  const grande = Buffer.alloc(3_000_000, 7);
  const arquivos = {
    'vosk-model-small-pt-0.3/am/final.mdl': grande,
    'vosk-model-small-pt-0.3/conf/model.conf': Buffer.from('--min-active=200\n'),
    'vosk-model-small-pt-0.3/graph/phones/word_boundary.int': Buffer.from('1 nonword\n'),
    'vosk-model-small-pt-0.3/ivector/final.ie': Buffer.alloc(512, 1),   // múltiplo exato de 512
  };
  arquivos['vosk-model-small-pt-0.3/graph/pasta-com-nome-bem-longo-' + 'x'.repeat(60) + '/arquivo-' + 'y'.repeat(60) + '.txt'] = Buffer.from('longo');
  zip.addFile('vosk-model-small-pt-0.3/', Buffer.alloc(0));
  for (const [n, d] of Object.entries(arquivos)) zip.addFile(n, d);
  const zipPath = path.join(tmp, 'm.zip');
  zip.writeZip(zipPath);

  const destino = path.join(tmp, 'm.tar.gz');
  await zipParaTarGz(zipPath, destino);
  const lista = execFileSync('tar', ['-tzf', destino], { encoding: 'utf8' }).trim().split('\n');
  assert.ok(lista.every((l) => l.startsWith('vosk-model-small-pt-0.3/')), lista.join('|'));
  // cada pasta aparece como entrada própria, antes dos arquivos dela (exigência do armazenamento do Vosk)
  for (const d of ['vosk-model-small-pt-0.3/', 'vosk-model-small-pt-0.3/am/', 'vosk-model-small-pt-0.3/graph/', 'vosk-model-small-pt-0.3/graph/phones/']) {
    assert.ok(lista.includes(d), 'falta a pasta ' + d);
    assert.ok(lista.indexOf(d) < lista.findIndex((l) => l.startsWith(d) && l !== d), 'pasta depois do conteúdo: ' + d);
  }

  const out = path.join(tmp, 'out');
  fs.mkdirSync(out);
  execFileSync('tar', ['-xzf', destino, '-C', out, '--strip-components=1']);   // = o que o vosk-browser faz
  for (const [n, d] of Object.entries(arquivos)) {
    const rel = n.replace('vosk-model-small-pt-0.3/', '');
    assert.ok(fs.readFileSync(path.join(out, rel)).equals(d), rel);
  }
});
