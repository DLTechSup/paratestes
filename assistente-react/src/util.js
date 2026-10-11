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

/**
 * Limpa e valida a chave colada. Aceita os dois formatos do Google: antigo (AIza…) e novo (AQ.…, com ponto).
 * Devolve a chave limpa ou '' se não parecer uma chave (curta demais, ou com cara de frase).
 */
export function limparChave(texto) {
  let k = String(texto ?? '').trim();
  k = k.replace(/^[A-Z][A-Z0-9_]*\s*=\s*/, '') // GEMINI_API_KEY=... (copiado de um arquivo .env)
    .replace(/^(bearer|key|api[_ -]?key)\s*[:=]?\s*/i, '').replace(/^["'`]+|["'`]+$/g, '');
  if (/\s/.test(k)) k = k.replace(/\s+/g, ''); // quebras de linha/espaços que vieram junto na colagem
  return /^[A-Za-z0-9._~+/=-]{20,}$/.test(k) ? k : '';
}
