#!/usr/bin/env python3
"""Assistente V2 — abre pastas, subpastas e programas do seu computador.

Inspirado no Mark-LV (open_app / file_controller), mas sem dependências
externas: usa só a biblioteca padrão do Python 3.8+ (tkinter para a janela).

Uso:
    python assistente.py                  -> abre a janela
    python assistente.py abrir chrome     -> executa um comando direto
    python assistente.py --cli            -> modo texto interativo
    python assistente.py --reindexar      -> refaz o índice de pastas/programas
"""
import difflib
import json
import os
import platform
import re
import shlex
import subprocess
import sys
import time
import unicodedata
from pathlib import Path

SISTEMA = platform.system()  # Windows | Darwin | Linux
AQUI = Path(__file__).resolve().parent
ARQ_CONFIG = AQUI / "config.json"
ARQ_INDICE = AQUI / "indice.json"

CONFIG_PADRAO = {
    # Pastas-raiz varridas recursivamente (subpastas incluídas).
    # Vazio = usa Desktop, Documentos, Downloads, Imagens, Músicas, Vídeos.
    "raizes": [],
    "profundidade_maxima": 6,
    # Nomes de pastas que nunca são varridas (ruído/sistema).
    "ignorar": ["node_modules", ".git", "__pycache__", "$RECYCLE.BIN",
                "System Volume Information", "AppData", "Library", ".cache",
                ".venv", "venv", "site-packages"],
    "indice_validade_horas": 12,
    # Atalhos pessoais: "meu projeto": "C:/Users/voce/Projetos/x"
    "apelidos": {},
}

VERBOS = r"^(abrir|abra|abre|open|iniciar|inicie|executar|execute|rodar|va para|ir para|mostrar|mostre)\s+"
PREFIXOS_PASTA = ("pasta ", "diretorio ", "diretório ", "folder ")
PREFIXOS_APP = ("programa ", "aplicativo ", "app ", "o ", "a ")


# ───────────────────────── utilidades ─────────────────────────
def normalizar(txt: str) -> str:
    txt = unicodedata.normalize("NFKD", txt.lower())
    txt = "".join(c for c in txt if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]+", " ", txt).strip()


def carregar_config() -> dict:
    cfg = dict(CONFIG_PADRAO)
    if ARQ_CONFIG.exists():
        try:
            cfg.update(json.loads(ARQ_CONFIG.read_text(encoding="utf-8")))
        except Exception as e:
            print(f"[aviso] config.json inválido, usando padrão: {e}")
    else:
        ARQ_CONFIG.write_text(json.dumps(CONFIG_PADRAO, indent=2, ensure_ascii=False),
                              encoding="utf-8")
    return cfg


def raizes_padrao() -> list:
    home = Path.home()
    nomes = ["Desktop", "Área de Trabalho", "Documents", "Documentos", "Downloads",
             "Pictures", "Imagens", "Music", "Músicas", "Videos", "Vídeos", "Projetos"]
    achadas = [str(home / n) for n in nomes if (home / n).is_dir()]
    if SISTEMA == "Windows":
        for letra in "DEFG":  # outros discos
            if Path(f"{letra}:/").exists():
                achadas.append(f"{letra}:/")
    return achadas or [str(home)]


# ───────────────────────── indexação ─────────────────────────
def varrer_pastas(raizes, prof_max, ignorar) -> list:
    ignorar_n = {i.lower() for i in ignorar}
    pastas = []
    for raiz in raizes:
        raiz = os.path.abspath(os.path.expanduser(raiz))
        if not os.path.isdir(raiz):
            continue
        base = raiz.rstrip(os.sep).count(os.sep)
        pastas.append({"nome": os.path.basename(raiz) or raiz, "caminho": raiz})
        for atual, subs, _ in os.walk(raiz, onerror=lambda e: None):
            if atual.count(os.sep) - base >= prof_max:
                subs[:] = []
                continue
            subs[:] = [s for s in subs
                       if s.lower() not in ignorar_n and not s.startswith(".")]
            for s in subs:
                pastas.append({"nome": s, "caminho": os.path.join(atual, s)})
    return pastas


def programas_windows() -> list:
    apps = []
    dirs = [os.path.expandvars(r"%ProgramData%\Microsoft\Windows\Start Menu\Programs"),
            os.path.expandvars(r"%AppData%\Microsoft\Windows\Start Menu\Programs")]
    for d in dirs:
        for atual, _, arqs in os.walk(d):
            for a in arqs:
                if a.lower().endswith((".lnk", ".exe", ".url")):
                    apps.append({"nome": Path(a).stem, "caminho": os.path.join(atual, a)})
    try:  # App Paths do registro (chrome, code, winword...)
        import winreg
        chave = r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths"
        for hive in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
            try:
                with winreg.OpenKey(hive, chave) as k:
                    for i in range(winreg.QueryInfoKey(k)[0]):
                        sub = winreg.EnumKey(k, i)
                        try:
                            with winreg.OpenKey(k, sub) as sk:
                                caminho = winreg.QueryValueEx(sk, "")[0].strip('"')
                            apps.append({"nome": Path(sub).stem, "caminho": caminho})
                        except OSError:
                            pass
            except OSError:
                pass
    except ImportError:
        pass
    return apps


