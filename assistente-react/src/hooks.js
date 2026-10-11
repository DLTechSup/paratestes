import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { api } from './api.js';
import { criarMotorReal } from './motor/deps.js';

let unico = null;
export const motor = () => (unico ||= criarMotorReal());

export function useMotor() {
  const m = motor();
  const estado = useSyncExternalStore((cb) => m.assinar(cb), () => m.obter());
  return [m, estado];
}

export function useConfig() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { api.cfg.obter().then(setCfg); }, []);
  const salvar = useCallback(async (patch) => { const novo = await api.cfg.salvar(patch); setCfg(novo); return novo; }, []);
  const recarregar = useCallback(async () => setCfg(await api.cfg.obter()), []);
  return [cfg, salvar, recarregar];
}

export function useInfo() {
  const [info, setInfo] = useState(null);
  useEffect(() => { api.info().then(setInfo); }, []);
  return info;
}

/** Microfones e saídas de áudio (pede permissão uma vez para os nomes aparecerem). */
export function useDispositivos(ativo) {
  const [d, setD] = useState({ entradas: [], saidas: [] });
  useEffect(() => {
    if (!ativo) return undefined;
    let vivo = true;
    (async () => {
      try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); } catch { /* sem permissão: nomes genéricos */ }
      try {
        const todos = await navigator.mediaDevices.enumerateDevices();
        if (!vivo) return;
        const lim = (t) => todos.filter((x) => x.kind === t && x.deviceId !== 'default' && x.deviceId !== 'communications')
          .map((x, i) => ({ id: x.deviceId, nome: x.label || `Dispositivo ${i + 1}` }));
        setD({ entradas: lim('audioinput'), saidas: lim('audiooutput') });
      } catch { /* ignora */ }
    })();
    return () => { vivo = false; };
  }, [ativo]);
  return d;
}

/** Atualiza as variáveis --n (nível do microfone) e --s (nível da fala) do elemento a 60 fps, sem re-renderizar o React. */
export function useNiveis(ref, m) {
  useEffect(() => {
    let id, n = 0, s = 0;
    const laco = () => {
      n += (Math.min(1, m.nivelMic * 6) - n) * 0.35;
      s += (m.nivelSaida - s) * 0.35;
      if (ref.current) { ref.current.style.setProperty('--n', n.toFixed(3)); ref.current.style.setProperty('--s', s.toFixed(3)); }
      id = requestAnimationFrame(laco);
    };
    id = requestAnimationFrame(laco);
    return () => cancelAnimationFrame(id);
  }, [ref, m]);
}
