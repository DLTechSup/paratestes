// Reconhece o nome do assistente no texto que o reconhecedor offline "ouviu" (que erra palavras estranhas).
// Compara pelo som (fonética do português) e tolera palavras coladas/separadas ("ja vis" ≈ "jarvis").

export function normalizar(t) {
  return String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Chave aproximada de pronúncia (pt-BR). Sem espaços. */
export function chaveFonetica(texto) {
  let s = normalizar(texto).replace(/ /g, '');
  const subs = [
    [/ph/g, 'f'], [/th/g, 't'], [/w/g, 'v'], [/y/g, 'i'], [/ck/g, 'k'], [/qu/g, 'k'], [/q/g, 'k'],
    [/ch/g, 'x'], [/sh/g, 'x'], [/sc(?=[ei])/g, 's'], [/xc(?=[ei])/g, 's'], [/c(?=[ei])/g, 's'], [/c/g, 'k'],
    [/lh/g, 'li'], [/nh/g, 'ni'], [/gu(?=[ei])/g, 'g'], [/g(?=[ei])/g, 'j'], [/z/g, 's'], [/h/g, ''],
    [/[mn]$/g, 'n'], [/m(?=[bp])/g, 'n'], [/r+/g, 'r'], [/s+/g, 's'], [/(.)\1+/g, '$1'],
  ];
  for (const [re, por] of subs) s = s.replace(re, por);
  // vogais átonas finais variam muito no reconhecimento ("jarvis" / "jarvisa"): não tratamos além disso
  return s;
}

function dist(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const sim = (a, b) => { const mx = Math.max(a.length, b.length); return mx ? 1 - dist(a, b) / mx : 1; };

export const SENSIBILIDADE = { rigida: 0.88, normal: 0.78, flexivel: 0.68 };

/** Devolve a melhor semelhança (0..1) entre o nome e qualquer trecho do texto. */
export function melhorSemelhanca(texto, nome) {
  const alvo = normalizar(nome);
  const palavras = normalizar(texto).split(' ').filter(Boolean);
  if (!alvo || !palavras.length) return 0;
  const alvoJunto = alvo.replace(/ /g, '');
  const fAlvo = chaveFonetica(alvo);
  const nTok = alvo.split(' ').length;
  let melhor = 0;
  for (let tam = Math.max(1, nTok - 1); tam <= nTok + 1; tam++) {
    for (let i = 0; i + tam <= palavras.length; i++) {
      const cand = palavras.slice(i, i + tam).join('');
      if (cand.length < Math.max(2, alvoJunto.length - 3)) continue;
      melhor = Math.max(melhor, sim(cand, alvoJunto), sim(chaveFonetica(cand), fAlvo));
    }
  }
  return melhor;
}

/** true se o texto contém o nome (com a tolerância escolhida). */
export function casaNome(texto, nome, sensibilidade = 'normal') {
  const alvo = normalizar(nome);
  if (alvo.length < 2) return false;
  let limiar = SENSIBILIDADE[sensibilidade] ?? SENSIBILIDADE.normal;
  if (alvo.replace(/ /g, '').length <= 4) limiar = Math.min(0.95, limiar + 0.1); // nomes curtos: mais exigente (evita falso alarme)
  return melhorSemelhanca(texto, nome) >= limiar;
}
