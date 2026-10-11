// Motor do assistente (sem React e sem acesso direto ao navegador: tudo entra por `deps`, o que permite testar).
// Estados: parado → dormindo (esperando o nome) → conectando → ouvindo ⇄ falando → dormindo ...
import { montarConfig, ENCERRAR } from './liveConfig.js';

const TAMANHO_RING = 16000 * 2.6; // ~2,6 s de áudio antes do nome (para não perder "Nome, abre a pasta...")

export function f32ParaInt16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) { const s = Math.max(-1, Math.min(1, f32[i])); out[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
  return out;
}

export function int16ParaBase64(i16) {
  const u8 = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength);
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(bin);
}

export const base64ParaBytes = (b64) => { const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; };

const MSG_CHAVE = /api key|api_key|permission|unauthenticated|401|403/i;
const MSG_LIMITE = /429|resource[_ ]exhausted|quota|rate[ -]?limit|too many requests|exceeded your/i;
const MSG_AJUSTE = /1007|invalid[_ ]argument|invalid argument/i;

export class Motor {
  constructor(deps) {
    this.d = deps;
    this.ouvintes = new Set();
    this.estado = { status: 'parado', logs: [], pasta: null, erro: null, aviso: null, modeloWake: null, nome: '', modo: 'ativacao', uso: null };
    this.nivelMic = 0;
    this.cfg = null;
    this.reset();
    this._idSeq = 0;
  }

  reset() {
    this.token = null; this.sessao = null; this.sessaoPronta = false; this.acordado = false;
    this.mic = null; this.saida = null; this.wake = null; this.chave = '';
    this.ring = []; this.ringAmostras = 0; this.pendentes = [];
    this.idleT = null; this.fimFalaT = null; this.reconT = null; this.dormirAposTurno = false; this.tentativas = 0; this.semAjustes = false;
    this.ocupado = false; this.linhaAberta = null;
    clearInterval(this.usoT); this.usoT = null; this.tickUso = 0; this.ultimoTotal = 0; this.ultimaEntrada = 0; this.ultimaSaida = 0;
    this.usoPend = { tokens: 0, entrada: 0, saida: 0, segundos: 0, sessoes: 0, limite: 0 };
  }

  // ---------- estado / React ----------
  assinar(fn) { this.ouvintes.add(fn); return () => this.ouvintes.delete(fn); }
  obter() { return this.estado; }
  _set(p) { this.estado = { ...this.estado, ...p }; this.ouvintes.forEach((f) => f()); this.d.api?.status?.(this.estado.status); }
  get nivelSaida() { return this.saida?.nivel?.() ?? 0; }
  _log(tipo, texto, extra = {}) {
    const e = { id: ++this._idSeq, tipo, texto, hora: Date.now(), ...extra };
    this.estado = { ...this.estado, logs: [...this.estado.logs, e].slice(-150) };
    this.ouvintes.forEach((f) => f());
    return e;
  }
  limparLogs() { this._set({ logs: [] }); }

  _acumular(tipo, texto) {
    if (this.linhaAberta && this.linhaAberta.tipo === tipo) {
      const l = this.linhaAberta; l.texto += texto;
      this.estado = { ...this.estado, logs: this.estado.logs.map((x) => (x.id === l.id ? { ...l } : x)) };
      this.ouvintes.forEach((f) => f());
    } else {
      this.linhaAberta = { ...this._log(tipo, texto) };
    }
  }
  _fecharLinhas() { this.linhaAberta = null; }

  // ---------- ciclo de vida ----------
  async iniciar() {
    if (this.estado.status !== 'parado' || this.ocupado) return;
    this.ocupado = true;
    try {
      this.cfg = await this.d.api.cfg.obter();
      this.chave = await this.d.api.chave.obter();
      if (!this.chave) { this._set({ erro: { tipo: 'chaveInvalida', msg: 'Cole a sua chave do Gemini para começar.' } }); return; }
      this._set({ status: 'conectando', erro: null, aviso: null, nome: this.cfg.nome, modo: this.cfg.modo });
      this._iniciarUso();
      this.saida = await this.d.criarSaida({ saidaId: this.cfg.saidaId });
      this.mic = await this.d.abrirMic({ micId: this.cfg.micId, onChunk: (f32, rms) => this._chunk(f32, rms) });
      if (this.cfg.modo === 'ativacao') {
        await this._prepararWake();
        this._dormir(true);
      } else {
        this.acordado = true;
        await this._conectar();
      }
    } catch (e) { this._falha(e); } finally { this.ocupado = false; }
  }

