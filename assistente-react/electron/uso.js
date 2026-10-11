'use strict';
/** Contador local de uso do Gemini (por dia). O Google não informa a cota restante, então isto é uma ESTIMATIVA do app. */
const fs = require('fs');
const path = require('path');

const CAMPOS = ['tokens', 'entrada', 'saida', 'segundos', 'sessoes', 'limites'];
const pad = (n) => String(n).padStart(2, '0');
const chaveDia = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const vazio = () => Object.fromEntries(CAMPOS.map((c) => [c, 0]));

class Uso {
  constructor(dir, agora = () => new Date()) {
    this.arq = path.join(dir, 'uso.json');
    this.agora = agora;
    this.dados = { dias: {}, ultimoLimite: null };
    try { this.dados = { ...this.dados, ...JSON.parse(fs.readFileSync(this.arq, 'utf8')) }; } catch { /* primeira vez */ }
  }

  registrar(delta = {}) {
    const dia = chaveDia(this.agora());
    const x = (this.dados.dias[dia] ||= vazio());
    for (const c of CAMPOS) { const v = Number(delta[c]); if (Number.isFinite(v) && v > 0) x[c] += v; }
    if (Number(delta.limite) > 0) { x.limites += Number(delta.limite); this.dados.ultimoLimite = this.agora().getTime(); }
    const corte = chaveDia(new Date(this.agora().getTime() - 35 * 86400000));
    for (const k of Object.keys(this.dados.dias)) if (k < corte) delete this.dados.dias[k];
    this._gravar();
    return this.resumo();
  }

  resumo() {
    const ultimos7 = [];
    for (let i = 6; i >= 0; i--) {
      const dia = chaveDia(new Date(this.agora().getTime() - i * 86400000));
      ultimos7.push({ dia, ...vazio(), ...(this.dados.dias[dia] || {}) });
    }
    return { hoje: ultimos7[6], ultimos7, ultimoLimite: this.dados.ultimoLimite };
  }

  _gravar() {
    try { fs.mkdirSync(path.dirname(this.arq), { recursive: true }); fs.writeFileSync(this.arq, JSON.stringify(this.dados), 'utf8'); } catch { /* sem disco: segue */ }
  }
}

module.exports = { Uso, chaveDia };
