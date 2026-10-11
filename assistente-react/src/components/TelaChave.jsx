import React, { useState } from 'react';
import { api } from '../api.js';
import { IcChave, IcOlho } from './Icones.jsx';
import { limparChave } from '../util.js';

export default function TelaChave({ aviso, onSalvar, onCancelar }) {
  const [valor, setValor] = useState('');
  const [ver, setVer] = useState(false);
  const [msg, setMsg] = useState(aviso || '');
  const colar = async () => { try { setValor((await navigator.clipboard.readText()).trim()); setMsg(''); } catch { setMsg('Não consegui ler a área de transferência. Clique no campo e use Ctrl+V.'); } };
  const salvar = () => {
    const k = limparChave(valor);
    if (!k) { setMsg('Isso não parece uma chave do Gemini. Ela é uma sequência longa, sem espaços (começa com AIza… ou AQ.…). Copie a chave inteira.'); return; }
    onSalvar(k);
  };
  return (
    <div className="tela-chave">
      <div className="cartao-chave">
        <div className="icone-grande"><IcChave size={30} /></div>
        <h2>Cole a sua chave do Gemini</h2>
        <p>É ela que dá ao assistente a voz natural. Fica guardada só neste computador, criptografada.</p>
        <div className="campo-chave">
          <input autoFocus type={ver ? 'text' : 'password'} value={valor} placeholder="AIza…" spellCheck={false} autoComplete="off"
            onChange={(e) => { setValor(e.target.value); setMsg(''); }} onKeyDown={(e) => e.key === 'Enter' && salvar()} />
          <button className="icone-btn" title={ver ? 'Esconder' : 'Mostrar'} onClick={() => setVer(!ver)}><IcOlho size={18} /></button>
          <button className="btn btn-sec btn-pequeno" onClick={colar}>Colar</button>
        </div>
        {msg && <p className="erro-chave" role="alert">{msg}</p>}
        <div className="acoes-chave">
          <button className="btn btn-iniciar" onClick={salvar}>Salvar e começar</button>
          {onCancelar && <button className="btn btn-sec" onClick={onCancelar}>Cancelar</button>}
        </div>
        <button className="link-chave" onClick={() => api.abrirExterno('https://aistudio.google.com/apikey')}>Ainda não tenho a chave — criar grátis no Google AI Studio</button>
      </div>
    </div>
  );
}
