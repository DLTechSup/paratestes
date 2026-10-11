'use strict';
const fs = require('fs');
const path = require('path');

const PADRAO = {
  nome: 'Assistente',          // palavra de ativação
  modo: 'ativacao',            // 'ativacao' (espera o nome) | 'direto' (ouve o tempo todo)
  sensibilidade: 'normal',     // 'rigida' | 'normal' | 'flexivel'
  janelaEscutaS: 10,           // quanto tempo continua ouvindo depois de ativar, sem você falar
  micId: '', saidaId: '', fones: false,
  voz: '', modelo: 'gemini-3.1-flash-live-preview',
  minimizarParaBandeja: true, iniciarComWindows: false, iniciarMinimizado: true, iniciarEscutando: true,
  atalhoGlobal: 'Control+Alt+Space',
  limiteTokensDia: 0,          // opcional: limite diário (tokens) que VOCÊ definiu, para o medidor avisar
  pastas: { atalhos: {}, pastasDeAtalhos: [], raizes: [] },
  chaveEnc: '',
};

class Config {
  constructor(dir, safeStorage) {
    this.arq = path.join(dir, 'config.json');
    this.safe = safeStorage;
    this.dados = { ...PADRAO, pastas: { ...PADRAO.pastas } };
    try {
      const lido = JSON.parse(fs.readFileSync(this.arq, 'utf8'));
      this.dados = { ...this.dados, ...lido, pastas: { ...PADRAO.pastas, ...(lido.pastas || {}) } };
    } catch { /* primeira execução */ }
  }

  _gravar() {
    fs.mkdirSync(path.dirname(this.arq), { recursive: true });
    fs.writeFileSync(this.arq, JSON.stringify(this.dados, null, 2), 'utf8');
  }

  get() { return this.dados; }

  set(patch) {
    const { chaveEnc, ...resto } = patch || {};
    this.dados = { ...this.dados, ...resto, pastas: resto.pastas ? { ...this.dados.pastas, ...resto.pastas } : this.dados.pastas };
    this._gravar();
    return this.publico();
  }

  publico() {
    const { chaveEnc, ...resto } = this.dados;
    return { ...resto, temChave: !!chaveEnc };
  }

  salvarChave(chave) {
    const k = String(chave || '').trim();
    if (!k) { this.dados.chaveEnc = ''; this._gravar(); return; }
    const usar = this.safe && this.safe.isEncryptionAvailable();
    this.dados.chaveEnc = usar ? 'enc:' + this.safe.encryptString(k).toString('base64') : 'raw:' + Buffer.from(k, 'utf8').toString('base64');
    this._gravar();
  }

  lerChave() {
    const v = this.dados.chaveEnc || '';
    try {
      if (v.startsWith('enc:')) return this.safe.decryptString(Buffer.from(v.slice(4), 'base64'));
      if (v.startsWith('raw:')) return Buffer.from(v.slice(4), 'base64').toString('utf8');
    } catch { /* chave ilegível: pede de novo */ }
    return '';
  }
}

module.exports = { Config, PADRAO };
