// Conversor RTF -> HTML simples (negrito, itálico, sublinhado, tachado, cor, realce, parágrafos).
function rtfToHtml(rtf) {
  const colors = [null];
  const ct = rtf.match(/\{\\colortbl;?([^}]*)\}/);
  if (ct) {
    ct[1].split(';').forEach((c) => {
      const r = c.match(/\\red(\d+)/), g = c.match(/\\green(\d+)/), b = c.match(/\\blue(\d+)/);
      if (r && g && b) colors.push(`rgb(${r[1]},${g[1]},${b[1]})`);
    });
  }
  const skipDest = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'generator', 'listtable', 'listoverridetable', 'themedata', 'colorschememapping', 'datastore', 'latentstyles', 'rsidtbl', 'mmathPr']);
  let i = 0, out = '';
  const stack = [];
  let st = { b: 0, i: 0, u: 0, s: 0, cf: 0, hl: 0, skip: false, uc: 1 };
  let para = '';
  const flushPara = () => { out += `<p>${para}</p>`; para = ''; };
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const emit = (t) => {
    if (st.skip || !t) return;
    let h = esc(t);
    const style = [];
    if (st.cf && colors[st.cf]) style.push(`color:${colors[st.cf]}`);
    if (style.length) h = `<span style="${style.join(';')}">${h}</span>`;
    if (st.hl && colors[st.hl]) h = `<mark data-color="${colors[st.hl]}" style="background-color:${colors[st.hl]}">${h}</mark>`;
    if (st.s) h = `<s>${h}</s>`;
    if (st.u) h = `<u>${h}</u>`;
    if (st.i) h = `<em>${h}</em>`;
    if (st.b) h = `<strong>${h}</strong>`;
    para += h;
  };
  while (i < rtf.length) {
    const ch = rtf[i];
    if (ch === '{') {
      stack.push({ ...st });
      i++;
      if (rtf[i] === '\\' && rtf[i + 1] === '*') { st.skip = true; }
      else if (rtf[i] === '\\') {
        const m = rtf.slice(i + 1, i + 30).match(/^[a-zA-Z]+/);
        if (m && skipDest.has(m[0])) st.skip = true;
      }
    } else if (ch === '}') {
      st = stack.pop() || st; i++;
    } else if (ch === '\\') {
      i++;
      const n = rtf[i];
      if (n === '\\' || n === '{' || n === '}') { emit(n); i++; }
      else if (n === "'") { emit(String.fromCharCode(parseInt(rtf.substr(i + 1, 2), 16))); i += 3; }
      else if (n === '~') { emit('\u00a0'); i++; }
      else if (n === '\n' || n === '\r') { if (!st.skip) flushPara(); i++; }
      else {
        const m = rtf.slice(i).match(/^([a-zA-Z]+)(-?\d+)?\s?/);
        if (!m) { i++; continue; }
        i += m[0].length;
        const w = m[1], v = m[2] === undefined ? null : parseInt(m[2], 10);
        switch (w) {
          case 'b': st.b = v === 0 ? 0 : 1; break;
          case 'i': st.i = v === 0 ? 0 : 1; break;
          case 'ul': st.u = v === 0 ? 0 : 1; break;
          case 'ulnone': st.u = 0; break;
          case 'strike': st.s = v === 0 ? 0 : 1; break;
          case 'cf': st.cf = v || 0; break;
          case 'highlight': case 'cb': st.hl = v || 0; break;
          case 'plain': st.b = st.i = st.u = st.s = st.cf = st.hl = 0; break;
          case 'par': case 'line': if (!st.skip) flushPara(); break;
          case 'tab': emit('\t'); break;
          case 'uc': st.uc = v; break;
          case 'u': {
            emit(String.fromCharCode(v < 0 ? v + 65536 : v));
            // pula o(s) caractere(s) de substituição
            for (let k = 0; k < st.uc; k++) {
              if (rtf[i] === '\\' && rtf[i + 1] === "'") i += 4; else i++;
            }
            break;
          }
          default: break;
        }
      }
    } else if (ch === '\r' || ch === '\n') {
      i++;
    } else {
      let j = i;
      while (j < rtf.length && !'\\{}\r\n'.includes(rtf[j])) j++;
      emit(rtf.slice(i, j));
      i = j;
    }
  }
  if (para) flushPara();
  return out.replace(/<p><\/p>/g, '<p></p>') || '<p></p>';
}

module.exports = { rtfToHtml };
