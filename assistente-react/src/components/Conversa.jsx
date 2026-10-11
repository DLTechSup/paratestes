import React, { useEffect, useRef } from 'react';

const EXEMPLOS = ['“Abra a pasta Lançamentos”', '“Abra a pasta Modare”', '“Pesquise sete cinco vinte e seis ponto vinte e cinco vinte e seis”', '“Volta” · “O que tem aqui?” · “Fecha essa pasta”', '“Abra o Chrome” · “Aumenta o volume” · “Abre o YouTube”', '“Pesquise receita de bolo no Google”'];

export default function Conversa({ logs, onLimpar, nome }) {
  const fim = useRef(null);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [logs]);
  return (
    <div className="aba-conversa">
      {logs.length === 0 ? (
        <div className="vazio">
          <h3>Tudo pronto para conversar</h3>
          <p>Fale naturalmente. Alguns exemplos{nome ? <> (depois de dizer “{nome}”)</> : null}:</p>
          <ul>{EXEMPLOS.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      ) : (
        <div className="mensagens">
          {logs.map((l) => (
            <div key={l.id} className={`msg msg-${l.tipo}`}>
              {l.tipo === 'acao' ? (
                <>
                  <span className="acao-nome">{l.texto}</span>
                  {l.resultado && <span className="acao-res">{l.resultado}</span>}
                  {l.ms != null && <span className="acao-ms">{l.ms < 1000 ? `${l.ms} ms` : `${(l.ms / 1000).toFixed(1)} s`}</span>}
                </>
              ) : <span>{l.texto}</span>}
            </div>
          ))}
          <div ref={fim} />
        </div>
      )}
      {logs.length > 0 && <button className="link-limpar" onClick={onLimpar}>Limpar conversa</button>}
    </div>
  );
}
