const nf = (n, casas) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

export function fmtTokens(n = 0) {
  n = Math.round(n || 0);
  if (n < 1000) return String(n);
  if (n < 1e6) return `${nf(n / 1000, n < 10000 ? 1 : 0)} mil`;
  return `${nf(n / 1e6, 2)} mi`;
}

export function fmtTempo(seg = 0) {
  seg = Math.round(seg || 0);
  if (seg < 60) return `${seg} s`;
  const min = Math.round(seg / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

/** Nível do medidor: 'ok' | 'atencao' | 'perigo' (+ texto). Usa o limite que o usuário definiu e o aviso real do Google. */
export function nivelUso(uso, limite) {
  const hoje = uso?.hoje;
  if (uso?.ultimoLimite && Date.now() - uso.ultimoLimite < 3600000) return { nivel: 'perigo', pct: 100, texto: 'Limite atingido' };
  if (!hoje) return { nivel: 'ok', pct: 0, texto: '' };
  if (limite > 0) {
    const pct = Math.min(999, Math.round((hoje.tokens / limite) * 100));
    return { nivel: pct >= 90 ? 'perigo' : pct >= 70 ? 'atencao' : 'ok', pct, texto: `${pct}% do limite` };
  }
  return { nivel: 'ok', pct: 0, texto: '' };
}
