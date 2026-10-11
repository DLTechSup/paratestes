'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const CANAIS = new Set(['atalho:acordar', 'tray:alternar', 'modelo:progresso']);
const inv = (canal, ...a) => ipcRenderer.invoke(canal, ...a);

contextBridge.exposeInMainWorld('api', {
  cfg: { obter: () => inv('cfg:get'), salvar: (p) => inv('cfg:set', p) },
  chave: { obter: () => inv('key:get'), salvar: (k) => inv('key:set', k), limpar: () => inv('key:clear') },
  ferramentas: () => inv('tools:list'),
  executar: (nome, args) => inv('tool:run', nome, args),
  janela: { minimizar: () => inv('janela:minimizar'), fechar: () => inv('janela:fechar'), sair: () => inv('janela:sair') },
  info: () => inv('app:info'),
  escolherPasta: () => inv('dialog:pasta'),
  abrirExterno: (url) => inv('abrir:externo', url),
  uso: { registrar: (d) => inv('uso:registrar', d), obter: () => inv('uso:obter') },
  modelo: { estado: () => inv('modelo:estado'), garantir: () => inv('modelo:garantir') },
  status: (s) => ipcRenderer.send('status', s),
  on: (canal, fn) => {
    if (!CANAIS.has(canal)) return () => {};
    const h = (_e, ...a) => fn(...a);
    ipcRenderer.on(canal, h);
    return () => ipcRenderer.removeListener(canal, h);
  },
});
