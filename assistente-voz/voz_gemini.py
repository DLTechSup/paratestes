#!/usr/bin/env python3
"""Assistente de voz em tempo real (Gemini Live) que controla pastas, programas e o PC.

A conversa (ouvir + entender + falar) roda no Gemini Live; as ações rodam LOCALMENTE em nucleo.py.

    python voz_gemini.py                 # conversa por voz
    python voz_gemini.py --listar-mic    # lista microfones/alto-falantes e seus números
    python voz_gemini.py --mic 2 --saida 4
"""
import argparse
import asyncio
import queue
import sys
import time
import traceback

import nucleo

ENTRADA_HZ, SAIDA_HZ = 16000, 24000

INSTRUCAO = """Você é um assistente de voz pessoal, em português do Brasil, que conversa de forma natural,
calorosa e descontraída, como uma pessoa ao lado do usuário. Você controla o computador dele por ferramentas.

REGRAS DE VELOCIDADE:
- Quando o usuário pedir algo que uma ferramenta resolve, CHAME A FERRAMENTA IMEDIATAMENTE, sem pedir confirmação
  e sem explicar antes. Só depois responda, em UMA frase curta ("Pronto, abri a Modare.").
- Se o usuário pedir várias coisas de uma vez, chame as ferramentas na ordem pedida, uma após a outra.
- Fale pouco. Nada de listas longas, nem repetir o que o usuário disse.

PASTAS (o trabalho principal do usuário):
- Existe uma pasta "Lançamentos" com ~56 marcas de calçados; cada marca tem pastas de referências.
- 'abrir_pasta' abre pastas pelo nome. Depois de abrir uma pasta você FICA nela: abrir_pasta com o nome da marca
  entra nessa marca; com o nome de uma subpasta, entra nela. Não use na_raiz a menos que ele peça outra pasta fora dali.
- Referências são números como 7526.2526. Se o usuário disser por extenso ("sete cinco vinte e seis ponto vinte e cinco
  vinte e seis"), converta para dígitos ("7526.2526") antes de chamar 'pesquisar_referencia'.
- Se a ferramenta disser que não achou, diga isso e pergunte o nome certo; nunca invente que abriu.
- Nomes de marcas podem ser ouvidos errado: se a ferramenta não achar, tente uma grafia parecida antes de desistir.

OUTROS: abrir programas (abrir_programa) e controlar o PC (controlar_pc: volume, música, janelas...).
Se o usuário só conversar, converse normalmente e com leveza."""


class Tocador:
    """Fila de áudio de saída numa thread própria; esvaziar = o usuário interrompeu."""

    def __init__(self, dispositivo=None):
        import sounddevice as sd
        self.q: "queue.Queue[bytes]" = queue.Queue()
        self.fim_previsto = 0.0
        self._stream = sd.RawOutputStream(samplerate=SAIDA_HZ, channels=1, dtype="int16", device=dispositivo)
        self._stream.start()
        import threading
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self):
        while True:
            dados = self.q.get()
            try:
                self._stream.write(dados)
            except Exception:
                pass

    def tocar(self, dados: bytes):
        agora = time.time()
        self.fim_previsto = max(self.fim_previsto, agora) + len(dados) / (2 * SAIDA_HZ)
        self.q.put(dados)

    def interromper(self):
        try:
            while True:
                self.q.get_nowait()
        except queue.Empty:
            pass
        self.fim_previsto = 0.0

    def falando(self) -> bool:
        return time.time() < self.fim_previsto + 0.35


def montar_config(cfg: dict, com_ajustes: bool = True):
    from google.genai import types
    base = dict(
        response_modalities=["AUDIO"],
        system_instruction=INSTRUCAO,
        tools=[{"function_declarations": nucleo.FERRAMENTAS}],
        input_audio_transcription={},
        output_audio_transcription={},
    )
    if cfg.get("voz"):
        base["speech_config"] = types.SpeechConfig(voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=cfg["voz"])))
    if com_ajustes:
        # Fim de fala rápido = ele responde logo depois que você termina de falar.
        base["realtime_input_config"] = types.RealtimeInputConfig(
            automatic_activity_detection=types.AutomaticActivityDetection(
                start_of_speech_sensitivity=types.StartSensitivity.START_SENSITIVITY_HIGH,
                end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_HIGH,
                prefix_padding_ms=120,
                silence_duration_ms=450,
            ))
        base["context_window_compression"] = types.ContextWindowCompressionConfig(
            sliding_window=types.SlidingWindow())
    return types.LiveConnectConfig(**base)


