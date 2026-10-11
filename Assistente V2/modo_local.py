#!/usr/bin/env python3
"""MODO LOCAL do Assistente V2 — voz offline, SEM API, SEM internet.

Reaproveita do Mark-LV:  core/stt.py (Vosk), actions/open_app.py,
actions/computer_settings.py (volume/brilho).
Voz de entrada: Vosk (offline, rápido).  Voz de saída: pyttsx3 (voz do Windows).
Abrir pastas/subpastas/programas: índice local em memória (assistente_lite.py).

Uso:
    python modo_local.py                 # fala no microfone
    python modo_local.py --texto         # digita em vez de falar
    python modo_local.py --listar-mic    # mostra os microfones e seus números
    python modo_local.py --mic 3         # escolhe o microfone
    python modo_local.py --sem-fala      # não responde em voz alta
Só a PRIMEIRA execução baixa o modelo de voz (~50 MB). Depois, tudo offline.
"""
import argparse
import queue
import re
import sys
import threading
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import assistente_lite as lite  # noqa: E402

LINGUA = "pt"  # modelo Vosk: pt, en-us, es...


# ───────────── fala (opcional, offline) ─────────────
class Voz:
    def __init__(self, ativa: bool):
        self.falando = False
        self._fila: "queue.Queue[str]" = queue.Queue()
        self.ativa = ativa
        if ativa:
            threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self):
        try:
            import pyttsx3
            motor = pyttsx3.init()
            for v in motor.getProperty("voices"):  # prefere voz em português
                if "portug" in (v.name + str(v.languages)).lower() or "pt-" in v.id.lower():
                    motor.setProperty("voice", v.id)
                    break
            motor.setProperty("rate", 185)
        except Exception as e:
            print(f"[voz] indisponível ({e}); respondendo só em texto.")
            self.ativa = False
            return
        while True:
            texto = self._fila.get()
            self.falando = True
            try:
                motor.say(texto)
                motor.runAndWait()
            except Exception:
                pass
            self.falando = False

    def dizer(self, texto: str):
        print(f"🤖 {texto}")
        if self.ativa:
            self._fila.put(texto)


# ───────────── comandos ─────────────
ATIVACAO = re.compile(r"^(jarvis|assistente|computador)[ ,]+", re.I)
ABRIR = re.compile(r"^(abrir|abra|abre|iniciar|inicie|executar|execute|rodar|va para|ir para|mostrar|mostre|open)\b", re.I)


def abrir_com_markslv(nome: str) -> str:
    """Último recurso: o lançador do Mark-LV (apelidos de apps por sistema)."""
    try:
        from actions.open_app import open_app
        return open_app({"app_name": nome})
    except Exception as e:
        return f"Não consegui abrir {nome}: {e}"


def executar(cfg: dict, indice: dict, fala: str, voz: Voz) -> bool:
    """Devolve False para encerrar."""
    texto = ATIVACAO.sub("", fala.strip())
    n = lite.normalizar(texto)
    if not n:
        return True

    if n in ("sair", "encerrar", "tchau", "pode fechar", "desligar assistente"):
        voz.dizer("Até logo.")
        return False

    if n in ("atualizar indice", "reindexar", "atualizar lista"):
        voz.dizer("Atualizando a lista de pastas e programas.")
        indice.clear()
        indice.update(lite.indexar(cfg, forcar=True))
        voz.dizer("Pronto.")
        return True

    # volume / brilho (Mark-LV computer_settings)
    if "volume" in n or "silenciar" in n or "mudo" in n or "brilho" in n:
        try:
            from actions import computer_settings as cs
            if "silenciar" in n or "mudo" in n:
                cs.volume_mute()
            elif "volume" in n and any(p in n for p in ("aumentar", "sobe", "subir", "mais", "alto")):
                cs.volume_up()
            elif "volume" in n and any(p in n for p in ("diminuir", "baixar", "baixa", "menos", "baixo")):
                cs.volume_down()
            elif "brilho" in n and any(p in n for p in ("aumentar", "subir", "mais")):
                cs.brightness_up()
            elif "brilho" in n and any(p in n for p in ("diminuir", "baixar", "menos")):
                cs.brightness_down()
            else:
                return True
            voz.dizer("Feito.")
        except Exception as e:
            voz.dizer(f"Não consegui ajustar: {e}")
        return True

    # abrir pasta / subpasta / programa
    if ABRIR.match(texto):
        msg, item = lite.interpretar(cfg, indice, texto)
        if item:
            voz.dizer(msg)
        else:
            alvo = lite.re.sub(lite.VERBOS, "", texto, flags=re.I).strip()
            alvo = re.sub(r"^(o|a|os|as|programa|aplicativo|app)\s+", "", alvo, flags=re.I)
            voz.dizer(abrir_com_markslv(alvo))
        return True

    # buscar X: lista os 3 melhores
    if n.startswith(("buscar ", "procurar ", "onde fica ")):
        termo = texto.split(" ", 1)[1] if " " in texto else ""
        achados = lite.buscar(indice, termo, limite=3)
        voz.dizer(("Encontrei: " + "; ".join(f"{a['tipo']} {a['nome']}" for a in achados))
                  if achados else f"Não encontrei {termo}.")
        return True

    print(f"(ignorado: '{fala}' — comece com 'abrir ...')")
    return True


# ───────────── entrada ─────────────
def loop_texto(cfg, indice, voz):
    print("Modo texto. Ex.: abrir chrome | abrir pasta downloads | volume mais | sair")
    while True:
        try:
            fala = input("> ")
        except (EOFError, KeyboardInterrupt):
            break
        if not executar(cfg, indice, fala, voz):
            break


def loop_voz(cfg, indice, voz, mic):
    import sounddevice as sd
    from core.stt import VoskSTT

    stt = VoskSTT(language=LINGUA)  # 1ª vez baixa o modelo; depois offline
    audio: "queue.Queue[bytes]" = queue.Queue()

    def cb(dados, frames, tempo, status):
        audio.put(bytes(dados))

    voz.dizer("Assistente local pronto. Pode falar.")
    with sd.RawInputStream(samplerate=16000, blocksize=4000, dtype="int16",
                           channels=1, device=mic, callback=cb):
        parcial_antigo = ""
        while True:
            pedaco = audio.get()
            if voz.falando:  # evita o assistente ouvir a si mesmo
                while not audio.empty():
                    audio.get_nowait()
                continue
            texto, final = stt.process_chunk(pedaco)
            if final:
                if texto.strip():
                    print(f"🎤 {texto}")
                    t0 = time.time()
                    if not executar(cfg, indice, texto, voz):
                        return
                    print(f"   ({time.time() - t0:.2f}s)")
                parcial_antigo = ""
            elif texto and texto != parcial_antigo:
                parcial_antigo = texto
                print(f"   … {texto}", end="\r")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--texto", action="store_true")
    ap.add_argument("--sem-fala", action="store_true")
    ap.add_argument("--mic", type=int, default=None)
    ap.add_argument("--listar-mic", action="store_true")
    a = ap.parse_args()

    if a.listar_mic:
        import sounddevice as sd
        print(sd.query_devices())
        return

    cfg = lite.carregar_config()
    indice = lite.indexar(cfg)
    voz = Voz(ativa=not a.sem_fala)
    try:
        (loop_texto if a.texto else lambda c, i, v: loop_voz(c, i, v, a.mic))(cfg, indice, voz)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
