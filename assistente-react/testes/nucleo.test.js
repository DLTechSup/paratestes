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

test('fechar pasta/programa: escolhe a janela certa (Windows simulado)', async () => {
  const { L, a } = arvore();
  const janelas = [path.join(L, 'Modare'), path.join(L, 'Vizzano', '7526.2526'), 'D:\\Outros'];
  const fechadas = []; let fechouProg = null;
  a.sys = { win: true, listarJanelasPasta: () => [...janelas],
    fecharJanelasPasta: (c) => { fechadas.push(...c); return c.length; },
    fecharProgramaPorNome: (n, proc) => { fechouProg = [n, proc]; return n === 'inexistente' ? [] : [proc || n]; } };

  await a.abrirPasta('lançamentos'); await a.abrirPasta('modare');
  assert.match(await a.fecharPasta(), /Fechei a janela Modare/);            // sem nome: a pasta atual
  assert.deepEqual(fechadas.splice(0), [path.join(L, 'Modare')]);
  assert.equal(a.atual, path.join(L, 'Modare'), 'fechar não muda a pasta atual da conversa');

  assert.match(await a.fecharPasta('vizzano'), /Fechei/);                     // nome da pasta-mãe da janela aberta
  assert.deepEqual(fechadas.splice(0), [path.join(L, 'Vizzano', '7526.2526')]);
  assert.match(await a.fecharPasta('7526.2526'), /Fechei/); assert.deepEqual(fechadas.splice(0), [path.join(L, 'Vizzano', '7526.2526')]);
  assert.match(await a.fecharPasta('modare'), /Fechei/); assert.deepEqual(fechadas.splice(0), [path.join(L, 'Modare')]);
  assert.match(await a.fecharPasta('xyz'), /Não achei uma janela/);
  assert.match(await a.fecharPasta('', true), /Fechei 3 janelas/); assert.equal(fechadas.splice(0).length, 3);

  a.atual = null; a.abertas = [];                                              // sem contexto e várias abertas: pergunta qual
  assert.match(await a.fecharPasta(), /Diga qual fechar/);
  janelas.length = 1; assert.match(await a.fecharPasta(), /Fechei a janela Modare/); // só uma aberta: fecha
  janelas.length = 0; assert.match(await a.fecharPasta(), /Não há nenhuma janela/);

  assert.match(await a.fecharPrograma('chrome'), /Pedi para fechar chrome/); assert.deepEqual(fechouProg, ['chrome', 'chrome']);
  assert.match(await a.fecharPrograma('inexistente'), /Não achei o programa/);
  assert.match(await a.fecharPrograma(''), /Diga qual/);
  const b = new nucleo.Assistente({}); b.sys.win = false;
  assert.match(await b.fecharPasta(), /só funciona no Windows/);
  assert.match(await nucleo.executarFerramenta(b, 'fechar_programa', { nome: 'x' }), /só funciona no Windows/);
  assert.ok(['fechar_pasta', 'fechar_programa'].every((n) => nucleo.FERRAMENTAS.some((f) => f.name === n)));
});

test('PowerShell recebe o script codificado (sem problemas de aspas)', () => {
  const script = 'Write-Output "olá \'mundo\' `n ação"';
  const a = nucleo.psArgs(script);
  assert.equal(a[a.length - 2], '-EncodedCommand');
  assert.equal(Buffer.from(a[a.length - 1], 'base64').toString('utf16le'), script);
  assert.ok(!a.some((x) => x === '-Command'));
});

test('sites: endereços, pesquisas e segurança', async () => {
  const n = nucleo.normalizarUrl;
  assert.equal(n('youtube'), 'https://www.youtube.com');
  assert.equal(n('YouTube.com'), 'https://youtube.com/');
  assert.equal(n('www.uol.com.br/esporte'), 'https://www.uol.com.br/esporte');
  assert.equal(n('https://exemplo.com/a?b=1&c=2'), 'https://exemplo.com/a?b=1&c=2');
  assert.equal(n('meusite'), 'https://www.meusite.com/');
  assert.equal(n('exemplo.com:8080/x'), 'https://exemplo.com:8080/x');
  assert.equal(n('mercado livre'), 'https://www.mercadolivre.com.br');
  for (const ruim of ['', 'javascript:alert(1)', 'file:///C:/Windows/system32', 'abra o site do banco', 'ftp://x.com', 'mailto:a@b.com', 'https://banco.com@golpe.com', 'data:text/html,x', 'x'.repeat(3000)]) assert.equal(n(ruim), '', ruim.slice(0, 30));

  const abertas = [];
  nucleo.setAbridorUrl(async (u, nav) => { abertas.push([u, nav]); return nav !== 'nao-existe'; });
  const a = new nucleo.Assistente({});
  assert.match(await a.abrirSite('youtube.com'), /Abri youtube\.com\./); assert.deepEqual(abertas.pop(), ['https://youtube.com/', '']);
  assert.match(await a.abrirSite('google', 'receita de bolo'), /pesquisando “receita de bolo”/);
  assert.equal(abertas.pop()[0], 'https://www.google.com/search?q=receita%20de%20bolo');
  await a.abrirSite('youtube', 'musica & ação'); assert.equal(abertas.pop()[0], 'https://www.youtube.com/results?search_query=musica%20%26%20a%C3%A7%C3%A3o');
  await a.abrirSite('mercado livre', 'tênis nike'); assert.equal(abertas.pop()[0], 'https://lista.mercadolivre.com.br/t%C3%AAnis-nike');
  await a.abrirSite('', 'clima hoje'); assert.match(abertas.pop()[0], /google\.com\/search/);
  assert.match(await a.abrirSite('gmail.com', '', 'Chrome'), /no Chrome/); assert.deepEqual(abertas.pop(), ['https://gmail.com/', 'chrome']);
  assert.match(await a.abrirSite('banco seguro agora'), /Não entendi o endereço/);
  assert.equal(abertas.length, 0, 'endereço inválido não abre nada');
  assert.match(await nucleo.executarFerramenta(a, 'abrir_site', { url: 'github.com' }), /Abri github\.com/);
});
