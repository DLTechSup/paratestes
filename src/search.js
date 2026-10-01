// Localizar/substituir dentro da nota (decorações do ProseMirror; não altera o conteúdo salvo).
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const searchKey = new PluginKey('ndSearch');

export function findAll(doc, query, cs) {
  const out = [];
  if (!query) return out;
  const q = cs ? query : query.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    const map = [];
    node.forEach((child, off) => {
      if (child.isText) {
        for (let i = 0; i < child.text.length; i++) { text += child.text[i]; map.push(pos + 1 + off + i); }
      } else { text += '￼'; map.push(pos + 1 + off); }
    });
    const hay = cs ? text : text.toLowerCase();
    let i = hay.indexOf(q);
    while (i !== -1) {
      out.push({ from: map[i], to: map[i + q.length - 1] + 1 });
      i = hay.indexOf(q, i + Math.max(1, q.length));
    }
    return false;
  });
  return out;
}

const build = (doc, s) => {
  if (!s.results.length) return DecorationSet.empty;
  return DecorationSet.create(doc, s.results.map((r, i) => Decoration.inline(r.from, r.to, { class: i === s.index ? 'search-hit current' : 'search-hit' })));
};

export const SearchExtension = Extension.create({
  name: 'ndSearch',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: searchKey,
      state: {
        init: () => ({ query: '', cs: false, index: 0, results: [], deco: DecorationSet.empty }),
        apply(tr, prev, _old, newState) {
          const meta = tr.getMeta(searchKey);
          if (!meta && !tr.docChanged) return prev;
          const s = { ...prev, ...(meta || {}) };
          s.results = findAll(newState.doc, s.query, s.cs);
          s.index = s.results.length ? Math.min(Math.max(0, s.index), s.results.length - 1) : 0;
          s.deco = build(newState.doc, s);
          return s;
        },
      },
      props: { decorations: (state) => searchKey.getState(state).deco },
    })];
  },
});

export const getSearch = (editor) => (editor ? searchKey.getState(editor.state) : null);

function goTo(editor, index) {
  const s = getSearch(editor);
  if (!s.results.length) return;
  const i = ((index % s.results.length) + s.results.length) % s.results.length;
  const r = s.results[i];
  const tr = editor.state.tr.setMeta(searchKey, { index: i })
    .setSelection(TextSelection.create(editor.state.doc, r.from, r.to)).scrollIntoView();
  editor.view.dispatch(tr);
}

export function setSearch(editor, query, cs, start) {
  const sel = start ?? editor.state.selection.from;
  const results = findAll(editor.state.doc, query, cs);
  const first = Math.max(0, results.findIndex((r) => r.from >= sel));
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, { query, cs, index: first }));
  if (results.length) goTo(editor, first);
}
export const step = (editor, dir) => goTo(editor, getSearch(editor).index + dir);
export const clearSearch = (editor) => editor.view.dispatch(editor.state.tr.setMeta(searchKey, { query: '', index: 0 }));

export function replaceCurrent(editor, text) {
  const s = getSearch(editor);
  const r = s.results[s.index];
  if (!r) return;
  editor.view.dispatch(editor.state.tr.insertText(text, r.from, r.to));
  const n = getSearch(editor);
  if (n.results.length) goTo(editor, Math.min(s.index, n.results.length - 1));
}

export function replaceAll(editor, text) {
  const s = getSearch(editor);
  if (!s.results.length) return 0;
  const tr = editor.state.tr;
  [...s.results].reverse().forEach((r) => tr.insertText(text, r.from, r.to));
  editor.view.dispatch(tr);
  return s.results.length;
}
