// Gera build/icon.png (512) e build/icon.ico (256, PNG embutido) sem dependências.
const fs = require('fs');
const zlib = require('zlib');

function render(size) {
  const SS = 3, px = Buffer.alloc(size * size * 4);
  const S = size, r = S * 0.22, m = S * 0.08, fold = S * 0.26;
  const inRound = (x, y) => {
    const x0 = m, y0 = m, x1 = S - m, y1 = S - m;
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    let cov = 0, R = 0, G = 0, B = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const x = i + (sx + .5) / SS, y = j + (sy + .5) / SS;
      if (!inRound(x, y)) continue;
      let c;
      const dx = (S - m) - x, dy = (S - m) - y; // canto inferior direito dobrado
      if (dx + dy < fold) c = dx + dy > fold * 0.0 && (dx + dy) < fold * 0.02 ? [200, 150, 20] : [255, 236, 170];
      else {
        const t = (y - m) / (S - 2 * m);
        c = [255 - 12 * t, 200 - 22 * t, 45 - 10 * t]; // amarelo -> âmbar
        // linhas de texto
        const lx = x / S, ly = y / S;
        const line = (yy) => Math.abs(ly - yy) < 0.022 && lx > 0.24 && lx < (yy > 0.6 ? 0.5 : 0.76);
        if (line(0.34) || line(0.48) || line(0.62)) c = [92, 58, 8];
      }
      cov++; R += c[0]; G += c[1]; B += c[2];
    }
    const o = (j * S + i) * 4, n = SS * SS;
    if (cov) { px[o] = R / cov; px[o + 1] = G / cov; px[o + 2] = B / cov; px[o + 3] = 255 * cov / n; }
  }
  return px;
}

function png(size, px) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/icon.png', png(512, render(512)));
const p256 = png(256, render(256));
const hdr = Buffer.alloc(22);
hdr.writeUInt16LE(0, 0); hdr.writeUInt16LE(1, 2); hdr.writeUInt16LE(1, 4);
hdr[6] = 0; hdr[7] = 0; hdr.writeUInt16LE(1, 10); hdr.writeUInt16LE(32, 12);
hdr.writeUInt32LE(p256.length, 14); hdr.writeUInt32LE(22, 18);
fs.writeFileSync('build/icon.ico', Buffer.concat([hdr, p256]));
console.log('ícones gerados');
