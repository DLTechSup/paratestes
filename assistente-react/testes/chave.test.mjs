import test from 'node:test';
import assert from 'node:assert/strict';
import { limparChave } from '../src/util.js';

test('aceita os dois formatos de chave do Google', () => {
  assert.equal(limparChave('AIzaSyD1234567890abcdefghijklmnopqrstuvw'), 'AIzaSyD1234567890abcdefghijklmnopqrstuvw');
  const nova = 'AQ.Ab8RN6JDcBYPHN03-uM16pCGA9nDTmEein69_m7xyz123456';
  assert.equal(limparChave(nova), nova);                       // o caso do usuário (com ponto)
});

test('limpa espaços, aspas, quebras de linha e prefixos colados junto', () => {
  assert.equal(limparChave('  "AQ.Ab8RN6JDcBYPHN03-uM16pCGA9nDTmEein69"  \n'), 'AQ.Ab8RN6JDcBYPHN03-uM16pCGA9nDTmEein69');
  assert.equal(limparChave('AQ.Ab8RN6JDcBYPHN03-\nuM16pCGA9nDTmEein69'), 'AQ.Ab8RN6JDcBYPHN03-uM16pCGA9nDTmEein69');
  assert.equal(limparChave('GEMINI_API_KEY=AIzaSyD1234567890abcdefghijklmn'), 'AIzaSyD1234567890abcdefghijklmn'); // copiado de um .env
  assert.equal(limparChave('api key: AIzaSyD1234567890abcdefghijklmnopq'), 'AIzaSyD1234567890abcdefghijklmnopq');
  assert.equal(limparChave('Bearer AIzaSyD1234567890abcdefghijklmnopq'), 'AIzaSyD1234567890abcdefghijklmnopq');
});

test('recusa o que não é chave', () => {
  for (const x of ['', 'curta', 'abra a pasta lançamentos e depois outra', 'AIza com espaço no meio e mais coisa', null, undefined, 'C:\\Users\\x\\chave.txt']) {
    assert.equal(limparChave(x), '', String(x));
  }
});