async def sessao(cfg: dict, assistente: nucleo.Assistente, mic, saida, com_ajustes: bool):
    import sounddevice as sd
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=cfg["gemini_api_key"], http_options={"api_version": "v1beta"})
    config = montar_config(cfg, com_ajustes)
    loop = asyncio.get_running_loop()
    tocador = Tocador(saida)
    fila_mic: "asyncio.Queue[bytes]" = asyncio.Queue(maxsize=100)
    fones = bool(cfg.get("fones_de_ouvido"))

    def cb(dados, frames, tempo, status):
        if not fones and tocador.falando():
            return  # sem fones: não deixa o microfone captar a própria voz do assistente
        try:
            loop.call_soon_threadsafe(fila_mic.put_nowait, bytes(dados))
        except Exception:
            pass

    async with client.aio.live.connect(model=cfg["modelo_voz"], config=config) as session:
        print("🎤 Conectado. Pode falar!  (Ctrl+C para sair)")

        async def enviar():
            while True:
                dados = await fila_mic.get()
                await session.send_realtime_input(audio=types.Blob(data=dados, mime_type="audio/pcm;rate=16000"))

        async def receber():
            while True:
                async for r in session.receive():
                    if r.data:
                        tocador.tocar(r.data)
                    sc = r.server_content
                    if sc:
                        if getattr(sc, "interrupted", False):
                            tocador.interromper()
                        it = getattr(sc, "input_transcription", None)
                        if it and it.text:
                            print(f"   você: {it.text}")
                        ot = getattr(sc, "output_transcription", None)
                        if ot and ot.text:
                            print(f"   🤖 {ot.text}")
                    if r.tool_call:
                        respostas = []
                        for fc in r.tool_call.function_calls:
                            t0 = time.time()
                            res = await asyncio.to_thread(nucleo.executar_ferramenta, assistente, fc.name, dict(fc.args or {}))
                            print(f"   ⚙ {fc.name}({dict(fc.args or {})}) → {res}  [{time.time() - t0:.2f}s]")
                            respostas.append(types.FunctionResponse(id=fc.id, name=fc.name, response={"result": res}))
                        await session.send_tool_response(function_responses=respostas)

        with sd.RawInputStream(samplerate=ENTRADA_HZ, channels=1, dtype="int16", blocksize=1024,
                               device=mic, callback=cb):
            async with asyncio.TaskGroup() as tg:
                tg.create_task(enviar())
                tg.create_task(receber())


async def principal(args):
    cfg = nucleo.carregar_config()
    if not cfg.get("gemini_api_key"):
        cfg["gemini_api_key"] = nucleo.pedir_chave()
    assistente = nucleo.Assistente(cfg)
    print("Executando como ADMINISTRADOR ✔" if nucleo.e_administrador() else
          "⚠ Sem permissão de administrador (algumas pastas podem não abrir). Use o .exe ou o INICIAR.bat.")
    print("Carregando pastas e atalhos...")
    t0 = time.time()
    await asyncio.to_thread(assistente._catalogo_ok)
    print(f"Pronto: {len(assistente._catalogo)} pastas conhecidas ({time.time() - t0:.1f}s).")

    com_ajustes, falhas = True, 0
    while True:
        try:
            await sessao(cfg, assistente, args.mic, args.saida, com_ajustes)
            falhas = 0
        except KeyboardInterrupt:
            return
        except Exception as eg:
            lista = getattr(eg, "exceptions", None) or [eg]
            erro = "; ".join(str(e) for e in lista)
            print(f"⚠ Conexão caiu: {erro}")
            baixo = erro.lower()
            if "api key" in baixo or "permission" in baixo or "401" in baixo or "403" in baixo:
                print("   A chave foi recusada pelo Google. Apague o arquivo chave_api.txt (ao lado do programa) e abra de novo para colar uma chave válida.")
                return
            if "1007" in baixo or "invalid_argument" in baixo or "invalid argument" in baixo:
                com_ajustes = False  # algum ajuste fino não é aceito por esse modelo: tenta sem
                print("   (tentando sem os ajustes finos)")
            falhas += 1
            await asyncio.sleep(min(2 * falhas, 10))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mic", type=int, default=None, help="número do microfone (veja --listar-mic)")
    ap.add_argument("--saida", type=int, default=None, help="número do alto-falante/fone")
    ap.add_argument("--listar-mic", action="store_true")
    args = ap.parse_args()
    if args.listar_mic:
        import sounddevice as sd
        print(sd.query_devices())
        return
    try:
        asyncio.run(principal(args))
    except KeyboardInterrupt:
        print("\nAté logo!")
    except Exception:
        traceback.print_exc()


if __name__ == "__main__":
    main()
