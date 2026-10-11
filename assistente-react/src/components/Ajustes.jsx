import React from 'react';
import { useDispositivos } from '../hooks.js';
import { IcChave, IcEscudo, IcExterno } from './Icones.jsx';
import { api } from '../api.js';
import { fmtTempo, fmtTokens, nivelUso } from '../util.js';

const VOZES = ['', 'Aoede', 'Kore', 'Leda', 'Zephyr', 'Puck', 'Charon', 'Fenrir', 'Orus'];
const ATALHOS = [['Control+Alt+Space', 'Ctrl + Alt + Espaço'], ['Control+Shift+Space', 'Ctrl + Shift + Espaço'], ['F9', 'F9'], ['', 'Desligado']];

const Linha = ({ titulo, desc, children }) => (
  <div className="ajuste"><div className="aj-texto"><b>{titulo}</b>{desc && <small>{desc}</small>}</div><div className="aj-ctrl">{children}</div></div>
);
const Chave = ({ valor, onChange, id }) => (
  <button id={id} role="switch" aria-checked={!!valor} className={`switch ${valor ? 'on' : ''}`} onClick={() => onChange(!valor)}><i /></button>
);

const DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function Uso({ uso, limite, onLimite }) {
  if (!uso) return null;
  const { hoje, ultimos7 } = uso;
  const n = nivelUso(uso, limite);
  const max = Math.max(1, ...ultimos7.map((d) => d.tokens));
  return (
    <section>
      <h3>Uso do Gemini</h3>
      <p className="explica">O Google <b>não informa</b> quanto resta da sua cota; estes números são a <b>estimativa do app</b> (tempo conectado e tokens informados pelo servidor). Se o Google avisar que o limite acabou, o app mostra na hora.</p>
      <div className="tiles">
        <div className="tile"><small>Conectado hoje</small><b>{fmtTempo(hoje.segundos)}</b></div>
        <div className="tile"><small>Tokens hoje</small><b>{fmtTokens(hoje.tokens)}</b></div>
        <div className="tile"><small>Conversas hoje</small><b>{hoje.sessoes}</b></div>
        <div className={`tile ${hoje.limites ? 'tile-alerta' : ''}`}><small>Avisos de limite</small><b>{hoje.limites}</b></div>
      </div>
      {limite > 0 && (
        <div className={`barra-limite barra-${n.nivel}`} role="progressbar" aria-valuenow={Math.min(100, n.pct)} aria-valuemin="0" aria-valuemax="100">
          <div style={{ width: `${Math.min(100, n.pct)}%` }} /><span>{fmtTokens(hoje.tokens)} de {fmtTokens(limite)} tokens ({n.pct}%)</span>
        </div>
      )}
      <div className="grafico" aria-label="Tokens por dia, últimos 7 dias">
        {ultimos7.map((d) => {
          const dt = new Date(`${d.dia}T12:00:00`);
          return (
            <div key={d.dia} className="coluna" title={`${d.dia}: ${fmtTokens(d.tokens)} tokens · ${fmtTempo(d.segundos)}`}>
              <div className="coluna-barra"><i style={{ height: `${Math.max(d.tokens ? 6 : 2, (d.tokens / max) * 100)}%` }} className={d.dia === hoje.dia ? 'hoje' : ''} /></div>
              <small>{DIA[dt.getDay()]}</small>
            </div>
          );
        })}
      </div>
      <Linha titulo="Meu limite diário de tokens (opcional)" desc="Veja o limite real da sua conta na página de uso do Google e digite aqui. O app avisa aos 80% e 100%.">
        <input className="txt" type="number" min="0" step="10000" placeholder="0 = sem limite" value={limite || ''} onChange={(e) => onLimite(Math.max(0, Number(e.target.value) || 0))} />
      </Linha>
      <button className="btn btn-sec btn-pequeno" onClick={() => api.abrirExterno('https://aistudio.google.com/usage')}><IcExterno size={15} /> Ver meu uso oficial no Google AI Studio</button>
    </section>
  );
}

