import React, { useEffect, useReducer, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, X, CaseSensitive, Replace } from 'lucide-react';
import { getSearch, setSearch, step, clearSearch, replaceCurrent, replaceAll } from '../search.js';

export default function FindBar({ editor, onClose, initial }) {
  const [q, setQ] = useState(initial || '');
  const [cs, setCs] = useState(false);
  const [showRep, setShowRep] = useState(false);
  const [rep, setRep] = useState('');
  const [, force] = useReducer((n) => n + 1, 0);
  const input = useRef(null);
  const start = useRef(editor.state.selection.from);

  useEffect(() => {
    input.current?.focus(); input.current?.select();
    editor.on('transaction', force);
    return () => { editor.off('transaction', force); clearSearch(editor); };
  }, [editor]);

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  useEffect(() => { setSearch(editor, q, cs, start.current); }, [q, cs, editor]);

  const s = getSearch(editor);
  const total = s?.results.length || 0;
  const noHit = q && !total;

  const key = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); step(editor, e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'F3') { e.preventDefault(); step(editor, e.shiftKey ? -1 : 1); }
  };

  return (
    <div className="findbar" >
      <div className="frow">
        <input ref={input} className={noHit ? 'nohit' : ''} placeholder="Buscar na nota…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} spellCheck={false} />
        <span className="fcount">{q ? (total ? `${s.index + 1}/${total}` : '0/0') : ''}</span>
        <button className={'fb' + (cs ? ' on' : '')} title="Diferenciar maiúsculas/minúsculas" onClick={() => setCs(!cs)}><CaseSensitive size={16} /></button>
        <button className="fb" title="Anterior (Shift+Enter)" disabled={!total} onClick={() => step(editor, -1)}><ChevronUp size={16} /></button>
        <button className="fb" title="Próximo (Enter)" disabled={!total} onClick={() => step(editor, 1)}><ChevronDown size={16} /></button>
        <button className={'fb' + (showRep ? ' on' : '')} title="Substituir" onClick={() => setShowRep(!showRep)}><Replace size={15} /></button>
        <button className="fb" title="Fechar (Esc)" onClick={onClose}><X size={16} /></button>
      </div>
      {showRep && (
        <div className="frow">
          <input placeholder="Substituir por…" value={rep} onChange={(e) => setRep(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') replaceCurrent(editor, rep); if (e.key === 'Escape') onClose(); }} spellCheck={false} />
          <button className="ftxt" disabled={!total} onClick={() => replaceCurrent(editor, rep)}>Substituir</button>
          <button className="ftxt" disabled={!total} onClick={() => replaceAll(editor, rep)}>Todas</button>
        </div>
      )}
    </div>
  );
}
