// Ponte com o Electron (window.api). No navegador comum (pré-visualização) usa uma versão de mentira.
const mem = { cfg: { nome: 'Assistente', modo: 'ativacao', sensibilidade: 'normal', janelaEscutaS: 10, micId: '', saidaId: '', fones: false, voz: '',
  modelo: 'gemini-3.1-flash-live-preview', minimizarParaBandeja: true, iniciarComWindows: false, iniciarMinimizado: true, iniciarEscutando: true,
  atalhoGlobal: 'Control+Alt+Space', pastas: { atalhos: {}, pastasDeAtalhos: [], raizes: [] }, temChave: false }, chave: '' };

const demo = typeof location !== 'undefined' && /[?&]demo/.test(location.search);
if (demo) { mem.cfg.temChave = true; mem.chave = 'AIzaDEMO'; mem.cfg.nome = 'Luna'; mem.cfg.pastas.atalhos = { 'lançamentos': 'D:\\Trabalho\\Lançamentos', 'projetos': 'D:\\Projetos' }; }

const usoMock = () => {
  const dias = [12000, 48000, 0, 91000, 150000, 64000, 238000];
  const ultimos7 = dias.map((tokens, i) => ({ dia: `2026-10-0${i + 5}`, tokens, entrada: tokens * 0.6, saida: tokens * 0.4, segundos: tokens / 60, sessoes: tokens ? 3 + i : 0, limites: 0 }));
  return { hoje: demo ? ultimos7[6] : { ...ultimos7[6], tokens: 0, segundos: 0, sessoes: 0 }, ultimos7: demo ? ultimos7 : ultimos7.map((d) => ({ ...d, tokens: 0, segundos: 0 })), ultimoLimite: null };
};

const falso = {
  cfg: { obter: async () => ({ ...mem.cfg }), salvar: async (p) => { mem.cfg = { ...mem.cfg, ...p }; return { ...mem.cfg }; } },
  chave: { obter: async () => mem.chave, salvar: async (k) => { mem.chave = k; mem.cfg.temChave = !!k; return { ...mem.cfg }; }, limpar: async () => { mem.chave = ''; mem.cfg.temChave = false; return { ...mem.cfg }; } },
  ferramentas: async () => [],
  executar: async (n) => ({ texto: `(demonstração) ${n}`, atual: null }),
  janela: { minimizar: async () => {}, fechar: async () => {}, sair: async () => {} },
  info: async () => ({ admin: true, empacotado: false, versao: '2.0.0', plataforma: 'win32', dados: '' }),
  escolherPasta: async () => 'D:\\Nova pasta',
  abrirExterno: async (u) => window.open(u, '_blank'),
  uso: { registrar: async () => usoMock(), obter: async () => usoMock() },
  modelo: { estado: async () => ({ pronto: true }), garantir: async () => ({ ok: true }) },
  status: () => {},
  on: () => () => {},
  _falso: true,
};

export const api = (typeof window !== 'undefined' && window.api) || falso;