def programas_mac() -> list:
    apps = []
    for d in ("/Applications", "/System/Applications", str(Path.home() / "Applications")):
        if os.path.isdir(d):
            for atual, subs, _ in os.walk(d):
                for s in list(subs):
                    if s.endswith(".app"):
                        apps.append({"nome": s[:-4], "caminho": os.path.join(atual, s)})
                        subs.remove(s)
    return apps


def programas_linux() -> list:
    apps = []
    dirs = ["/usr/share/applications", "/usr/local/share/applications",
            str(Path.home() / ".local/share/applications"),
            "/var/lib/flatpak/exports/share/applications",
            "/var/lib/snapd/desktop/applications"]
    for d in dirs:
        if not os.path.isdir(d):
            continue
        for arq in os.listdir(d):
            if not arq.endswith(".desktop"):
                continue
            nome = exe = None
            oculto = False
            try:
                for linha in open(os.path.join(d, arq), encoding="utf-8", errors="ignore"):
                    if linha.startswith("Name=") and not nome:
                        nome = linha[5:].strip()
                    elif linha.startswith("Exec=") and not exe:
                        exe = linha[5:].strip()
                    elif linha.strip() in ("NoDisplay=true", "Hidden=true"):
                        oculto = True
            except OSError:
                continue
            if nome and exe and not oculto:
                exe = re.sub(r"\s%[a-zA-Z]", "", exe)  # remove %U, %f...
                apps.append({"nome": nome, "caminho": exe})
    return apps


def indexar(cfg: dict, forcar: bool = False) -> dict:
    if not forcar and ARQ_INDICE.exists():
        idade_h = (time.time() - ARQ_INDICE.stat().st_mtime) / 3600
        if idade_h < cfg["indice_validade_horas"]:
            try:
                return json.loads(ARQ_INDICE.read_text(encoding="utf-8"))
            except Exception:
                pass
    raizes = cfg["raizes"] or raizes_padrao()
    print("[indexando] pastas e programas... (pode levar alguns segundos)")
    prog = {"Windows": programas_windows, "Darwin": programas_mac}.get(SISTEMA, programas_linux)()
    indice = {"pastas": varrer_pastas(raizes, cfg["profundidade_maxima"], cfg["ignorar"]),
              "programas": prog}
    for lista in indice.values():
        for item in lista:
            item["norm"] = normalizar(item["nome"])
    ARQ_INDICE.write_text(json.dumps(indice, ensure_ascii=False), encoding="utf-8")
    print(f"[indexado] {len(indice['pastas'])} pastas, {len(indice['programas'])} programas")
    return indice


# ───────────────────────── busca ─────────────────────────
def pontuar(consulta: str, item: dict) -> float:
    nome = item["norm"]
    if not nome:
        return 0
    if nome == consulta:
        return 100
    palavras = consulta.split()
    if all(p in nome for p in palavras):
        return 80 - min(len(nome) - len(consulta), 30) * 0.5 + (10 if nome.startswith(consulta) else 0)
    r = difflib.SequenceMatcher(None, consulta, nome).ratio()
    return r * 60 if r > 0.6 else 0


def buscar(indice: dict, consulta: str, tipo: str = "tudo", limite: int = 30) -> list:
    q = normalizar(consulta)
    if not q:
        return []
    achados = []
    for t, chave in (("programa", "programas"), ("pasta", "pastas")):
        if tipo not in ("tudo", t):
            continue
        for item in indice[chave]:
            p = pontuar(q, item)
            if p > 0:
                # pastas mais rasas primeiro em caso de empate
                achados.append((p + (0.1 if t == "programa" else 0)
                                - item["caminho"].count(os.sep) * 0.01, t, item))
    achados.sort(key=lambda x: -x[0])
    return [{"tipo": t, **i} for _, t, i in achados[:limite]]


# ───────────────────────── abrir ─────────────────────────
def abrir_item(item: dict) -> str:
    caminho, tipo = item["caminho"], item["tipo"]
    try:
        if SISTEMA == "Windows":
            os.startfile(caminho)  # type: ignore[attr-defined]
        elif SISTEMA == "Darwin":
            subprocess.Popen(["open", caminho])
        elif tipo == "pasta" or os.path.exists(caminho):
            subprocess.Popen(["xdg-open", caminho])
        else:  # Exec= de um .desktop
            subprocess.Popen(shlex.split(caminho), stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, start_new_session=True)
        return f"Abrindo {tipo}: {item['nome']}"
    except Exception as e:
        return f"Não consegui abrir {item['nome']}: {e}"


