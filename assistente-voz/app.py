#!/usr/bin/env python3
"""Janela do Assistente de Voz: pede a chave dentro do programa, escolhe o microfone e conversa por voz."""
import asyncio
import queue
import sys
import threading
import traceback
import webbrowser

import tkinter as tk
from tkinter import messagebox, ttk

import nucleo

COR_FUNDO, COR_CARTAO, COR_TEXTO, COR_SUAVE = "#14161c", "#1e212b", "#eef1f6", "#9aa3b5"
COR_OK, COR_ALERTA, COR_DESTAQUE = "#3ddc97", "#ffb454", "#6ea8ff"


def listar_dispositivos():
    """([(rótulo, número)] de microfones, [(rótulo, número)] de saídas) só da API de áudio padrão do Windows."""
    ent, sai = [("Padrão do Windows", None)], [("Padrão do Windows", None)]
    try:
        import sounddevice as sd
        padrao = sd.default.hostapi
        for i, d in enumerate(sd.query_devices()):
            if d["hostapi"] != padrao:
                continue
            if d["max_input_channels"] > 0:
                ent.append((f"{i}: {d['name']}", i))
            if d["max_output_channels"] > 0:
                sai.append((f"{i}: {d['name']}", i))
    except Exception:
        pass
    return ent, sai


