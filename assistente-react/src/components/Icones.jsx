import React from 'react';

const P = ({ d, size = 18, sw = 1.8, fill = 'none', children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d ? <path d={d} /> : children}
  </svg>
);

export const IcMic = (p) => <P {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></P>;
export const IcPlay = (p) => <P {...p} fill="currentColor" sw={0}><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" /></P>;
export const IcStop = (p) => <P {...p} fill="currentColor" sw={0}><rect x="6" y="6" width="12" height="12" rx="2" /></P>;
export const IcMin = (p) => <P {...p} sw={2}><path d="M5 12h14" /></P>;
export const IcX = (p) => <P {...p} sw={2}><path d="M6 6l12 12M18 6L6 18" /></P>;
export const IcPasta = (p) => <P {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></P>;
export const IcChat = (p) => <P {...p}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z" /></P>;
export const IcAjustes = (p) => <P {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></P>;
export const IcSino = (p) => <P {...p}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" /></P>;
export const IcOuvido = (p) => <P {...p}><path d="M3 12h2m2-5v10m3-13v16m3-12v8m3-10v12m3-7h2" /></P>;
export const IcEscudo = (p) => <P {...p}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></P>;
export const IcChave = (p) => <P {...p}><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2L20 3m-4 4l3 3" /></P>;
export const IcRaio = (p) => <P {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></P>;
export const IcMais = (p) => <P {...p} sw={2}><path d="M12 5v14M5 12h14" /></P>;
export const IcLixo = (p) => <P {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></P>;
export const IcOlho = (p) => <P {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></P>;
export const IcSeta = (p) => <P {...p}><path d="M5 12h14M13 6l6 6-6 6" /></P>;
export const IcMedidor = (p) => <P {...p}><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 18l4-6" /><circle cx="12" cy="18" r="1.2" fill="currentColor" /></P>;
export const IcExterno = (p) => <P {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></P>;
