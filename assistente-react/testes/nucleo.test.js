'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const nucleo = require('../electron/nucleo');

const abertos = [];
nucleo.setAbridor(async (c) => { abertos.push(c); return ''; });

test('números falados', () => {
  const casos = {
    'sete cinco vinte e seis ponto vinte e cinco vinte e seis': '7526.2526',
    '7526.2526': '7526.2526',
    'um dois três quatro ponto cinco seis sete oito': '1234.5678',
    'setecentos e cinquenta e dois': '752',
    'cento e vinte e três': '123',
    'trinta e um zero quinze': '31015',
    'dezoito vinte e dois traço quatro': '1822-4',
    'a referência sete cinco vinte e seis': '7526',
  };
  for (const [fala, esperado] of Object.entries(casos)) assert.equal(nucleo.falaParaNumero(fala), esperado, fala);
});

function arvore() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'assist-'));
  const L = path.join(tmp, 'Trabalho', 'Lançamentos');
  for (const p of ['Modare/7526.2526', 'Modare/7526.2527', 'Modare/Outros/1234.5678', 'Vizzano/7526.2526', 'Vizzano/9999.0001',
    'Beira Rio Conforto/4242.1010', 'Moleca/Ref 3030.2020']) fs.mkdirSync(path.join(L, p), { recursive: true });
  fs.writeFileSync(path.join(L, 'Modare', '7526.2526', 'foto.jpg'), 'x');
  const a = new nucleo.Assistente({ atalhos: { 'lançamentos': L }, raizes: [tmp] });
  return { tmp, L, a };
}

test('fluxo: Lançamentos > marca > referência falada > voltar', async () => {
  const { L, a } = arvore();
  await a.abrirPasta('lançamentos'); assert.equal(abertos.at(-1), L);
  await a.abrirPasta('Modare'); assert.equal(abertos.at(-1), path.join(L, 'Modare')); assert.equal(a.atual, path.join(L, 'Modare'));
  await a.pesquisarReferencia('sete cinco vinte e seis ponto vinte e cinco vinte e seis');
  assert.equal(abertos.at(-1), path.join(L, 'Modare', '7526.2526'));
  await a.pesquisarReferencia('1234.5678'); assert.equal(abertos.at(-1), path.join(L, 'Modare', 'Outros', '1234.5678'));
  assert.equal(a.atual, path.join(L, 'Modare')); // continua na marca
  await a.voltar(); assert.equal(a.atual, L);
});

test('marca dita na pesquisa, nomes compostos, referência com prefixo', async () => {
  const { L, a } = arvore();
  await a.abrirPasta('lançamentos');
  await a.pesquisarReferencia('7526.2526', 'vizzano'); assert.equal(abertos.at(-1), path.join(L, 'Vizzano', '7526.2526'));
  a.limparContexto(); await a.abrirPasta('lançamentos'); await a.abrirPasta('beira rio');
  assert.equal(a.atual, path.join(L, 'Beira Rio Conforto'));
  a.limparContexto(); await a.abrirPasta('lançamentos'); await a.abrirPasta('moleca');
  assert.match(await a.pesquisarReferencia('30302020'), /Ref 3030\.2020/);
});

test('sem pasta aberta / não achou / listar', async () => {
  const { a } = arvore();
  assert.match(await a.pesquisarReferencia('1'), /Nenhuma pasta aberta/);
  await a.abrirPasta('lançamentos'); await a.abrirPasta('modare');
  assert.match(await a.pesquisarReferencia('0000.0000'), /Não encontrei/);
  assert.match(a.listar(), /7526\.2526/);
  assert.match(await a.abrirPasta('xyzabc'), /Não encontrei/);
});

test('desempenho: 56 marcas x 150 referências', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'assist-perf-'));
  const L = path.join(tmp, 'Lançamentos');
  for (let m = 0; m < 56; m++) for (let r = 0; r < 150; r++) {
    fs.mkdirSync(path.join(L, `Marca${String(m).padStart(2, '0')} Calçados`, `${1000 + r * 37}.${2000 + m * 13}`), { recursive: true });
  }
  fs.mkdirSync(path.join(L, 'Marca30 Calçados', '7526.2526'));
  const a = new nucleo.Assistente({ atalhos: { 'lançamentos': L }, raizes: [tmp] });
  let t = Date.now(); await a.abrirPasta('lançamentos'); const t1 = Date.now() - t;
  t = Date.now(); await a.abrirPasta('marca 30'); const t2 = Date.now() - t;
  t = Date.now(); const r = await a.pesquisarReferencia('sete cinco vinte e seis ponto vinte e cinco vinte e seis'); const t3 = Date.now() - t;
  assert.match(r, /Abri 7526\.2526/);
  console.log(`  tempos: lançamentos ${t1}ms · marca ${t2}ms · referência ${t3}ms`);
  assert.ok(t2 < 500 && t3 < 1500);
});

test('ferramentas: declaração e execução segura', async () => {
  assert.ok(nucleo.FERRAMENTAS.every((f) => f.name && f.parameters.type === 'OBJECT'));
  const a = new nucleo.Assistente({});
  assert.match(await nucleo.executarFerramenta(a, 'inexistente', {}), /desconhecida/);
  assert.match(await nucleo.executarFerramenta(a, 'onde_estou', {}), /Nenhuma/);
  assert.match(await nucleo.executarFerramenta(a, 'controlar_pc', { acao: 'xxx' }), /desconhecida/);
});
