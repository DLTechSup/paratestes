import React, { useState } from 'react';
import { api } from '../api.js';
import { IcPasta, IcMais, IcLixo, IcRaio } from './Icones.jsx';

function Lista({ itens, onRemover, vazio }) {
  if (!itens.length) return <p className="vazio-mini">{vazio}</p>;
  return (
    <ul className="lista-caminhos">
      {itens.map(([k, v, extra]) => (
        <li key={k + v}>
          <IcPasta size={16} />
          <div className="cam-texto"><b>{k}</b>{v && <span title={v}>{v}</span>}{extra}</div>
          <button className="icone-btn" title="Remover" onClick={() => onRemover(k)}><IcLixo size={16} /></button>
        </li>
      ))}
    </ul>
  );
}

export default function Pastas({ cfg, salvar }) {
  const p = cfg.pastas || {};
  const [nome, setNome] = useState('');
  const [caminho, setCaminho] = useState('');
  const [testes, setTestes] = useState({});

  const escolher = async (setter) => { const c = await api.escolherPasta(); if (c) setter(c); };
  const gravar = (novo) => salvar({ pastas: { ...p, ...novo } });
  const adicionar = () => {
    if (!nome.trim() || !caminho.trim()) return;
    gravar({ atalhos: { ...(p.atalhos || {}), [nome.trim().toLowerCase()]: caminho.trim() } });
    setNome(''); setCaminho('');
  };
  const testar = async (n) => {
    setTestes((t) => ({ ...t, [n]: '…' }));
    const r = await api.executar('abrir_pasta', { nome: n, na_raiz: true });
    setTestes((t) => ({ ...t, [n]: r.texto }));
  };

  const atalhos = Object.entries(p.atalhos || {}).map(([k, v]) => [k, v, (
    <span className="teste" key="t">
      <button className="link-mini" onClick={() => testar(k)}><IcRaio size={13} /> Testar</button>
      {testes[k] && <em>{testes[k]}</em>}
    </span>
  )]);

  return (
    <div className="aba-pastas">
      <section>
        <h3>Atalhos de pastas</h3>
        <p className="explica">Dê um nome falado a uma pasta (ex.: <b>lançamentos</b>). Ao dizer “abra a pasta lançamentos”, ela abre — e as subpastas e referências são procuradas lá dentro.</p>
        <Lista itens={atalhos} vazio="Nenhum atalho ainda. Seus atalhos da Área de Trabalho já funcionam sozinhos." onRemover={(k) => { const a = { ...(p.atalhos || {}) }; delete a[k]; gravar({ atalhos: a }); }} />
        <div className="form-linha">
          <input placeholder="Nome falado (ex.: lançamentos)" value={nome} onChange={(e) => setNome(e.target.value)} />
          <input placeholder="Caminho da pasta" value={caminho} onChange={(e) => setCaminho(e.target.value)} />
          <button className="btn btn-sec btn-pequeno" onClick={() => escolher(setCaminho)}>Escolher…</button>
          <button className="btn btn-iniciar btn-pequeno" onClick={adicionar} disabled={!nome.trim() || !caminho.trim()}><IcMais size={16} /> Adicionar</button>
        </div>
      </section>
      <section>
        <h3>Outras pastas com atalhos</h3>
        <p className="explica">Pastas cheias de atalhos (.lnk) ou subpastas que você quer abrir pelo nome.</p>
        <Lista itens={(p.pastasDeAtalhos || []).map((c) => [c, ''])} vazio="Nenhuma." onRemover={(c) => gravar({ pastasDeAtalhos: (p.pastasDeAtalhos || []).filter((x) => x !== c) })} />
        <button className="btn btn-sec btn-pequeno" onClick={async () => { const c = await api.escolherPasta(); if (c) gravar({ pastasDeAtalhos: [...(p.pastasDeAtalhos || []), c] }); }}><IcMais size={16} /> Adicionar pasta</button>
      </section>
      <section>
        <h3>Onde procurar pastas pelo nome</h3>
        <p className="explica">Vazio = suas pastas do Windows e os discos D: a H:. Adicione aqui se quiser limitar (ou incluir outro disco).</p>
        <Lista itens={(p.raizes || []).map((c) => [c, ''])} vazio="Usando o padrão." onRemover={(c) => gravar({ raizes: (p.raizes || []).filter((x) => x !== c) })} />
        <button className="btn btn-sec btn-pequeno" onClick={async () => { const c = await api.escolherPasta(); if (c) gravar({ raizes: [...(p.raizes || []), c] }); }}><IcMais size={16} /> Adicionar disco/pasta</button>
      </section>
    </div>
  );
}
