import React, { useEffect, useState } from 'react';
import Orb from './Orb.jsx';
import { IcPlay, IcStop, IcSino, IcOuvido, IcPasta, IcRaio, IcSeta } from './Icones.jsx';

const TEXTOS = (nome) => ({
  parado: ['Parado', 'Clique em Iniciar para começar'],
  dormindo: [`Diga “${nome}”`, 'Estou aguardando você me chamar'],
  conectando: ['Conectando…', 'Só um instante'],
  ouvindo: ['Estou ouvindo', 'Pode falar o comando'],
  falando: ['Falando…', 'Pode me interromper'],
});

export default function Controle({ motor, estado, cfg, salvar, atalhoTexto }) {
  const [nome, setNome] = useState(cfg.nome);
  useEffect(() => setNome(cfg.nome), [cfg.nome]);
  const [titulo, sub] = TEXTOS(estado.nome || cfg.nome)[estado.status] || ['', ''];
  const rodando = estado.status !== 'parado';
  const ativacao = cfg.modo === 'ativacao';
  const mw = estado.modeloWake;
  const preparando = mw && ['baixando', 'preparando', 'carregando'].includes(mw.fase);
  const nomeMudou = nome.trim() && nome.trim() !== cfg.nome;

  return (
    <aside className="painel painel-controle">
      <Orb status={estado.status} motor={motor} />
      <h1 className="status-titulo">{titulo}</h1>
      <p className="status-sub">{sub}</p>

      {preparando && (
        <div className="progresso" role="status">
          <div className="progresso-barra"><div style={{ width: `${mw.fase === 'carregando' ? 100 : mw.pct}%` }} className={mw.fase === 'carregando' ? 'indet' : ''} /></div>
          <small>{mw.fase === 'baixando' ? `Baixando o reconhecimento do nome (só na 1ª vez)… ${mw.pct}%`
            : mw.fase === 'preparando' ? 'Preparando…' : 'Carregando o reconhecimento do nome…'}</small>
        </div>
      )}

      <div className="acoes">
        <button className={`btn ${rodando ? 'btn-parar' : 'btn-iniciar'}`} onClick={() => (rodando ? motor.parar() : motor.iniciar())}>
          {rodando ? <><IcStop size={16} /> Parar</> : <><IcPlay size={16} /> Iniciar</>}
        </button>
        {rodando && ativacao && (
          <button className="btn btn-sec" onClick={() => motor.alternarChamada('atalho')} title={atalhoTexto ? `Atalho: ${atalhoTexto}` : ''}>
            <IcRaio size={16} /> {estado.status === 'dormindo' ? 'Chamar agora' : 'Dispensar'}
          </button>
        )}
      </div>
      {rodando && ativacao && atalhoTexto && <p className="dica">ou pressione <kbd>{atalhoTexto}</kbd> em qualquer programa</p>}

      <div className="grupo">
        <span className="rotulo">Como me chamar</span>
        <div className="modos" role="radiogroup">
          <button role="radio" aria-checked={ativacao} className={`modo ${ativacao ? 'on' : ''}`} onClick={() => salvar({ modo: 'ativacao' }).then(() => motor.reiniciar())}>
            <IcSino size={18} /><b>Palavra de ativação</b><small>Só ouço depois que você disser meu nome</small>
          </button>
          <button role="radio" aria-checked={!ativacao} className={`modo ${!ativacao ? 'on' : ''}`} onClick={() => salvar({ modo: 'direto' }).then(() => motor.reiniciar())}>
            <IcOuvido size={18} /><b>Ouvir direto</b><small>Fico escutando o tempo todo</small>
          </button>
        </div>
      </div>

      <div className={`grupo ${ativacao ? '' : 'apagado'}`}>
        <label className="rotulo" htmlFor="nome">Nome do assistente</label>
        <form className="campo-acao" onSubmit={(e) => { e.preventDefault(); if (nomeMudou) salvar({ nome: nome.trim() }).then(() => motor.reiniciar()); }}>
          <input id="nome" value={nome} maxLength={24} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Luna, Jarvis, Bia" disabled={!ativacao} />
          <button type="submit" className="btn btn-pequeno" disabled={!nomeMudou || !ativacao}><IcSeta size={16} /></button>
        </form>
        <small className="dica-campo">Escolha um nome de 2 a 3 sílabas, fácil de falar.</small>
      </div>

      {estado.pasta && (
        <div className="chip-pasta" title={estado.pasta}><IcPasta size={16} /><span>{estado.pasta}</span></div>
      )}
    </aside>
  );
}
