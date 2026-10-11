import test from 'node:test';
import assert from 'node:assert/strict';
import { casaNome, melhorSemelhanca, chaveFonetica } from '../src/motor/matchNome.mjs';

test('reconhece o nome ouvido de formas parecidas', () => {
  for (const t of ['jarvis', 'jarvis abre a pasta', 'ei jarvis', 'jarvis,', 'jar vis', 'já vis', 'garvis', 'jarves', 'djarvis', 'olá jarvis tudo bem']) {
    assert.ok(casaNome(t, 'Jarvis'), `deveria casar: "${t}" (${melhorSemelhanca(t, 'Jarvis').toFixed(2)})`);
  }
});

test('não confunde com palavras comuns', () => {
  for (const t of ['abrir a pasta lançamentos', 'carro novo', 'bom dia tudo bem', 'a referência sete cinco vinte e seis', 'já vi isso', 'marvin']) {
    assert.ok(!casaNome(t, 'Jarvis'), `não deveria casar: "${t}" (${melhorSemelhanca(t, 'Jarvis').toFixed(2)})`);
  }
});

test('nomes curtos e compostos', () => {
  assert.ok(casaNome('luna abre o chrome', 'Luna'));
  assert.ok(!casaNome('lunar', 'Luna'));
  assert.ok(!casaNome('lua', 'Luna'));
  assert.ok(casaNome('ei assistente', 'Ei Assistente'));
  assert.ok(casaNome('eiassistente', 'Ei Assistente'));
  assert.ok(casaNome('hey bia', 'Bia'));
  assert.ok(!casaNome('bem', 'Bia'));
  assert.ok(casaNome('bia', 'Bia'));
});

test('sensibilidade', () => {
  assert.ok(!casaNome('jarbis', 'Jarvis', 'rigida'));   // 0.83 < 0.88
  assert.ok(casaNome('jarbis', 'Jarvis', 'normal'));
  assert.ok(!casaNome('jarbes', 'Jarvis', 'normal'));   // 0.67
  assert.ok(casaNome('jarbes', 'Jarvis', 'flexivel') === (0.67 >= 0.68));
});

test('fonética básica', () => {
  assert.equal(chaveFonetica('Cecília'), chaveFonetica('sesilia'));
  assert.equal(chaveFonetica('chave'), chaveFonetica('xave'));
});