  async _prepararWake() {
    this._set({ modeloWake: { fase: 'preparando', pct: 0 } });
    const desinscrever = this.d.api.on?.('modelo:progresso', (p) => this._set({ modeloWake: { fase: p.etapa, pct: p.pct } }));
    try {
      const est = await this.d.api.modelo.estado();
      if (!est.pronto) {
        const r = await this.d.api.modelo.garantir();
        if (!r.ok) throw new Error(r.erro);
      }
      this._set({ modeloWake: { fase: 'carregando', pct: 100 } });
      this.wake = await this.d.criarWake({ nome: this.cfg.nome, sens: this.cfg.sensibilidade, onMatch: (t) => this._acordar('nome', t) });
      this._set({ modeloWake: { fase: 'pronto', pct: 100 } });
    } catch (e) {
      // Sem o reconhecedor do nome o assistente continua útil: atalho do teclado e botão "Chamar agora".
      this.wake = null;
      const atalho = { 'Control+Alt+Space': 'Ctrl + Alt + Espaço', 'Control+Shift+Space': 'Ctrl + Shift + Espaço' }[this.cfg.atalhoGlobal] || this.cfg.atalhoGlobal;
      const motivo = String(e?.message || e).replace(/^Error:\s*/, '');
      this._set({ modeloWake: { fase: 'erro', pct: 0 }, aviso: `Não consegui ativar a escuta do nome. ${motivo} Enquanto isso, chame pelo botão "Chamar agora"${atalho ? ` ou pelo atalho ${atalho}` : ''}, ou troque para "Ouvir direto".` });
    } finally { desinscrever?.(); }
  }

  _dormir(inicial = false) {
    clearTimeout(this.idleT); clearTimeout(this.fimFalaT);
    this.acordado = false; this.pendentes = []; this.dormirAposTurno = false; this.tentativas = 0;
    this._fecharSessao();
    this._fecharLinhas();
    this.wake?.reiniciar();
    if (!inicial) { this.d.bip?.('dormir'); this._log('sistema', `Voltei a aguardar “${this.cfg.nome}”.`); }
    this._set({ status: 'dormindo' });
  }

  _fecharSessao() {
    if (this.sessaoPronta) this._flushUso();
    this.token = null;
    const s = this.sessao;
    this.sessao = null; this.sessaoPronta = false;
    try { s?.close(); } catch { /* já fechada */ }
  }

  parar() {
    clearTimeout(this.idleT); clearTimeout(this.fimFalaT); clearTimeout(this.reconT);
    this._fecharSessao();
    this._flushUso();
    try { this.mic?.parar(); } catch { /* ok */ }
    try { this.wake?.fechar(); } catch { /* ok */ }
    try { this.saida?.fechar(); } catch { /* ok */ }
    const logs = this.estado.logs;
    this.reset();
    this._set({ status: 'parado', logs, modeloWake: null });
  }

  async reiniciar() {
    const rodando = this.estado.status !== 'parado';
    this.parar();
    if (rodando) await this.iniciar();
  }

  _falha(e) {
    const nome = e?.name || '';
    let msg = e?.message || String(e);
    if (nome === 'NotAllowedError' || /permission/i.test(msg) && /denied|dismissed/i.test(msg)) {
      msg = 'O Windows bloqueou o microfone. Abra Configurações > Privacidade e segurança > Microfone e permita o acesso para aplicativos da área de trabalho.';
    } else if (nome === 'NotFoundError' || nome === 'OverconstrainedError') {
      msg = 'Não encontrei o microfone escolhido. Escolha outro em Ajustes.';
    }
    this._log('aviso', msg);
    this.parar();
    this._set({ erro: { tipo: 'geral', msg } });
  }

