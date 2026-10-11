// Áudio no navegador (Electron): microfone 16 kHz com cancelamento de eco, saída 24 kHz, bipes e detector do nome.
import { casaNome } from './matchNome.mjs';

const WORKLET = `
class Captura extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(512); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === 512) {
        let s = 0; for (let k = 0; k < 512; k++) s += this.buf[k] * this.buf[k];
        this.port.postMessage({ pcm: this.buf.slice(), rms: Math.sqrt(s / 512) });
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('captura', Captura);`;

export async function abrirMic({ micId, onChunk }) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: micId ? { exact: micId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  const ctx = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' });
  if (ctx.state === 'suspended') await ctx.resume();
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'captura', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
  node.port.onmessage = (e) => onChunk(e.data.pcm, e.data.rms);
  const mudo = ctx.createGain();
  mudo.gain.value = 0;
  src.connect(node); node.connect(mudo); mudo.connect(ctx.destination);
  return {
    parar() {
      try { node.disconnect(); } catch { /* ok */ }
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
    },
  };
}

export async function criarSaida({ saidaId }) {
  const ctx = new AudioContext({ sampleRate: 24000, latencyHint: 'interactive' });
  if (saidaId && ctx.setSinkId) { try { await ctx.setSinkId(saidaId); } catch { /* usa o padrão */ } }
  if (ctx.state === 'suspended') await ctx.resume();
  const ganho = ctx.createGain();
  const an = ctx.createAnalyser();
  an.fftSize = 512;
  ganho.connect(an); an.connect(ctx.destination);
  const fontes = new Set();
  const amostras = new Uint8Array(an.fftSize);
  let proximo = 0;
  return {
    tocar(bytes) {
      const i16 = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + (bytes.byteLength & ~1)));
      if (!i16.length) return;
      const f = new Float32Array(i16.length);
      for (let i = 0; i < i16.length; i++) f[i] = i16[i] / 32768;
      const ab = ctx.createBuffer(1, f.length, 24000);
      ab.copyToChannel(f, 0);
      const s = ctx.createBufferSource();
      s.buffer = ab; s.connect(ganho);
      const t = Math.max(ctx.currentTime + 0.03, proximo);
      s.start(t);
      proximo = t + ab.duration;
      fontes.add(s);
      s.onended = () => fontes.delete(s);
    },
    interromper() { fontes.forEach((s) => { try { s.stop(); } catch { /* ok */ } }); fontes.clear(); proximo = 0; },
    falando() { return proximo > 0 && proximo > ctx.currentTime - 0.25; },
    nivel() {
      an.getByteTimeDomainData(amostras);
      let s = 0; for (let i = 0; i < amostras.length; i++) { const v = (amostras[i] - 128) / 128; s += v * v; }
      return Math.min(1, Math.sqrt(s / amostras.length) * 3);
    },
    fechar() { try { fontes.forEach((x) => x.stop()); } catch { /* ok */ } ctx.close().catch(() => {}); },
  };
}

let ctxBip = null;
export function bip(tipo) {
  try {
    ctxBip = ctxBip && ctxBip.state !== 'closed' ? ctxBip : new AudioContext();
    const c = ctxBip, t0 = c.currentTime + 0.01;
    const notas = tipo === 'acordar' ? [[660, 0], [990, 0.09]] : [[700, 0], [440, 0.09]];
    for (const [freq, off] of notas) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + off);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + off + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.14);
      o.connect(g); g.connect(c.destination);
      o.start(t0 + off); o.stop(t0 + off + 0.16);
    }
  } catch { /* sem áudio: segue sem bipe */ }
}

/** Detector offline do nome (Vosk/WASM). O modelo é servido pelo Electron em modelo://vosk/pt.tar.gz. */
export async function criarWake({ nome, sens, onMatch }) {
  const { createModel } = await import('vosk-browser');
  const limite = new Promise((_, rej) => setTimeout(() => rej(new Error('o modelo de voz demorou demais para carregar')), 120000));
  const model = await Promise.race([createModel('modelo://vosk/pt.tar.gz'), limite]);
  let rec = null, ultimo = 0;
  const tratar = (t) => {
    if (!t || Date.now() - ultimo < 1500) return;
    if (casaNome(t, nome, sens)) { ultimo = Date.now(); onMatch(t); }
  };
  const novo = () => {
    rec = new model.KaldiRecognizer(16000);
    rec.on('result', (m) => tratar(m.result?.text));
    rec.on('partialresult', (m) => tratar(m.result?.partial));
  };
  novo();
  return {
    alimentar(f32) { try { rec.acceptWaveformFloat(f32, 16000); } catch { /* ignora */ } },
    reiniciar() { try { rec.remove(); } catch { /* ok */ } novo(); },
    fechar() { try { rec.remove(); model.terminate(); } catch { /* ok */ } },
  };
}