class App:
    def __init__(self, raiz: tk.Tk):
        self.raiz = raiz
        self.cfg = nucleo.carregar_config()
        self.fila: "queue.Queue[tuple]" = queue.Queue()
        self.parar = threading.Event()
        self.thread = None
        self._linha_aberta = False
        self.assistente = None

        raiz.title("Assistente de Voz")
        raiz.geometry("720x600")
        raiz.minsize(620, 520)
        raiz.configure(bg=COR_FUNDO)
        raiz.protocol("WM_DELETE_WINDOW", self.fechar)
        self._estilo()

        topo = tk.Frame(raiz, bg=COR_FUNDO)
        topo.pack(fill="x", padx=18, pady=(16, 6))
        tk.Label(topo, text="🎙  Assistente de Voz", font=("Segoe UI", 17, "bold"), bg=COR_FUNDO, fg=COR_TEXTO).pack(side="left")
        adm = nucleo.e_administrador()
        tk.Label(topo, text="✔ Administrador" if adm else "⚠ Sem administrador", font=("Segoe UI", 9),
                 bg=COR_FUNDO, fg=COR_OK if adm else COR_ALERTA).pack(side="right")

        self.quadro_chave = self._montar_quadro_chave()
        self.quadro_main = self._montar_quadro_principal()
        self.mostrar_chave() if not self.cfg.get("gemini_api_key") else self.mostrar_principal(auto=True)
        self.raiz.after(100, self._ler_fila)

    # ---------- visual ----------
    def _estilo(self):
        s = ttk.Style()
        try:
            s.theme_use("clam")
        except tk.TclError:
            pass
        s.configure("TCombobox", fieldbackground=COR_CARTAO, background="#2b2f3d", foreground=COR_TEXTO,
                    arrowcolor=COR_TEXTO, selectbackground=COR_CARTAO, selectforeground=COR_TEXTO, bordercolor="#323746")
        s.map("TCombobox", fieldbackground=[("readonly", COR_CARTAO)], foreground=[("readonly", COR_TEXTO)],
              selectbackground=[("readonly", COR_CARTAO)], selectforeground=[("readonly", COR_TEXTO)])
        s.configure("TCheckbutton", background=COR_FUNDO, foreground=COR_SUAVE, focuscolor=COR_FUNDO)
        s.map("TCheckbutton", background=[("active", COR_FUNDO)])
        s.configure("Cartao.TCheckbutton", background=COR_CARTAO, foreground=COR_SUAVE)
        s.map("Cartao.TCheckbutton", background=[("active", COR_CARTAO)])
        self.raiz.option_add("*TCombobox*Listbox.background", COR_CARTAO)
        self.raiz.option_add("*TCombobox*Listbox.foreground", COR_TEXTO)

    def _botao(self, pai, texto, cmd, cor=COR_DESTAQUE, **kw):
        return tk.Button(pai, text=texto, command=cmd, bg=cor, fg="#0b0d12", activebackground=cor, relief="flat",
                         font=("Segoe UI", 11, "bold"), padx=16, pady=8, cursor="hand2", bd=0, **kw)

    def _montar_quadro_chave(self):
        q = tk.Frame(self.raiz, bg=COR_CARTAO)
        tk.Label(q, text="Cole aqui a sua chave do Gemini", font=("Segoe UI", 14, "bold"), bg=COR_CARTAO, fg=COR_TEXTO).pack(anchor="w", padx=22, pady=(22, 4))
        tk.Label(q, text="Ela começa com  AIza…  e fica salva só neste computador.", font=("Segoe UI", 10),
                 bg=COR_CARTAO, fg=COR_SUAVE).pack(anchor="w", padx=22)
        linha = tk.Frame(q, bg=COR_CARTAO)
        linha.pack(fill="x", padx=22, pady=(16, 4))
        self.var_chave = tk.StringVar()
        self.entrada_chave = tk.Entry(linha, textvariable=self.var_chave, show="•", font=("Consolas", 12), bg=COR_FUNDO,
                                      fg=COR_TEXTO, insertbackground=COR_TEXTO, relief="flat", bd=0, highlightthickness=1,
                                      highlightbackground="#323746", highlightcolor=COR_DESTAQUE)
        self.entrada_chave.pack(side="left", fill="x", expand=True, ipady=9)
        tk.Button(linha, text="Colar", command=self.colar_chave, bg="#2b2f3d", fg=COR_TEXTO, relief="flat", bd=0,
                  font=("Segoe UI", 10), padx=14, pady=8, cursor="hand2").pack(side="left", padx=(8, 0))
        self.var_ver = tk.BooleanVar(value=False)
        ttk.Checkbutton(q, text="Mostrar a chave", variable=self.var_ver, style="Cartao.TCheckbutton",
                        command=lambda: self.entrada_chave.config(show="" if self.var_ver.get() else "•")).pack(anchor="w", padx=22)
        self.aviso_chave = tk.Label(q, text="", font=("Segoe UI", 10), bg=COR_CARTAO, fg=COR_ALERTA, wraplength=620, justify="left")
        self.aviso_chave.pack(anchor="w", padx=22, pady=(8, 0))
        botoes = tk.Frame(q, bg=COR_CARTAO)
        botoes.pack(anchor="w", padx=22, pady=(14, 22))
        self._botao(botoes, "Salvar e começar", self.salvar_chave).pack(side="left")
        link = tk.Label(botoes, text="Ainda não tenho a chave (abrir página)", font=("Segoe UI", 10, "underline"),
                        bg=COR_CARTAO, fg=COR_DESTAQUE, cursor="hand2")
        link.pack(side="left", padx=18)
        link.bind("<Button-1>", lambda e: webbrowser.open("https://aistudio.google.com/apikey"))
        self.entrada_chave.bind("<Return>", lambda e: self.salvar_chave())
        self.entrada_chave.bind("<Control-v>", lambda e: (self.colar_chave(), "break")[1])
        return q

    def _montar_quadro_principal(self):
        q = tk.Frame(self.raiz, bg=COR_FUNDO)
        cart = tk.Frame(q, bg=COR_CARTAO)
        cart.pack(fill="x", pady=(0, 10))
        self.rotulo_status = tk.Label(cart, text="⚪  Parado", font=("Segoe UI", 15, "bold"), bg=COR_CARTAO, fg=COR_TEXTO)
        self.rotulo_status.pack(anchor="w", padx=20, pady=(16, 0))
        self.rotulo_pasta = tk.Label(cart, text="Pasta atual: nenhuma", font=("Segoe UI", 10), bg=COR_CARTAO, fg=COR_SUAVE,
                                     wraplength=640, justify="left")
        self.rotulo_pasta.pack(anchor="w", padx=20, pady=(2, 10))
        barra = tk.Frame(cart, bg=COR_CARTAO)
        barra.pack(fill="x", padx=20, pady=(0, 16))
        self.botao_iniciar = self._botao(barra, "▶  Iniciar", self.alternar)
        self.botao_iniciar.pack(side="left")
        tk.Button(barra, text="Trocar chave", command=self.mostrar_chave, bg="#2b2f3d", fg=COR_TEXTO, relief="flat", bd=0,
                  font=("Segoe UI", 10), padx=12, pady=8, cursor="hand2").pack(side="right")

        ent, sai = listar_dispositivos()
        self._ent, self._sai = ent, sai
        conf = tk.Frame(q, bg=COR_FUNDO)
        conf.pack(fill="x", pady=(0, 8))
        tk.Label(conf, text="Microfone", font=("Segoe UI", 10), bg=COR_FUNDO, fg=COR_SUAVE).grid(row=0, column=0, sticky="w")
        tk.Label(conf, text="Saída de som", font=("Segoe UI", 10), bg=COR_FUNDO, fg=COR_SUAVE).grid(row=0, column=1, sticky="w", padx=(12, 0))
        self.cb_mic = ttk.Combobox(conf, values=[r for r, _ in ent], state="readonly", width=34)
        self.cb_sai = ttk.Combobox(conf, values=[r for r, _ in sai], state="readonly", width=34)
        self.cb_mic.grid(row=1, column=0, sticky="we", pady=(2, 6))
        self.cb_sai.grid(row=1, column=1, sticky="we", padx=(12, 0), pady=(2, 6))
        conf.columnconfigure(0, weight=1)
        conf.columnconfigure(1, weight=1)
        for cb, lista, chave in ((self.cb_mic, ent, "mic"), (self.cb_sai, sai, "saida")):
            ids = [n for _, n in lista]
            cb.current(ids.index(self.cfg.get(chave)) if self.cfg.get(chave) in ids else 0)
        self.var_fones = tk.BooleanVar(value=bool(self.cfg.get("fones_de_ouvido")))
        ttk.Checkbutton(conf, text="Estou usando fones de ouvido (permite me interromper falando por cima)",
                        variable=self.var_fones, style="TCheckbutton").grid(row=2, column=0, columnspan=2, sticky="w")

        self.log_txt = tk.Text(q, bg=COR_CARTAO, fg=COR_TEXTO, relief="flat", bd=0, font=("Segoe UI", 10), wrap="word",
                               padx=14, pady=12, state="disabled", height=10)
        self.log_txt.pack(fill="both", expand=True)
        self.log_txt.tag_config("voce", foreground=COR_DESTAQUE)
        self.log_txt.tag_config("acao", foreground=COR_OK)
        self.log_txt.tag_config("aviso", foreground=COR_ALERTA)
        self.log_txt.tag_config("bot", foreground=COR_TEXTO)
        return q

    # ---------- telas ----------
    def mostrar_chave(self, aviso=""):
        self.parar_voz()
        self.quadro_main.pack_forget()
        self.aviso_chave.config(text=aviso)
        self.quadro_chave.pack(fill="x", padx=18, pady=10)
        self.entrada_chave.focus_set()

    def mostrar_principal(self, auto=False):
        self.quadro_chave.pack_forget()
        self.quadro_main.pack(fill="both", expand=True, padx=18, pady=(4, 16))
        if auto:
            self.raiz.after(400, self.iniciar)

    def colar_chave(self):
        try:
            self.var_chave.set(self.raiz.clipboard_get().strip())
        except tk.TclError:
            self.aviso_chave.config(text="Não há nada copiado. Copie a chave e tente de novo.")

    def salvar_chave(self):
        chave = nucleo.extrair_chave(self.var_chave.get())
        if not chave:
            self.aviso_chave.config(text="Isso não parece uma chave do Gemini (ela começa com AIza e é longa). Confira e cole de novo.")
            return
        nucleo.salvar_chave(chave)
        self.cfg["gemini_api_key"] = chave
        self.var_chave.set("")
        self.mostrar_principal(auto=True)

    # ---------- voz ----------
    def log(self, msg, fim="\n"):
        self.fila.put((msg, fim))

    def alternar(self):
        self.parar_voz() if self.thread and self.thread.is_alive() else self.iniciar()

    def iniciar(self):
        if self.thread and self.thread.is_alive():
            return
        mic = dict(self._ent_ids())[self.cb_mic.get()] if self.cb_mic.get() else None
        saida = dict(self._sai_ids())[self.cb_sai.get()] if self.cb_sai.get() else None
        self.cfg["fones_de_ouvido"] = self.var_fones.get()
        nucleo.salvar_config(mic=mic, saida=saida, fones_de_ouvido=self.var_fones.get())
        self.parar.clear()
        self._definir_status("🟡  Conectando…")
        self.botao_iniciar.config(text="■  Parar", bg="#ff7a7a", activebackground="#ff7a7a")
        self.thread = threading.Thread(target=self._trabalhar, args=(mic, saida), daemon=True)
        self.thread.start()

    def _ent_ids(self):
        return [(r, n) for r, n in self._ent]

    def _sai_ids(self):
        return [(r, n) for r, n in self._sai]

    def parar_voz(self):
        self.parar.set()

    def _trabalhar(self, mic, saida):
        try:
            import voz_gemini
            if self.assistente is None:
                self.assistente = nucleo.Assistente(self.cfg)
                self.assistente.log = lambda *a, **k: None
                self.log("Carregando pastas e atalhos…")
                self.assistente._catalogo_ok()
                self.log(f"Pronto: {len(self.assistente._catalogo)} pastas conhecidas.", )
            resultado = asyncio.run(voz_gemini.rodar(self.cfg, self.assistente, mic, saida, self.log, self.parar))
            self.fila.put(("__fim__", resultado))
        except Exception as e:
            self.log(f"⚠ Erro: {e}")
            self.log(traceback.format_exc())
            self.fila.put(("__fim__", "erro"))

    def _definir_status(self, txt):
        self.rotulo_status.config(text=txt)

    def _ler_fila(self):
        try:
            while True:
                msg, fim = self.fila.get_nowait()
                if msg == "__fim__":
                    self.botao_iniciar.config(text="▶  Iniciar", bg=COR_DESTAQUE, activebackground=COR_DESTAQUE)
                    self._definir_status("⚪  Parado")
                    if fim == "chave_invalida":
                        self.mostrar_chave("O Google recusou essa chave. Confira se copiou inteira e cole de novo.")
                    continue
                if "Conectado" in msg:
                    self._definir_status("🟢  Ouvindo — pode falar")
                elif "Conexão caiu" in msg:
                    self._definir_status("🟡  Reconectando…")
                tag = "voce" if msg.startswith("você:") else "acao" if msg.startswith("⚙") else "aviso" if msg.startswith("⚠") else "bot"
                self.log_txt.config(state="normal")
                if self._linha_aberta and fim != "":
                    self.log_txt.insert("end", "\n")
                self.log_txt.insert("end", msg + fim, tag)
                self._linha_aberta = fim == ""
                self.log_txt.see("end")
                self.log_txt.config(state="disabled")
        except queue.Empty:
            pass
        if self.assistente is not None:
            atual = self.assistente.atual
            self.rotulo_pasta.config(text=f"Pasta atual: {atual}" if atual else "Pasta atual: nenhuma")
        self.raiz.after(120, self._ler_fila)

    def fechar(self):
        self.parar.set()
        self.raiz.destroy()


def main():
    if sys.platform == "win32":
        try:
            import ctypes
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            pass
    raiz = tk.Tk()
    try:
        App(raiz)
        raiz.mainloop()
    except Exception:
        texto = traceback.format_exc()
        try:
            (nucleo.AQUI / "erro.log").write_text(texto, encoding="utf-8")
            messagebox.showerror("Assistente de Voz", "O programa encontrou um erro. Detalhes salvos em erro.log\n\n" + texto[-600:])
        except Exception:
            pass


if __name__ == "__main__":
    main()