def interpretar(cfg: dict, indice: dict, comando: str) -> tuple:
    """Devolve (mensagem, item_aberto|None)."""
    texto = comando.strip()
    texto = re.sub(VERBOS, "", texto, flags=re.I).strip()
    tipo = "tudo"
    baixo = texto.lower()
    for p in PREFIXOS_PASTA:
        if baixo.startswith(p):
            tipo, texto = "pasta", texto[len(p):].strip()
            break
    else:
        for p in ("programa ", "aplicativo ", "app "):
            if baixo.startswith(p):
                tipo, texto = "programa", texto[len(p):].strip()
                break
    if not texto:
        return "Diga o que abrir. Ex.: abrir chrome / abrir pasta downloads", None

    # caminho direto (ex.: C:\Users\...\Projetos ou ~/Documentos)
    direto = os.path.expanduser(texto.strip('"'))
    if os.path.exists(direto):
        item = {"tipo": "pasta" if os.path.isdir(direto) else "programa",
                "nome": os.path.basename(direto) or direto, "caminho": direto}
        return abrir_item(item), item

    for apelido, alvo in cfg["apelidos"].items():
        if normalizar(apelido) == normalizar(texto):
            item = {"tipo": "pasta" if os.path.isdir(alvo) else "programa",
                    "nome": apelido, "caminho": alvo}
            return abrir_item(item), item

    achados = buscar(indice, texto, tipo, limite=1)
    if not achados:
        return f"Não encontrei '{texto}'. Tente --reindexar ou ajuste config.json.", None
    return abrir_item(achados[0]), achados[0]


# ───────────────────────── interfaces ─────────────────────────
def modo_cli(cfg, indice):
    print("Assistente V2 — digite 'abrir <nome>', 'buscar <nome>' ou 'sair'.")
    while True:
        try:
            cmd = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if cmd.lower() in ("sair", "exit", "quit"):
            break
        if cmd.lower().startswith(("buscar ", "procurar ")):
            for r in buscar(indice, cmd.split(" ", 1)[1], limite=15):
                print(f"  [{r['tipo']}] {r['nome']}  —  {r['caminho']}")
        elif cmd:
            print(interpretar(cfg, indice, cmd)[0])


def modo_janela(cfg, indice):
    import tkinter as tk
    from tkinter import ttk

    raiz = tk.Tk()
    raiz.title("Assistente V2")
    raiz.geometry("720x460")
    entrada = ttk.Entry(raiz, font=("Segoe UI", 14))
    entrada.pack(fill="x", padx=10, pady=(10, 4))
    entrada.focus_set()
    lista = tk.Listbox(raiz, font=("Segoe UI", 11), activestyle="dotbox")
    lista.pack(fill="both", expand=True, padx=10, pady=4)
    status = ttk.Label(raiz, text="Digite para buscar · Enter abre · ↑↓ navega · Esc sai")
    status.pack(fill="x", padx=10, pady=(0, 8))
    resultados = []

    def atualizar(_=None):
        nonlocal resultados
        lista.delete(0, "end")
        texto = re.sub(VERBOS, "", entrada.get(), flags=re.I)
        tipo = "pasta" if texto.lower().startswith(PREFIXOS_PASTA) else "tudo"
        texto = re.sub(r"^(pasta|diretorio|diretório|folder|programa|app)\s+", "", texto, flags=re.I)
        resultados = buscar(indice, texto, tipo)
        for r in resultados:
            icone = "📁" if r["tipo"] == "pasta" else "⚙"
            lista.insert("end", f"{icone}  {r['nome']}    {r['caminho']}")
        if resultados:
            lista.selection_set(0)

    def abrir(_=None):
        sel = lista.curselection()
        if sel and resultados:
            status.config(text=abrir_item(resultados[sel[0]]))
        elif entrada.get().strip():
            msg, _ = interpretar(cfg, indice, entrada.get())
            status.config(text=msg)

    def mover(delta):
        sel = lista.curselection()
        if not resultados:
            return "break"
        i = max(0, min(len(resultados) - 1, (sel[0] if sel else 0) + delta))
        lista.selection_clear(0, "end")
        lista.selection_set(i)
        lista.see(i)
        return "break"

    entrada.bind("<KeyRelease>", lambda e: atualizar() if e.keysym not in ("Up", "Down", "Return") else None)
    entrada.bind("<Return>", abrir)
    entrada.bind("<Down>", lambda e: mover(1))
    entrada.bind("<Up>", lambda e: mover(-1))
    lista.bind("<Double-Button-1>", abrir)
    raiz.bind("<Escape>", lambda e: raiz.destroy())
    raiz.mainloop()


def main():
    cfg = carregar_config()
    args = sys.argv[1:]
    if "--reindexar" in args:
        indexar(cfg, forcar=True)
        return
    indice = indexar(cfg)
    if "--cli" in args:
        modo_cli(cfg, indice)
    elif args:
        print(interpretar(cfg, indice, " ".join(args))[0])
    else:
        try:
            modo_janela(cfg, indice)
        except Exception as e:  # sem tkinter / sem display
            print(f"[aviso] janela indisponível ({e}); usando modo texto.")
            modo_cli(cfg, indice)


if __name__ == "__main__":
    main()
