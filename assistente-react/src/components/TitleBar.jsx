import React from 'react';
import { api } from '../api.js';
import { IcMic, IcMin, IcX, IcEscudo, IcMedidor } from './Icones.jsx';
import { fmtTempo, fmtTokens, nivelUso } from '../util.js';

export default function TitleBar({ admin, uso, limite, onUso }) {
  const n = nivelUso(uso, limite);
  return (
    <header className="titulo-barra">
      <div className="titulo-marca"><span className="logo"><IcMic size={15} /></span> Assistente de Voz</div>
      <div className="titulo-dir">
        {uso && (
          <button className={`medidor medidor-${n.nivel}`} onClick={onUso} title={`Uso do Gemini hoje (estimativa do app)${limite > 0 ? ` — ${n.pct}% do limite que você definiu` : ''}. Clique para ver detalhes.`}>
            <IcMedidor size={14} />
            <span>{n.texto && n.nivel !== 'ok' ? n.texto : `${fmtTempo(uso.hoje.segundos)} · ${fmtTokens(uso.hoje.tokens)} tokens`}</span>
            {limite > 0 && <i className="medidor-barra"><b style={{ width: `${Math.min(100, n.pct)}%` }} /></i>}
          </button>
        )}
        {admin != null && <span className={`selo selo-mini ${admin ? 'ok' : 'alerta'}`}><IcEscudo size={13} /> {admin ? 'Administrador' : 'Sem administrador'}</span>}
        <button className="jan-btn" aria-label="Minimizar" title="Minimizar para a bandeja" onClick={() => api.janela.minimizar()}><IcMin size={16} /></button>
        <button className="jan-btn jan-fechar" aria-label="Fechar" title="Fechar" onClick={() => api.janela.fechar()}><IcX size={16} /></button>
      </div>
    </header>
  );
}