  /** O Google respondeu que o limite de uso acabou: não insiste (evita piorar) e avisa. */
  _limite() {
    if (this.limiteTratado) return;
    this.limiteTratado = true; setTimeout(() => { this.limiteTratado = false; }, 3000);
    this.usoPend.limite += 1;
    this._flushUso();
    this._log('aviso', 'O Google informou que o limite de uso do Gemini foi atingido.');
    const erro = { tipo: 'limite', msg: 'O Google informou que o limite de uso gratuito do Gemini foi atingido. Espere um pouco (ele renova com o tempo) ou veja o seu uso no Google AI Studio.' };
    if (this.cfg?.modo === 'direto') this.parar(); else this._dormir();
    this._set({ erro });
  }

  _chaveInvalida() {
    this._log('aviso', 'O Google recusou a chave.');
    this.parar();
    this._set({ erro: { tipo: 'chaveInvalida', msg: 'O Google recusou essa chave. Confira se copiou inteira e cole de novo.' } });
  }

  // ---------- chamar / dispensar manualmente (atalho, botão) ----------
  alternarChamada(origem = 'atalho') {
    if (this.estado.status === 'parado') return;
    if (this.cfg?.modo !== 'ativacao') return;
    if (this.acordado) this._dormir(); else this._acordar(origem);
  }

  // ---------- áudio do microfone ----------
  _chunk(f32, rms) {
    this.nivelMic = rms || 0;
    if (!this.cfg || this.estado.status === 'parado') return;
    const i16 = f32ParaInt16(f32);
    this.ring.push(i16); this.ringAmostras += i16.length;
    while (this.ringAmostras > TAMANHO_RING && this.ring.length > 1) this.ringAmostras -= this.ring.shift().length;
    if (!this.cfg.fones && this.saida?.falando?.()) return; // sem fones: ignora o microfone enquanto ele fala (evita eco)
    if (this.acordado) {
      if (this.sessaoPronta) this._enviar(i16); else this.pendentes.push(i16);
    } else if (this.wake) {
      this.wake.alimentar(f32);
    }
  }

  _enviar(i16) {
    try { this.sessao?.sendRealtimeInput({ audio: { data: int16ParaBase64(i16), mimeType: 'audio/pcm;rate=16000' } }); } catch { /* sessão caindo */ }
  }

  // ---------- sessão Gemini Live ----------
  async _acordar(origem, ouvido = '') {
    if (this.acordado || this.estado.status === 'parado' || this.ocupado && origem !== 'direto') return;
    this.acordado = true;
    clearTimeout(this.idleT);
    this.d.bip?.('acordar');
    this._log('sistema', origem === 'nome' ? `Ouvi “${this.cfg.nome}”${ouvido ? ` (“${ouvido}”)` : ''}` : origem === 'atalho' ? 'Chamado pelo atalho.' : 'Chamado.');
    this.pendentes = origem === 'nome' || origem === 'atalho' ? [...this.ring] : [];
    this._set({ status: 'conectando' });
    try { await this._conectar(); } catch (e) { this._erroSessao(e); }
  }

