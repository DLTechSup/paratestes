import test from 'node:test';
import assert from 'node:assert/strict';
import { Motor, f32ParaInt16, int16ParaBase64, base64ParaBytes } from '../src/motor/Motor.js';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (bytes) => Buffer.from(bytes).toString('base64');

function montar(cfgExtra = {}) {
  const cfg = { nome: 'Luna', modo: 'ativacao', sensibilidade: 'normal', janelaEscutaS: 0.4, micId: '', saidaId: '', fones: true,
    voz: '', modelo: 'models/gemini-3.1-flash-live-preview', atalhoGlobal: 'Control+Alt+Space', ...cfgExtra };
  const reg = { enviados: [], respostasTool: [], sessoes: [], conexoes: 0, wakeAlimentado: 0, wakeReiniciado: 0, bips: [], executados: [], falando: false,
    tocado: 0, interrompido: 0, status: [], micParado: false, onChunk: null, onMatch: null, configs: [] };
  const deps = {
    api: {
      cfg: { obter: async () => cfg }, chave: { obter: async () => 'AIzaFAKE' },
      modelo: { estado: async () => ({ pronto: true }), garantir: async () => ({ ok: true }) },
      ferramentas: async () => [{ name: 'abrir_pasta', description: 'x', parameters: { type: 'OBJECT', properties: {} } }],
      executar: async (n, a) => { reg.executados.push([n, a]); return { texto: `ok ${n}`, atual: 'C:\\Lançamentos' }; },
      status: (s) => reg.status.push(s), on: () => () => {},
    },
    criarGenAI: () => ({ live: { connect: async (p) => {
      reg.conexoes++; reg.configs.push(p);
      const sessao = { cb: p.callbacks, fechada: false,
        sendRealtimeInput: (x) => reg.enviados.push(x), sendToolResponse: (x) => reg.respostasTool.push(x),
        close() { this.fechada = true; } };
      reg.sessoes.push(sessao);
      return sessao;
    } } }),
    abrirMic: async ({ onChunk }) => { reg.onChunk = onChunk; return { parar: () => { reg.micParado = true; } }; },
    criarSaida: async () => ({ tocar: () => { reg.tocado++; reg.falando = true; }, interromper: () => { reg.interrompido++; reg.falando = false; },
      falando: () => reg.falando, nivel: () => 0, fechar() {} }),
    criarWake: async ({ onMatch }) => { reg.onMatch = onMatch; return { alimentar: () => { reg.wakeAlimentado++; }, reiniciar: () => { reg.wakeReiniciado++; }, fechar() {} }; },
    bip: (t) => reg.bips.push(t),
  };
  return { m: new Motor(deps), reg, cfg };
}
const chunk = (v = 0.1) => new Float32Array(512).fill(v);
const msg = (o) => o;

test('conversão de áudio', () => {
  const i = f32ParaInt16(new Float32Array([0, 1, -1, 0.5]));
  assert.deepEqual([...i], [0, 32767, -32768, 16383]);
  const back = base64ParaBytes(int16ParaBase64(i));
  assert.equal(back.length, 8);
});

