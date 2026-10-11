import React, { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { motor as obterMotor, useConfig, useInfo, useMotor } from './hooks.js';
import TitleBar from './components/TitleBar.jsx';
import Controle from './components/Controle.jsx';
import Conversa from './components/Conversa.jsx';
import Pastas from './components/Pastas.jsx';
import Ajustes from './components/Ajustes.jsx';
import TelaChave from './components/TelaChave.jsx';
import { IcChat, IcPasta, IcAjustes } from './components/Icones.jsx';

const ABAS = [['conversa', 'Conversa', IcChat], ['pastas', 'Pastas', IcPasta], ['ajustes', 'Ajustes', IcAjustes]];
const nomeAtalho = { 'Control+Alt+Space': 'Ctrl + Alt + Espaço', 'Control+Shift+Space': 'Ctrl + Shift + Espaço', F9: 'F9' };

export default function App() {
  const [m, estado] = useMotor();
  const [cfg, salvar, recarregar] = useConfig();
  const info = useInfo();
  const [aba, setAba] = useState('conversa');
  const [trocandoChave, setTrocandoChave] = useState(false);
  const iniciou = useRef(false);

  // atalho global e menu da bandeja
  useEffect(() => {
    const a = api.on('atalho:acordar', () => obterMotor().alternarChamada('atalho'));
    const b = api.on('tray:alternar', () => { const mm = obterMotor(); mm.obter().status === 'parado' ? mm.iniciar() : mm.parar(); });
    return () => { a(); b(); };
  }, []);

  // começa a ouvir sozinho ao abrir (se a chave já existe)
  useEffect(() => {
    if (!cfg || iniciou.current) return;
    iniciou.current = true;
    if (cfg.temChave && cfg.iniciarEscutando) m.iniciar();
  }, [cfg, m]);

  if (!cfg) return <div className="app"><TitleBar /></div>;

  const pedirChave = !cfg.temChave || estado.erro?.tipo === 'chaveInvalida' || trocandoChave;
  const salvarChave = async (k) => {
    await api.chave.salvar(k);
    await recarregar();
    setTrocandoChave(false);
    m._set({ erro: null });
    if (m.obter().status === 'parado') m.iniciar(); else m.reiniciar();
  };

  return (
    <div className="app">
      <TitleBar admin={info ? info.admin : null} uso={estado.uso} limite={cfg.limiteTokensDia} onUso={() => setAba('ajustes')} />
      {pedirChave ? (
        <TelaChave aviso={estado.erro?.tipo === 'chaveInvalida' ? estado.erro.msg : ''} onSalvar={salvarChave} onCancelar={cfg.temChave && estado.erro?.tipo !== 'chaveInvalida' ? () => setTrocandoChave(false) : null} />
      ) : (
        <main className="corpo">
          <Controle motor={m} estado={estado} cfg={cfg} salvar={salvar} atalhoTexto={nomeAtalho[cfg.atalhoGlobal] || cfg.atalhoGlobal} />
          <section className="painel painel-abas">
            <nav className="abas" role="tablist">
              {ABAS.map(([id, rot, Ic]) => (
                <button key={id} role="tab" aria-selected={aba === id} className={`aba ${aba === id ? 'on' : ''}`} onClick={() => setAba(id)}><Ic size={16} /> {rot}</button>
              ))}
            </nav>
            {((estado.erro && estado.erro.tipo !== 'chaveInvalida') || estado.aviso) && (
              <div className={`faixa ${estado.erro ? 'faixa-erro' : 'faixa-aviso'}`} role="alert">
                {estado.erro?.msg || estado.aviso}
                {estado.erro?.tipo === 'limite' && <button className="faixa-link" onClick={() => api.abrirExterno('https://aistudio.google.com/usage')}>Ver meu uso no Google ↗</button>}
                <button className="faixa-x" onClick={() => m._set({ erro: null, aviso: null })} aria-label="Fechar aviso">×</button>
              </div>
            )}
            <div className="aba-conteudo">
              {aba === 'conversa' && <Conversa logs={estado.logs} nome={cfg.modo === 'ativacao' ? cfg.nome : ''} onLimpar={() => m.limparLogs()} />}
              {aba === 'pastas' && <Pastas cfg={cfg} salvar={salvar} />}
              {aba === 'ajustes' && <Ajustes cfg={cfg} salvar={salvar} info={info} motor={m} uso={estado.uso} ativa onTrocarChave={() => setTrocandoChave(true)} />}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
