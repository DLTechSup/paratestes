// Mantenha em sincronia com electron/palette.cjs
export const PALETTE = {
  yellow: { name: 'Amarelo', bg: '#fff59d', bar: '#fbe96b', text: '#2b2b2b' },
  orange: { name: 'Laranja', bg: '#ffcc80', bar: '#f5b45c', text: '#2b2b2b' },
  pink: { name: 'Rosa', bg: '#f48fb1', bar: '#e9739b', text: '#2b1a20' },
  salmon: { name: 'Salmão', bg: '#ef9a9a', bar: '#e57f7f', text: '#2b1a1a' },
  purple: { name: 'Roxo', bg: '#ce93d8', bar: '#bb78c8', text: '#241a2b' },
  blue: { name: 'Azul', bg: '#90caf9', bar: '#72b7ee', text: '#182430' },
  teal: { name: 'Turquesa', bg: '#80deea', bar: '#5fcfdc', text: '#12292c' },
  green: { name: 'Verde', bg: '#a5d6a7', bar: '#88c78b', text: '#182618' },
  gray: { name: 'Cinza', bg: '#cfd8dc', bar: '#b8c4ca', text: '#22292c' },
  white: { name: 'Branco', bg: '#fafafa', bar: '#ececec', text: '#222222' },
  dark: { name: 'Escuro', bg: '#2d2f36', bar: '#23252b', text: '#ececec' },
};

export const TEXT_COLORS = ['#000000', '#5f6368', '#d50000', '#e65100', '#f9a825', '#2e7d32', '#00838f', '#1565c0', '#6a1b9a', '#c2185b', '#ffffff'];
export const HIGHLIGHT_COLORS = ['#ffff00', '#00e5ff', '#76ff03', '#ff80ab', '#ffab40', '#b388ff', '#0000ff', '#ff5252', '#c8e6c9', '#bdbdbd'];
export const FONTS = ['Segoe UI', 'Arial', 'Calibri', 'Verdana', 'Tahoma', 'Georgia', 'Times New Roman', 'Consolas', 'Comic Sans MS'];
export const SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40];

export const fmtDate = (t) => (t ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

// Preto ou branco, o que ficar mais legível sobre a cor de fundo dada (hex, rgb(...) ou nome CSS).
export function corDeContraste(fundo) {
  const rgb = corParaRgb(fundo);
  if (!rgb) return '#1a1a1a';
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminancia > 0.55 ? '#1a1a1a' : '#f5f5f5';
}

function corParaRgb(cor) {
  if (!cor) return null;
  const hex = cor.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = cor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}