test('ativação: dorme, acorda pelo nome, envia pré-áudio, usa ferramenta, volta a dormir', async () => {
  const { m, reg } = montar();
  await m.iniciar();
  assert.equal(m.obter().status, 'dormindo');
  assert.equal(reg.conexoes, 0, 'não conecta ao Gemini enquanto dorme');
  for (let i = 0; i < 5; i++) reg.onChunk(chunk(), 0.2);
  assert.equal(reg.wakeAlimentado, 5);
  assert.equal(reg.enviados.length, 0, 'nada vai para a nuvem dormindo');

  reg.onMatch('luna abre');
  await esperar(20);
  assert.equal(m.obter().status, 'ouvindo');
  assert.equal(reg.conexoes, 1);
  assert.equal(reg.enviados.length, 5, 'o áudio de antes do nome foi enviado');
  assert.ok(reg.bips.includes('acordar'));
  assert.equal(reg.configs[0].model, 'gemini-3.1-flash-live-preview');
  const nomesTools = reg.configs[0].config.tools[0].functionDeclarations.map((t) => t.name);
  assert.ok(nomesTools.includes('abrir_pasta') && nomesTools.includes('encerrar_conversa'));
  assert.match(reg.configs[0].config.systemInstruction, /Luna/);

  reg.onChunk(chunk(), 0.2);
  assert.equal(reg.enviados.length, 6); assert.equal(reg.wakeAlimentado, 5, 'não alimenta o detector acordado');
  assert.equal(reg.enviados[0].audio.mimeType, 'audio/pcm;rate=16000');

  const s = reg.sessoes[0];
  s.cb.onmessage(msg({ serverContent: { inputTranscription: { text: 'abra a pasta ' } } }));
  s.cb.onmessage(msg({ serverContent: { inputTranscription: { text: 'lançamentos' } } }));
  s.cb.onmessage(msg({ toolCall: { functionCalls: [{ id: '1', name: 'abrir_pasta', args: { nome: 'lançamentos' } }] } }));
  await esperar(20);
  assert.deepEqual(reg.executados[0], ['abrir_pasta', { nome: 'lançamentos' }]);
  assert.equal(reg.respostasTool[0].functionResponses[0].response.result, 'ok abrir_pasta');
  assert.equal(m.obter().pasta, 'C:\\Lançamentos');
  assert.equal(m.obter().logs.find((l) => l.tipo === 'voce').texto, 'abra a pasta lançamentos');

  s.cb.onmessage(msg({ data: b64([1, 2, 3, 4]), serverContent: { outputTranscription: { text: 'Pronto, abri.' } } }));
  assert.equal(m.obter().status, 'falando'); assert.equal(reg.tocado, 1);
  s.cb.onmessage(msg({ serverContent: { turnComplete: true } }));
  reg.falando = false;
  await esperar(250);
  assert.equal(m.obter().status, 'ouvindo');

  await esperar(550); // janela de escuta (0,4 s) sem atividade
  assert.equal(m.obter().status, 'dormindo');
  assert.ok(s.fechada, 'a sessão da nuvem é fechada');
  assert.ok(reg.bips.includes('dormir'));
  reg.onChunk(chunk(), 0.2); assert.equal(reg.wakeAlimentado, 6, 'voltou a alimentar o detector');
});

test('ferramenta encerrar_conversa faz dormir depois da despedida', async () => {
  const { m, reg } = montar({ janelaEscutaS: 30 });
  await m.iniciar(); reg.onMatch('luna'); await esperar(20);
  const s = reg.sessoes[0];
  s.cb.onmessage(msg({ toolCall: { functionCalls: [{ id: '9', name: 'encerrar_conversa', args: {} }] } }));
  await esperar(10);
  assert.equal(reg.executados.length, 0, 'não vai ao PC');
  s.cb.onmessage(msg({ data: b64([1, 2]) }));
  s.cb.onmessage(msg({ serverContent: { turnComplete: true } }));
  assert.equal(m.obter().status, 'falando', 'ainda se despedindo');
  reg.falando = false;
  await esperar(300);
  assert.equal(m.obter().status, 'dormindo');
});

test('modo direto: conecta na hora, não usa detector, reconecta se cair', async () => {
  const { m, reg } = montar({ modo: 'direto' });
  await m.iniciar();
  assert.equal(m.obter().status, 'ouvindo'); assert.equal(reg.conexoes, 1);
  assert.equal(reg.configs[0].config.tools[0].functionDeclarations.some((t) => t.name === 'encerrar_conversa'), false);
  reg.onChunk(chunk(), 0.1); assert.equal(reg.enviados.length, 1); assert.equal(reg.wakeAlimentado, 0);
  reg.sessoes[0].cb.onclose({ code: 1006, reason: 'rede' });
  await esperar(700);
  assert.equal(reg.conexoes, 2); assert.equal(m.obter().status, 'ouvindo');
});

test('chave recusada: para e pede a chave de novo', async () => {
  const { m, reg } = montar({ modo: 'direto' });
  await m.iniciar();
  reg.sessoes[0].cb.onclose({ code: 1008, reason: 'API key not valid. Please pass a valid API key.' });
  assert.equal(m.obter().status, 'parado'); assert.equal(m.obter().erro.tipo, 'chaveInvalida'); assert.ok(reg.micParado);
});

test('sem fones: ignora o microfone enquanto ele fala (anti-eco)', async () => {
  const { m, reg } = montar({ fones: false, janelaEscutaS: 30 });
  await m.iniciar(); reg.onMatch('luna'); await esperar(20);
  const antes = reg.enviados.length;
  reg.falando = true; reg.onChunk(chunk(), 0.3); assert.equal(reg.enviados.length, antes);
  reg.falando = false; reg.onChunk(chunk(), 0.3); assert.equal(reg.enviados.length, antes + 1);
});

