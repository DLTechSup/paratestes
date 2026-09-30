import React, { useState, useEffect, useRef } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, List, ListOrdered,
  ListChecks, Link2, Eraser, Undo2, Redo2, Highlighter, Baseline, Minus, Plus, X,
} from 'lucide-react';
import { TEXT_COLORS, HIGHLIGHT_COLORS, FONTS, SIZES } from '../palette.js';

function Btn({ active, disabled, title, onClick, children }) {
  return (
    <button type="button" className={'tb' + (active ? ' on' : '')} title={title} disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{children}</button>
  );
}

function ColorPop({ colors, onPick, onClear, clearLabel, custom }) {
  return (
    <div className="pop colorpop" onMouseDown={(e) => e.preventDefault()}>
      <div className="swatches">
        {colors.map((c) => <button key={c} className="sw" style={{ background: c }} onClick={() => onPick(c)} title={c} />)}
        <label className="sw custom" title="Outra cor…">
          +<input type="color" value={custom} onChange={(e) => onPick(e.target.value)} />
        </label>
      </div>
      <button className="linkbtn" onClick={onClear}><X size={12} /> {clearLabel}</button>
    </div>
  );
}

export default function Toolbar({ editor }) {
  const [pop, setPop] = useState(null); // 'color' | 'hl' | 'link'
  const [lastHl, setLastHl] = useState('#ffff00');
  const [lastColor, setLastColor] = useState('#d50000');
  const [link, setLink] = useState('');
  const [, force] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    if (!editor) return undefined;
    const h = () => force((n) => n + 1);
    editor.on('transaction', h);
    return () => editor.off('transaction', h);
  }, [editor]);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setPop(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!editor) return null;
  const ts = editor.getAttributes('textStyle');
  const size = parseInt(ts.fontSize, 10) || 14;
  const font = (ts.fontFamily || '').replace(/["']/g, '').split(',')[0] || 'Segoe UI';
  const chain = () => editor.chain().focus();
  const setSize = (s) => chain().setFontSize(`${Math.min(96, Math.max(8, s))}px`).run();

  const applyLink = () => {
    const url = link.trim();
    if (!url) chain().unsetLink().run();
    else chain().extendMarkRange('link').setLink({ href: /^(https?:|mailto:)/.test(url) ? url : `https://${url}` }).run();
    setPop(null);
  };

  return (
    <div className="toolbar" ref={ref}>
      <div className="tbrow">
        <Btn title="Desfazer (Ctrl+Z)" disabled={!editor.can().undo()} onClick={() => chain().undo().run()}><Undo2 size={15} /></Btn>
        <Btn title="Refazer (Ctrl+Y)" disabled={!editor.can().redo()} onClick={() => chain().redo().run()}><Redo2 size={15} /></Btn>
        <span className="sep" />
        <select className="tbsel" title="Fonte" value={FONTS.includes(font) ? font : 'Segoe UI'}
          onChange={(e) => chain().setFontFamily(e.target.value).run()}>
          {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>
        <Btn title="Diminuir fonte" onClick={() => setSize(size - 1)}><Minus size={14} /></Btn>
        <select className="tbsel size" title="Tamanho" value={SIZES.includes(size) ? size : ''} onChange={(e) => setSize(+e.target.value)}>
          {!SIZES.includes(size) && <option value="">{size}</option>}
          {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Btn title="Aumentar fonte" onClick={() => setSize(size + 1)}><Plus size={14} /></Btn>
      </div>
      <div className="tbrow">
        <Btn title="Negrito (Ctrl+B)" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()}><Bold size={15} /></Btn>
        <Btn title="Itálico (Ctrl+I)" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()}><Italic size={15} /></Btn>
        <Btn title="Sublinhado (Ctrl+U)" active={editor.isActive('underline')} onClick={() => chain().toggleUnderline().run()}><Underline size={15} /></Btn>
        <Btn title="Tachado" active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()}><Strikethrough size={15} /></Btn>
        <span className="sep" />
        <div className="popwrap">
          <Btn title="Cor do texto" active={pop === 'color'} onClick={() => setPop(pop === 'color' ? null : 'color')}>
            <Baseline size={15} /><i className="ind" style={{ background: ts.color || lastColor }} />
          </Btn>
          {pop === 'color' && (
            <ColorPop colors={TEXT_COLORS} custom={lastColor} clearLabel="Cor padrão"
              onPick={(c) => { setLastColor(c); chain().setColor(c).run(); setPop(null); }}
              onClear={() => { chain().unsetColor().run(); setPop(null); }} />
          )}
        </div>
        <div className="popwrap">
          <Btn title="Marca-texto (só o trecho selecionado)" active={pop === 'hl' || editor.isActive('highlight')} onClick={() => setPop(pop === 'hl' ? null : 'hl')}>
            <Highlighter size={15} /><i className="ind" style={{ background: lastHl }} />
          </Btn>
          {pop === 'hl' && (
            <ColorPop colors={HIGHLIGHT_COLORS} custom={lastHl} clearLabel="Remover marca-texto"
              onPick={(c) => { setLastHl(c); chain().setHighlight({ color: c }).run(); setPop(null); }}
              onClear={() => { chain().unsetHighlight().run(); setPop(null); }} />
          )}
        </div>
      </div>
      <div className="tbrow">
        <Btn title="Alinhar à esquerda" active={editor.isActive({ textAlign: 'left' })} onClick={() => chain().setTextAlign('left').run()}><AlignLeft size={15} /></Btn>
        <Btn title="Centralizar" active={editor.isActive({ textAlign: 'center' })} onClick={() => chain().setTextAlign('center').run()}><AlignCenter size={15} /></Btn>
        <Btn title="Alinhar à direita" active={editor.isActive({ textAlign: 'right' })} onClick={() => chain().setTextAlign('right').run()}><AlignRight size={15} /></Btn>
        <span className="sep" />
        <Btn title="Lista com marcadores" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()}><List size={15} /></Btn>
        <Btn title="Lista numerada" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()}><ListOrdered size={15} /></Btn>
        <Btn title="Lista de tarefas (checklist)" active={editor.isActive('taskList')} onClick={() => chain().toggleTaskList().run()}><ListChecks size={15} /></Btn>
        <span className="sep" />
        <div className="popwrap">
          <Btn title="Inserir link" active={pop === 'link' || editor.isActive('link')} onClick={() => { setLink(editor.getAttributes('link').href || ''); setPop(pop === 'link' ? null : 'link'); }}><Link2 size={15} /></Btn>
          {pop === 'link' && (
            <div className="pop linkpop">
              <input autoFocus placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyLink(); if (e.key === 'Escape') setPop(null); }} />
              <button className="okbtn" onClick={applyLink}>OK</button>
            </div>
          )}
        </div>
        <Btn title="Limpar formatação" onClick={() => chain().unsetAllMarks().clearNodes().run()}><Eraser size={15} /></Btn>
      </div>
    </div>
  );
}
