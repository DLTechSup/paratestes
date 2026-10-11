'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Uso } = require('../electron/uso');

test('Uso soma por dia, guarda 7 dias, marca limite e persiste', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uso-'));
  let agora = new Date('2026-10-11T10:00:00');
  const u = new Uso(dir, () => agora);
  u.registrar({ tokens: 100, entrada: 60, saida: 40, segundos: 30, sessoes: 1 });
  u.registrar({ tokens: 50, segundos: 15.5, lixo: 9, tokens_negativo: -3 });
  let r = u.registrar({ tokens: -5, limite: 1 });
  assert.equal(r.hoje.tokens, 150); assert.equal(r.hoje.segundos, 45.5); assert.equal(r.hoje.sessoes, 1); assert.equal(r.hoje.limites, 1);
  assert.equal(r.ultimos7.length, 7); assert.equal(r.ultimos7[6].dia, '2026-10-11'); assert.equal(r.ultimos7[0].dia, '2026-10-05');
  assert.ok(r.ultimoLimite > 0);
  agora = new Date('2026-10-12T09:00:00');
  r = u.registrar({ tokens: 7 });
  assert.equal(r.hoje.tokens, 7); assert.equal(r.ultimos7[5].tokens, 150);
  const u2 = new Uso(dir, () => agora); // reabre do disco
  assert.equal(u2.resumo().ultimos7[5].tokens, 150);
  agora = new Date('2026-12-30T09:00:00'); u2.registrar({ tokens: 1 });
  assert.equal(Object.keys(u2.dados.dias).length, 1, 'dias antigos são apagados');
});