export default function Ajustes({ cfg, salvar, info, motor, onTrocarChave, ativa, uso }) {
  const { entradas, saidas } = useDispositivos(ativa);
  const motorAfetado = async (patch) => { await salvar(patch); if (motor.obter().status !== 'parado') motor.reiniciar(); };
  const sel = (valor, lista, chave) => (
    <select value={valor || ''} onChange={(e) => motorAfetado({ [chave]: e.target.value })}>
      <option value="">Padrão do Windows</option>
      {lista.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
    </select>
  );
  const podeAutoStart = info?.plataforma === 'win32' && info?.empacotado;

  return (
    <div className="aba-ajustes">
      <Uso uso={uso} limite={cfg.limiteTokensDia} onLimite={(v) => { salvar({ limiteTokensDia: v }); motor.definirLimiteTokens(v); }} />
      <section>
        <h3>Voz e áudio</h3>
        <Linha titulo="Microfone">{sel(cfg.micId, entradas, 'micId')}</Linha>
        <Linha titulo="Saída de som">{sel(cfg.saidaId, saidas, 'saidaId')}</Linha>
        <Linha titulo="Estou usando fones de ouvido" desc="Permite me interromper falando por cima. Sem fones, o microfone pausa enquanto eu falo, para não me ouvir.">
          <Chave valor={cfg.fones} onChange={(v) => motorAfetado({ fones: v })} />
        </Linha>
        <Linha titulo="Voz do assistente"><select value={cfg.voz || ''} onChange={(e) => motorAfetado({ voz: e.target.value })}>
          {VOZES.map((v) => <option key={v} value={v}>{v || 'Padrão'}</option>)}</select></Linha>
      </section>
      <section>
        <h3>Palavra de ativação</h3>
        <Linha titulo="Sensibilidade" desc="Se ele não responde ao nome, use Flexível. Se ativa sozinho, use Rigorosa.">
          <select value={cfg.sensibilidade} onChange={(e) => motorAfetado({ sensibilidade: e.target.value })}>
            <option value="rigida">Rigorosa</option><option value="normal">Normal</option><option value="flexivel">Flexível</option></select>
        </Linha>
        <Linha titulo={`Continuar ouvindo por ${cfg.janelaEscutaS} s`} desc="Depois que eu atender, fico ouvindo por esse tempo antes de voltar a dormir.">
          <input type="range" min="5" max="40" step="1" value={cfg.janelaEscutaS} onChange={(e) => salvar({ janelaEscutaS: Number(e.target.value) })} onMouseUp={() => motor.obter().status !== 'parado' && motor.reiniciar()} />
        </Linha>
        <Linha titulo="Atalho para chamar" desc="Funciona em qualquer programa, mesmo com a janela escondida.">
          <select value={cfg.atalhoGlobal} onChange={(e) => salvar({ atalhoGlobal: e.target.value })}>
            {ATALHOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        </Linha>
      </section>
      <section>
        <h3>Janela e Windows</h3>
        <Linha titulo="Minimizar e fechar vão para a bandeja" desc="O assistente continua ouvindo ao lado do relógio.">
          <Chave valor={cfg.minimizarParaBandeja} onChange={(v) => salvar({ minimizarParaBandeja: v })} /></Linha>
        <Linha titulo="Começar a ouvir ao abrir"><Chave valor={cfg.iniciarEscutando} onChange={(v) => salvar({ iniciarEscutando: v })} /></Linha>
        <Linha titulo="Iniciar com o Windows" desc={podeAutoStart ? 'Abre escondido na bandeja quando você entra no Windows.' : 'Disponível na versão instalada (.exe).'}>
          <Chave valor={cfg.iniciarComWindows && podeAutoStart} onChange={(v) => podeAutoStart && salvar({ iniciarComWindows: v })} /></Linha>
        <Linha titulo="Abrir já minimizado"><Chave valor={cfg.iniciarMinimizado} onChange={(v) => salvar({ iniciarMinimizado: v })} /></Linha>
      </section>
      <section>
        <h3>Conta e sistema</h3>
        <Linha titulo="Chave do Gemini" desc="Fica salva só neste computador, criptografada."><button className="btn btn-sec btn-pequeno" onClick={onTrocarChave}><IcChave size={16} /> Trocar chave</button></Linha>
        <Linha titulo="Modelo de voz" desc="Mude só se o Google trocar o nome do modelo."><input className="txt" value={cfg.modelo} onChange={(e) => salvar({ modelo: e.target.value })} onBlur={() => motor.obter().status !== 'parado' && motor.reiniciar()} /></Linha>
        <Linha titulo="Permissão de administrador" desc="Necessária para abrir todas as pastas e atalhos do Windows.">
          <span className={`selo ${info?.admin ? 'ok' : 'alerta'}`}><IcEscudo size={15} /> {info?.admin ? 'Ativa' : 'Desativada'}</span></Linha>
        {info?.dados && <p className="rodape-info">Versão {info.versao} · dados em {info.dados}</p>}
      </section>
    </div>
  );
}