test('interrupção do usuário esvazia a fala', async () => {
  const { m, reg } = montar({ janelaEscutaS: 30 });
  await m.iniciar(); reg.onMatch('luna'); await esperar(20);
  reg.sessoes[0].cb.onmessage(msg({ serverContent: { interrupted: true } }));
  assert.equal(reg.interrompido, 1); assert.equal(m.obter().status, 'ouvindo');
});

test('chamada manual (atalho) acorda e dispensa; detector indisponível vira aviso', async () => {
  const { m, reg } = montar({ janelaEscutaS: 30 });
  await m.iniciar();
  m.alternarChamada('atalho'); await esperar(20); assert.equal(m.obter().status, 'ouvindo');
  m.alternarChamada('atalho'); assert.equal(m.obter().status, 'dormindo');

  const b = montar();
  b.m.d.criarWake = async () => { throw new Error('sem modelo'); };
  await b.m.iniciar();
  assert.equal(b.m.obter().status, 'dormindo'); assert.match(b.m.obter().aviso, /sem modelo/);
  b.m.alternarChamada('atalho'); await esperar(20); assert.equal(b.m.obter().status, 'ouvindo');
});

test('parar libera tudo e ignora eventos atrasados', async () => {
  const { m, reg } = montar({ modo: 'direto' });
  await m.iniciar();
  const s = reg.sessoes[0];
  m.parar();
  assert.equal(m.obter().status, 'parado'); assert.ok(s.fechada); assert.ok(reg.micParado);
  s.cb.onmessage(msg({ data: b64([1]) })); s.cb.onclose({ code: 1006 });
  await esperar(50);
  assert.equal(reg.conexoes, 1); assert.equal(m.obter().status, 'parado');
});

test('medidor: conta tokens (cumulativos), segundos e sessões e envia ao app', async () => {
  const { m, reg } = montar({ modo: 'direto', limiteTokensDia: 1000 });
  const enviados = []; let acumulado = { tokens: 0 };
  m.d.api.uso = { registrar: async (d) => { enviados.push(d); acumulado.tokens += d.tokens || 0; return { hoje: { tokens: acumulado.tokens, segundos: 0, sessoes: 1, limites: 0 }, ultimos7: [], ultimoLimite: null }; }, obter: async () => ({ hoje: { tokens: 0 }, ultimos7: [], ultimoLimite: null }) };
  m.d.intervaloUsoMs = 40;
  await m.iniciar();
  const s = reg.sessoes[0];
  s.cb.onmessage({ usageMetadata: { totalTokenCount: 100, promptTokenCount: 60, responseTokenCount: 40 } });
  s.cb.onmessage({ usageMetadata: { totalTokenCount: 250, promptTokenCount: 140, responseTokenCount: 110 } });
  await esperar(120);
  const soma = (k) => enviados.reduce((a, d) => a + (d[k] || 0), 0);
  assert.equal(soma('tokens'), 250); assert.equal(soma('entrada'), 140); assert.equal(soma('saida'), 110);
  assert.equal(soma('sessoes'), 1); assert.ok(soma('segundos') > 0.05, 'conta o tempo conectado');
  m.definirLimiteTokens(300); // 250 de 300 = 83% → aviso
  assert.match(m.obter().aviso, /83%|já usou/);
  m.parar();
});

test('limite do Google: avisa, para de reconectar e registra', async () => {
  const { m, reg } = montar({ modo: 'direto' });
  const reg2 = []; m.d.api.uso = { registrar: async (d) => { reg2.push(d); return null; }, obter: async () => null };
  await m.iniciar();
  reg.sessoes[0].cb.onclose({ code: 1011, reason: 'RESOURCE_EXHAUSTED: You exceeded your current quota' });
  await esperar(900);
  assert.equal(reg.conexoes, 1, 'não tenta reconectar sem parar');
  assert.equal(m.obter().status, 'parado'); assert.equal(m.obter().erro.tipo, 'limite');
  assert.ok(reg2.some((d) => d.limite === 1));
});

test('limite no modo ativação: volta a dormir e continua escutando o nome', async () => {
  const { m, reg } = montar();
  await m.iniciar(); reg.onMatch('luna'); await esperar(20);
  reg.sessoes[0].cb.onerror({ message: '429 Too Many Requests' });
  assert.equal(m.obter().status, 'dormindo'); assert.equal(m.obter().erro.tipo, 'limite');
});