  async _conectar() {
    const tools = await this.d.api.ferramentas();
    const todas = this.cfg.modo === 'ativacao' ? [...tools, ENCERRAR] : tools;
    const token = {};
    this.token = token;
    const ai = this.d.criarGenAI(this.chave);
    const sessao = await ai.live.connect({
      model: String(this.cfg.modelo || 'gemini-3.1-flash-live-preview').replace(/^models\//, ''),
      config: montarConfig({ nome: this.cfg.nome, modo: this.cfg.modo, voz: this.cfg.voz, tools: todas, semAjustes: this.semAjustes }),
      callbacks: {
        onopen: () => {},
        onmessage: (m) => { if (this.token === token) this._msg(m); },
        onerror: (e) => { if (this.token === token) this._onErroSessao(e); },
        onclose: (e) => { if (this.token === token) this._onFecho(e); },
      },
    });
    if (this.token !== token) { try { sessao.close(); } catch { /* ok */ } return; } // foi cancelada enquanto conectava
    this.sessao = sessao;
    this.sessaoPronta = true;
    this.tentativas = 0;
    this.ultimoTotal = 0; this.ultimaEntrada = 0; this.ultimaSaida = 0;
    this.usoPend.sessoes += 1; this.tickUso = Date.now();
    const pend = this.pendentes; this.pendentes = [];
    pend.forEach((c) => this._enviar(c));
    this._set({ status: 'ouvindo' });
    this._log('sistema', 'Pode falar.');
    this._armarIdle();
  }

  _onErroSessao(e) {
    const msg = e?.message || e?.reason || String(e);
    this._log('aviso', `Erro de conexão: ${msg}`);
    if (MSG_LIMITE.test(msg)) this._limite();
    else if (MSG_CHAVE.test(msg)) this._chaveInvalida();
  }

  _onFecho(e) {
    const razao = `${e?.code ?? ''} ${e?.reason ?? ''}`;
    this.sessao = null; this.sessaoPronta = false;
    if (this.estado.status === 'parado') return;
    if (MSG_LIMITE.test(razao)) return this._limite();
    if (MSG_CHAVE.test(razao)) return this._chaveInvalida();
    if (MSG_AJUSTE.test(razao) && !this.semAjustes) { this.semAjustes = true; this._log('sistema', 'Tentando sem os ajustes finos de velocidade.'); }
    this.tentativas += 1;
    if (this.cfg.modo === 'direto' || this.acordado) {
      if (this.tentativas > 4) { this._falha(new Error(`A conexão com o Gemini caiu várias vezes (${razao.trim() || 'sem detalhe'}).`)); return; }
      this._log('aviso', 'Conexão encerrada; reconectando…');
      this._set({ status: 'conectando' });
      clearTimeout(this.reconT);
      this.reconT = setTimeout(async () => {
        if (this.estado.status === 'parado') return;
        try { await this._conectar(); } catch (err) { this._erroSessao(err); this._onFecho({ reason: String(err?.message || err) }); }
      }, Math.min(500 * this.tentativas, 4000));
    }
  }

  _erroSessao(e) {
    const msg = e?.message || String(e);
    if (MSG_LIMITE.test(msg)) return this._limite();
    if (MSG_CHAVE.test(msg)) return this._chaveInvalida();
    if (this.cfg.modo === 'direto') return this._falha(e);
    this._log('aviso', `Não consegui conectar: ${msg}`);
    this._dormir();
  }

  _msg(m) {
    if (m.usageMetadata) this._contarTokens(m.usageMetadata);
    const sc = m.serverContent;
    let b64 = m.data;
    if (!b64 && sc?.modelTurn?.parts) b64 = sc.modelTurn.parts.filter((p) => p.inlineData?.data).map((p) => p.inlineData.data).join('') || undefined;
    if (b64) {
      this.saida?.tocar(base64ParaBytes(b64));
      if (this.estado.status !== 'falando') this._set({ status: 'falando' });
      this._armarIdle();
    }
    if (sc) {
      if (sc.interrupted) { this.saida?.interromper(); this._fecharLinhas(); this._set({ status: 'ouvindo' }); }
      if (sc.inputTranscription?.text) { this._acumular('voce', sc.inputTranscription.text); this._armarIdle(); }
      if (sc.outputTranscription?.text) this._acumular('bot', sc.outputTranscription.text);
      if (sc.turnComplete) { this._fecharLinhas(); this._aguardarFimDaFala(); }
    }
    if (m.toolCall?.functionCalls?.length) this._ferramentas(m.toolCall.functionCalls);
  }

  _aguardarFimDaFala() {
    clearTimeout(this.fimFalaT);
    const checar = () => {
      if (this.estado.status === 'parado' || !this.sessaoPronta) return;
      if (this.saida?.falando?.()) { this.fimFalaT = setTimeout(checar, 120); return; }
      if (this.dormirAposTurno) return this._dormir();
      this._set({ status: 'ouvindo' });
      this._armarIdle();
    };
    checar();
  }

  async _ferramentas(chamadas) {
    this._armarIdle();
    this.trabalhando = (this.trabalhando || 0) + 1;
    const respostas = [];
    for (const c of chamadas) {
      if (c.name === ENCERRAR.name) {
        this.dormirAposTurno = true;
        this._log('acao', 'encerrar conversa');
        respostas.push({ id: c.id, name: c.name, response: { result: 'ok' } });
        continue;
      }
      const t0 = Date.now();
      let r;
      try { r = await this.d.api.executar(c.name, c.args || {}); } catch (e) { r = { texto: `Erro: ${e.message}` }; }
      const args = Object.values(c.args || {}).filter((v) => v !== '' && v !== false).join(', ');
      this._log('acao', `${c.name}${args ? ` · ${args}` : ''}`, { resultado: r.texto, ms: Date.now() - t0 });
      if (r.atual !== undefined) this._set({ pasta: r.atual });
      respostas.push({ id: c.id, name: c.name, response: { result: r.texto } });
    }
    this.trabalhando -= 1;
    try { this.sessao?.sendToolResponse({ functionResponses: respostas }); } catch { /* sessão caindo */ }
    this._armarIdle();
  }

  // ---------- medidor de uso ----------
  _iniciarUso() {
    clearInterval(this.usoT);
    this.tickUso = Date.now();
    this.usoT = setInterval(() => this._flushUso(), this.d.intervaloUsoMs || 5000);
    this.usoT.unref?.(); // (Node/testes) não segura o processo aberto
    this._atualizarUso();
  }

  definirLimiteTokens(n) { if (this.cfg) this.cfg.limiteTokensDia = Number(n) || 0; this._verificarLimite(); }

  _contarTokens(u) {
    const dif = (novo, ant) => { const n = Number(novo); if (!Number.isFinite(n)) return [0, ant]; return [n >= ant ? n - ant : n, n]; };
    let d;
    [d, this.ultimoTotal] = dif(u.totalTokenCount, this.ultimoTotal); this.usoPend.tokens += d;
    [d, this.ultimaEntrada] = dif(u.promptTokenCount, this.ultimaEntrada); this.usoPend.entrada += d;
    [d, this.ultimaSaida] = dif(u.responseTokenCount, this.ultimaSaida); this.usoPend.saida += d;
  }

  async _flushUso() {
    const agora = Date.now();
    if (this.sessaoPronta && this.tickUso) this.usoPend.segundos += (agora - this.tickUso) / 1000;
    this.tickUso = agora;
    const p = this.usoPend;
    const algo = Object.values(p).some((v) => v > 0);
    if (!algo) return;
    this.usoPend = { tokens: 0, entrada: 0, saida: 0, segundos: 0, sessoes: 0, limite: 0 };
    try {
      const r = await this.d.api.uso?.registrar?.(p);
      if (r) this._set({ uso: r });
      this._verificarLimite();
    } catch { /* medidor é opcional */ }
  }

  async _atualizarUso() {
    try { const r = await this.d.api.uso?.obter?.(); if (r) { this._set({ uso: r }); this._verificarLimite(); } } catch { /* ok */ }
  }

  _verificarLimite() {
    const lim = Number(this.cfg?.limiteTokensDia) || 0, hoje = this.estado.uso?.hoje;
    if (!lim || !hoje) return;
    const pct = hoje.tokens / lim;
    const nivel = pct >= 1 ? 100 : pct >= 0.8 ? 80 : 0;
    if (nivel > (this.avisadoNivel || 0)) {
      this.avisadoNivel = nivel;
      this._set({ aviso: nivel >= 100 ? `Você passou do limite diário de tokens que definiu (${lim.toLocaleString('pt-BR')}).` : `Você já usou ${Math.round(pct * 100)}% do limite diário de tokens que definiu.` });
    }
  }

  // ---------- tempo de escuta depois de ativar ----------
  _armarIdle() {
    if (this.cfg?.modo !== 'ativacao') return;
    clearTimeout(this.idleT);
    this.idleT = setTimeout(() => {
      if (this.estado.status === 'parado' || !this.acordado) return;
      if (this.saida?.falando?.() || this.trabalhando > 0) return this._armarIdle();
      this._dormir();
    }, Math.max(0.2, this.cfg.janelaEscutaS) * 1000);
  }
}
