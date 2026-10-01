import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { Plus, Search, GripVertical, Square, Pin, PinOff, Palette, Type, MoreHorizontal, X, LayoutGrid, Copy, FileDown, Trash2 } from 'lucide-react';
import Toolbar from './Toolbar.jsx';
import FindBar from './FindBar.jsx';
import { SearchExtension } from '../search.js';
import { PALETTE } from '../palette.js';

// inclusive:false => ao digitar logo após um trecho colorido/marcado, o texto novo NÃO herda a cor.
const StyleMark = TextStyle.extend({ inclusive: false });
const HighlightMark = Highlight.configure({ multicolor: true }).extend({ inclusive: false });

export default function NoteWindow({ id }) {
  const [note, setNote] = useState(null);
  const [showTb, setShowTb] = useState(() => localStorage.getItem('nd.toolbar') === '1');
  const [pop, setPop] = useState(null); // 'color' | 'menu'
  const timer = useRef(null);
  const titleTimer = useRef(null);
  const wrap = useRef(null);
  const [find, setFind] = useState(null); // null = fechado; string = termo inicial
  const press = useRef(null);
  const lastToggle = useRef(0);

  const toggleCollapse = () => {
    if (Date.now() - lastToggle.current < 500) return;
    lastToggle.current = Date.now();
    setPop(null);
    setNote((n) => { const v = !n.collapsed; window.api.updateNote(id, { collapsed: v }); return { ...n, collapsed: v }; });
  };
  // arrastar pela barra; clique simples reabre (se recolhida), duplo clique recolhe
  const onBarDown = (e) => {
    if (e.button !== 0 || e.target.closest('button, input, .pop')) return;
    press.current = { x: e.screenX, y: e.screenY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    window.api.dragStart();
  };
  const onBarMove = (e) => {
    const p = press.current;
    if (!p) return;
    if (!p.moved && Math.hypot(e.screenX - p.x, e.screenY - p.y) > 4) p.moved = true;
    if (p.moved) window.api.dragMove(e.altKey);
  };
  const onBarUp = (e) => {
    const p = press.current;
    press.current = null;
    window.api.dragEnd();
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ok */ }
    if (p && !p.moved && note?.collapsed) toggleCollapse();
  };
  const onBarDbl = (e) => {
    if (e.target.closest('button, .pop')) return;
    window.getSelection()?.removeAllRanges();
    if (!note.collapsed) toggleCollapse();
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer' } } }),
      SearchExtension, StyleMark, Color, FontFamily, FontSize, HighlightMark,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList, TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Escreva sua nota…' }),
    ],
    content: '',
    onUpdate: ({ editor: ed }) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        window.api.updateNote(id, { html: ed.getHTML(), text: ed.getText({ blockSeparator: '\n' }) });
      }, 350);
    },
  });

  useEffect(() => {
    window.api.getNote(id).then((n) => { setNote(n); });
    return window.api.onNoteUpdated((n) => {
      if (n.id !== id) return;
      setNote(n);
      editor?.commands.setContent(n.html || '', { emitUpdate: false });
    });
  }, [id, editor]);

  useEffect(() => {
    if (note && editor && !editor.__loaded) {
      editor.__loaded = true;
      editor.commands.setContent(note.html || '<p></p>', { emitUpdate: false });
    }
  }, [note, editor]);

  // Ctrl+F abre a busca da nota; F3/Esc tratados na própria barra
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const sel = editor && !editor.state.selection.empty && editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ');
        if (note?.collapsed) toggleCollapse();
        setFind(sel && sel.length < 80 ? sel : (find ?? ''));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // comandos vindos do menu de contexto (botão direito)
  useEffect(() => {
    if (!editor) return undefined;
    return window.api.onEditorCommand(({ cmd, value }) => {
      const ch = editor.chain().focus();
      if (cmd === 'highlight') (value ? ch.setHighlight({ color: value }) : ch.unsetHighlight()).run();
      else if (cmd === 'unhighlightAt') {
        if (!editor.state.selection.empty) ch.unsetHighlight().run();
        else {
          const at = editor.view.posAtCoords({ left: value.x, top: value.y });
          if (at) editor.chain().focus().setTextSelection(at.pos).extendMarkRange('highlight').unsetHighlight().run();
        }
      } else if (cmd === 'color') (value ? ch.setColor(value) : ch.unsetColor()).run();
      else if (cmd === 'bold') ch.toggleBold().run();
    });
  }, [editor]);

  // salva pendências ao fechar
  useEffect(() => {
    const flush = () => {
      if (timer.current && editor) {
        clearTimeout(timer.current);
        window.api.updateNote(id, { html: editor.getHTML(), text: editor.getText({ blockSeparator: '\n' }) });
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [editor, id]);

  useEffect(() => {
    const close = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setPop(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // ao abrir a formatação em nota pequena, cresce a janela para o texto não ficar espremido
  useEffect(() => {
    if (!showTb || !note || note.collapsed) return undefined;
    const t = setTimeout(() => {
      const body = wrap.current?.querySelector('.notebody');
      const need = 110 - (body?.clientHeight || 0);
      if (need > 0) window.resizeBy(0, need);
    }, 60);
    return () => clearTimeout(t);
  }, [showTb, note?.collapsed]);

  const toggleTb = () => { const v = !showTb; setShowTb(v); localStorage.setItem('nd.toolbar', v ? '1' : '0'); };
  const patch = useCallback((p) => { setNote((n) => ({ ...n, ...p })); window.api.updateNote(id, p); }, [id]);

  const onClick = (e) => {
    const a = e.target.closest?.('a');
    if (a && (e.ctrlKey || e.metaKey)) { e.preventDefault(); window.open(a.href); }
  };

  if (!note) return null;
  const c = PALETTE[note.color] || PALETTE.yellow;
  const style = { '--bg': c.bg, '--bar': c.bar, '--text': c.text };

  return (
    <div className="note" style={style} ref={wrap} data-dark={note.color === 'dark'} data-collapsed={!!note.collapsed}>
      <div className="notebar" onPointerDown={onBarDown} onPointerMove={onBarMove} onPointerUp={onBarUp} onDoubleClick={onBarDbl} title={note.collapsed ? 'Clique para abrir a nota' : undefined}>
        {note.collapsed ? (
          <>
            <span className="collapsedtitle">{note.title || (note.text || '').split('\n')[0] || 'Sem nome'}</span>
            <button className="nb" title="Abrir nota" onClick={toggleCollapse}><Square size={12} strokeWidth={2} /></button>
            <button className="nb close" title="Ocultar da tela" onClick={() => window.api.winControl('hide')}><X size={16} /></button>
          </>
        ) : (<>
        <button className="nb" title="Nova nota" onClick={() => window.api.createNote({})}><Plus size={16} /></button>
        <div className="grip" title="Arraste para mover"><GripVertical size={14} /></div>
        <input className="notetitle" placeholder="Nome da nota" maxLength={60} value={note.title || ''} spellCheck={false}
          onChange={(e) => { setNote((n) => ({ ...n, title: e.target.value })); clearTimeout(titleTimer.current); const v = e.target.value; titleTimer.current = setTimeout(() => window.api.updateNote(id, { title: v }), 300); }}
          onKeyDown={(e) => { if (e.key === 'Enter') editor?.commands.focus('end'); }} />
        <button className={'nb' + (find !== null ? ' on' : '')} title="Buscar na nota (Ctrl+F)" onClick={() => setFind(find === null ? '' : null)}><Search size={14} /></button>
        <button className="nb" title={note.pinned ? 'Desafixar (deixar de ficar por cima)' : 'Fixar por cima das outras janelas'} onClick={() => patch({ pinned: !note.pinned })}>
          {note.pinned ? <Pin size={14} fill="currentColor" /> : <PinOff size={14} />}
        </button>
        <div className="popwrap">
          <button className="nb" title="Cor da nota" onClick={() => setPop(pop === 'color' ? null : 'color')}><Palette size={14} /></button>
          {pop === 'color' && (
            <div className="pop notecolors">
              {Object.entries(PALETTE).map(([k, v]) => (
                <button key={k} className={'sw' + (k === note.color ? ' sel' : '')} style={{ background: v.bg }} title={v.name} onClick={() => { patch({ color: k }); setPop(null); }} />
              ))}
            </div>
          )}
        </div>
        <button className={'nb' + (showTb ? ' on' : '')} title="Formatação" onClick={toggleTb}><Type size={15} /></button>
        <div className="popwrap">
          <button className="nb" title="Mais opções" onClick={() => setPop(pop === 'menu' ? null : 'menu')}><MoreHorizontal size={16} /></button>
          {pop === 'menu' && (
            <div className="pop menu">
              <button onClick={() => { window.api.openManager(); setPop(null); }}><LayoutGrid size={14} /> Abrir gerenciador</button>
              <button onClick={() => { window.api.duplicateNote(id); setPop(null); }}><Copy size={14} /> Duplicar nota</button>
              <button onClick={() => { window.api.exportNoteTxt(id); setPop(null); }}><FileDown size={14} /> Exportar como .txt</button>
              <label className="opacity">Transparência
                <input type="range" min="40" max="100" value={Math.round((note.opacity ?? 1) * 100)} onChange={(e) => patch({ opacity: +e.target.value / 100 })} />
              </label>
              <button className="danger" onClick={() => window.api.trashNote(id)}><Trash2 size={14} /> Mover para lixeira</button>
            </div>
          )}
        </div>
        <button className="nb close" title="Ocultar da tela (a nota continua salva)" onClick={() => window.api.winControl('hide')}><X size={16} /></button>
        </>)}
      </div>
      {find !== null && !note.collapsed && <FindBar key="find" editor={editor} initial={find} onClose={() => { setFind(null); editor?.commands.focus(); }} />}
      {/* corpo escondido quando recolhida */}
      <div className="notebody" hidden={!!note.collapsed} onClick={onClick} onMouseDown={(e) => { if (e.target === e.currentTarget) editor?.commands.focus('end'); }}>
        <EditorContent editor={editor} />
      </div>
      {showTb && !note.collapsed && <Toolbar editor={editor} />}
    </div>
  );
}
