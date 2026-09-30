// Importa backups .db (SQLite) de outros apps de notas adesivas, ex.: Simple Sticky Notes.
// O esquema exato varia, então o leitor detecta tabelas/colunas por heurística.
const fs = require('fs');
const path = require('path');
const { rtfToHtml } = require('./rtf.cjs');

let SQL = null;
async function getSql() {
  if (SQL) return SQL;
  const initSqlJs = require('sql.js');
  const dir = path.dirname(require.resolve('sql.js'));
  let wasmDir = dir.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
  if (!fs.existsSync(path.join(wasmDir, 'sql-wasm.wasm'))) wasmDir = dir;
  SQL = await initSqlJs({ locateFile: (f) => path.join(wasmDir, f) });
  return SQL;
}

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function decodeValue(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (v instanceof Uint8Array) {
    const b = Buffer.from(v);
    if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return b.slice(2).toString('utf16le');
    if (b.length >= 4 && b[1] === 0 && b[3] === 0) return b.toString('utf16le');
    return b.toString('utf8');
  }
  return String(v);
}

function contentToHtml(raw) {
  const s = decodeValue(raw);
  if (!s.trim()) return '<p></p>';
  if (s.trimStart().startsWith('{\\rtf')) return rtfToHtml(s);
  if (/^\s*<(p|div|span|h\d|ul|ol|strong|b|em|i|br)\b/i.test(s)) return s;
  return s.split(/\r?\n|\r/).map((l) => `<p>${esc(l)}</p>`).join('');
}

function htmlToText(html) {
  return html.replace(/<\/p>/g, '\n').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
}

function toColor(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    const u = v >>> 0; // ARGB
    const hex = (n) => n.toString(16).padStart(2, '0');
    return '#' + hex((u >> 16) & 255) + hex((u >> 8) & 255) + hex(u & 255);
  }
  const s = String(v).trim();
  if (/^#[0-9a-f]{8}$/i.test(s)) return '#' + s.slice(3);
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  return null;
}

// Mapeia uma cor arbitrária para a cor de nota mais próxima do NoteDeck
function nearestPalette(hex, palette) {
  if (!hex) return null;
  const h = hex.replace('#', '');
  const rgb = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
  let best = null, bd = 1e9;
  for (const [id, c] of Object.entries(palette)) {
    const p = [1, 3, 5].map((k) => parseInt(c.bg.slice(k, k + 2), 16));
    const d = (p[0] - rgb[0]) ** 2 + (p[1] - rgb[1]) ** 2 + (p[2] - rgb[2]) ** 2;
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

async function readDb(file, palette) {
  const buf = fs.readFileSync(file);
  if (buf.slice(0, 15).toString() !== 'SQLite format 3') {
    throw new Error('O arquivo não é um banco SQLite (.db) reconhecido.');
  }
  const S = await getSql();
  const db = new S.Database(new Uint8Array(buf));
  const notes = [];
  const schema = [];
  try {
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    const names = tables.length ? tables[0].values.map((r) => r[0]) : [];
    for (const t of names) {
      const res = db.exec(`SELECT * FROM "${t}"`);
      if (!res.length) { schema.push(`${t} (vazia)`); continue; }
      const cols = res[0].columns;
      schema.push(`${t}(${cols.join(', ')}) – ${res[0].values.length} linhas`);
      const find = (re) => cols.findIndex((c) => re.test(c));
      let ci = find(/^(content|text|body|rtf|rtftext|note|notetext|data|memo|message)$/i);
      if (ci < 0) ci = find(/(content|text|body|rtf|note|memo)/i);
      if (ci < 0) continue;
      const ti = find(/^(title|name|header)$/i);
      const coli = find(/(color|colour|background|bg)/i);
      const xi = find(/^(x|left|posx|positionx|xpos)$/i);
      const yi = find(/^(y|top|posy|positiony|ypos)$/i);
      const wi = find(/^(w|width)$/i);
      const hi = find(/^(h|height)$/i);
      const ai = find(/(created|added)/i);
      const mi = find(/(modified|updated|changed)/i);
      const di = find(/(deleted|trash)/i);
      for (const row of res[0].values) {
        if (di >= 0 && Number(row[di]) === 1) continue;
        const rawContent = row[ci];
        if (rawContent == null) continue;
        let html = contentToHtml(rawContent);
        const text = htmlToText(html);
        if (ti >= 0 && row[ti] && !text.startsWith(String(row[ti]))) html = `<p><strong>${esc(row[ti])}</strong></p>` + html;
        if (!text && !(ti >= 0 && row[ti])) continue;
        const ts = (v) => { const n = Number(v); if (!n) return null; return n > 1e12 ? n : n * 1000; };
        notes.push({
          html,
          color: nearestPalette(coli >= 0 ? toColor(row[coli]) : null, palette),
          x: xi >= 0 ? Number(row[xi]) || null : null,
          y: yi >= 0 ? Number(row[yi]) || null : null,
          w: wi >= 0 ? Number(row[wi]) || null : null,
          h: hi >= 0 ? Number(row[hi]) || null : null,
          createdAt: ai >= 0 ? ts(row[ai]) : null,
          updatedAt: mi >= 0 ? ts(row[mi]) : null,
        });
      }
    }
  } finally {
    db.close();
  }
  return { notes, schema };
}

module.exports = { readDb, htmlToText };
