"""Núcleo do assistente: pastas (atalhos .lnk, subpastas, referências), programas e controles do PC.

Independente de voz e de API: a camada de voz (Gemini ou Vosk) só chama as funções
da classe `Assistente`. Biblioteca padrão apenas.
"""
import difflib
import json
import os
import platform
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
from pathlib import Path

SISTEMA = platform.system()  # Windows | Darwin | Linux
# Dentro do .exe (PyInstaller) a config fica AO LADO do executável, não na pasta temporária.
AQUI = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
ARQ_CONFIG = AQUI / "config.json"
ARQ_CHAVE = AQUI / "chave_api.txt"
MODELO_CHAVE = ("# Cole sua chave do Gemini na linha abaixo (apague este texto), salve e feche o Bloco de Notas.\n"
                "# Chave gratuita: https://aistudio.google.com/apikey\n"
                "# Esta linha não é lida (começa com #). A chave fica só neste computador.\n\n")

CONFIG_PADRAO = {
    # "nome falado": "caminho da pasta"  (ou de um atalho .lnk). Ex.: "lançamentos": "D:/Lançamentos"
    "atalhos": {},
    # Pastas extras que contêm atalhos/pastas que você abre pelo nome (além da Área de Trabalho)
    "pastas_de_atalhos": [],
    # Onde procurar pastas quando o nome não é um atalho. Vazio = pastas do usuário + discos.
    "raizes": [],
    "profundidade_raiz": 3,
    "profundidade_subpasta": 4,
    "profundidade_referencia": 6,
    "tempo_max_busca_s": 12,
    "ignorar": ["node_modules", ".git", "__pycache__", "$RECYCLE.BIN", "System Volume Information", "Windows",
                "Program Files", "Program Files (x86)", "AppData"],
    # --- voz Gemini Live ---
    "gemini_api_key": "",
    "modelo_voz": "models/gemini-3.1-flash-live-preview",
    "voz": "",                      # nome de voz do Gemini (vazio = padrão)
    "fones_de_ouvido": False,       # False: o microfone pausa enquanto ele fala (evita eco com caixas de som)
    "idioma": "pt-BR",
}


def carregar_config() -> dict:
    cfg = dict(CONFIG_PADRAO)
    if ARQ_CONFIG.exists():
        try:
            cfg.update(json.loads(ARQ_CONFIG.read_text(encoding="utf-8-sig")))
        except Exception as e:
            print(f"[aviso] config.json inválido ({e}); usando padrão.")
    else:
        ARQ_CONFIG.write_text(json.dumps(CONFIG_PADRAO, indent=2, ensure_ascii=False), encoding="utf-8")
    if not cfg.get("gemini_api_key"):
        cfg["gemini_api_key"] = ler_chave_arquivo()
    if os.environ.get("GEMINI_API_KEY"):
        cfg["gemini_api_key"] = os.environ["GEMINI_API_KEY"]
    return cfg


def ler_chave_arquivo() -> str:
    """Primeira linha útil de chave_api.txt (ignora linhas em branco e as que começam com #)."""
    try:
        for linha in ARQ_CHAVE.read_text(encoding="utf-8-sig").splitlines():
            linha = linha.strip().strip('"\'')
            if linha and not linha.startswith("#") and "COLE" not in linha.upper():
                return linha
    except OSError:
        pass
    return ""


def pedir_chave() -> str:
    """Cria chave_api.txt, abre no Bloco de Notas e espera o usuário colar a chave."""
    if not ARQ_CHAVE.exists():
        ARQ_CHAVE.write_text(MODELO_CHAVE, encoding="utf-8")
    print(f"\n>>> Cole sua chave do Gemini no arquivo:\n    {ARQ_CHAVE}")
    try:
        if SISTEMA == "Windows":
            subprocess.Popen(["notepad.exe", str(ARQ_CHAVE)])
        else:
            _abrir_so(str(ARQ_CHAVE))
    except Exception:
        pass
    while True:
        input("Depois de colar e SALVAR, volte aqui e aperte ENTER... ")
        chave = ler_chave_arquivo()
        if chave:
            return chave
        print("Ainda não encontrei a chave no arquivo. Cole, salve (Ctrl+S) e tente de novo.")


# ───────────────────────── texto ─────────────────────────
def norm(txt: str) -> str:
    txt = unicodedata.normalize("NFKD", str(txt).lower())
    txt = "".join(c for c in txt if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]+", " ", txt).strip()


def pontuar(q: str, alvo: str) -> float:
    """q e alvo já normalizados. 0 = sem relação."""
    if not q or not alvo:
        return 0
    if q == alvo:
        return 100
    palavras = q.split()
    if all(p in alvo for p in palavras):
        return 82 - min(abs(len(alvo) - len(q)), 40) * 0.4 + (8 if alvo.startswith(q) else 0)
    r = difflib.SequenceMatcher(None, q, alvo).ratio()
    return r * 70 if r >= 0.75 else 0


_UN = {"zero": 0, "um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3, "quatro": 4, "cinco": 5, "seis": 6,
       "meia": 6, "sete": 7, "oito": 8, "nove": 9, "dez": 10, "onze": 11, "doze": 12, "treze": 13,
       "catorze": 14, "quatorze": 14, "quinze": 15, "dezesseis": 16, "dezessete": 17, "dezoito": 18,
       "dezenove": 19}
_DZ = {"vinte": 20, "trinta": 30, "quarenta": 40, "cinquenta": 50, "sessenta": 60, "setenta": 70,
       "oitenta": 80, "noventa": 90}
_CT = {"cem": 100, "cento": 100, "duzentos": 200, "trezentos": 300, "quatrocentos": 400,
       "quinhentos": 500, "seiscentos": 600, "setecentos": 700, "oitocentos": 800, "novecentos": 900}
_SEP = {"ponto": ".", "virgula": ",", "traco": "-", "hifen": "-", "barra": "/", "menos": "-"}


def fala_para_numero(texto: str) -> str:
    """'sete cinco vinte e seis ponto vinte e cinco vinte e seis' -> '7526.2526'.
    Dígitos já escritos passam direto ('7526.2526' -> '7526.2526')."""
    sem_acento = "".join(c for c in unicodedata.normalize("NFKD", str(texto).lower()) if not unicodedata.combining(c))
    toks = re.findall(r"\d+(?:[.,\-/]\d+)*|[a-z]+", sem_acento)  # '7526.2526' fica inteiro; palavras separadas
    if not toks:
        return ""
    saida, i = [], 0
    while i < len(toks):
        t = toks[i]
        if t[0].isdigit():
            saida.append(t); i += 1
        elif t in _SEP:
            saida.append(_SEP[t]); i += 1
        elif t in _CT or t in _DZ or t in _UN:
            v = _CT.get(t, _DZ.get(t, _UN.get(t)))
            i += 1
            # centena [e dezena|unidade]  /  dezena [e unidade]
            if v >= 100 and i + 1 < len(toks) and toks[i] == "e":
                nxt = toks[i + 1]
                if nxt in _DZ or (nxt in _UN and _UN[nxt] < 20):
                    v += _DZ.get(nxt, _UN.get(nxt)); i += 2
                    if v % 100 >= 20 and v % 10 == 0 and i + 1 < len(toks) and toks[i] == "e" \
                            and toks[i + 1] in _UN and _UN[toks[i + 1]] < 10:
                        v += _UN[toks[i + 1]]; i += 2
            elif 20 <= v < 100 and i + 1 < len(toks) and toks[i] == "e" and toks[i + 1] in _UN and _UN[toks[i + 1]] < 10:
                v += _UN[toks[i + 1]]; i += 2
            saida.append(str(v))
        else:
            i += 1  # palavra solta ("o", "numero", "referencia") é ignorada
    return "".join(saida)


def so_digitos(txt: str) -> str:
    return re.sub(r"\D", "", txt)


# ───────────────────────── atalhos .lnk ─────────────────────────
_CACHE_LNK: dict = {}


def resolver_atalhos(caminhos: list) -> dict:
    """Devolve {caminho_do_.lnk: destino}. Windows: PowerShell/WScript.Shell (sem dependências)."""
    pendentes = [c for c in caminhos if c not in _CACHE_LNK]
    if pendentes and SISTEMA == "Windows":
        lista = Path(tempfile.gettempdir()) / "assistente_lnk.txt"
        lista.write_text("\n".join(pendentes), encoding="utf-8")
        ps = ("[Console]::OutputEncoding=[Text.Encoding]::UTF8;"
              "$s=New-Object -ComObject WScript.Shell;"
              "Get-Content -LiteralPath $env:LNKLIST -Encoding UTF8 | ForEach-Object {"
              " try { $_ + '|' + $s.CreateShortcut($_).TargetPath } catch {} }")
        try:
            r = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True,
                               env={**os.environ, "LNKLIST": str(lista)}, timeout=30)
            for linha in r.stdout.decode("utf-8", "ignore").splitlines():
                if "|" in linha:
                    origem, destino = linha.rsplit("|", 1)
                    _CACHE_LNK[origem.strip()] = destino.strip()
        except Exception as e:
            print(f"[aviso] não consegui ler atalhos: {e}")
    for c in pendentes:
        _CACHE_LNK.setdefault(c, "")
    return {c: _CACHE_LNK.get(c, "") for c in caminhos}


def pastas_desktop() -> list:
    h = Path.home()
    cand = [h / "Desktop", h / "Área de Trabalho", h / "OneDrive" / "Desktop",
            h / "OneDrive" / "Área de Trabalho", Path("C:/Users/Public/Desktop")]
    for var in ("OneDrive", "OneDriveCommercial", "OneDriveConsumer"):
        if os.environ.get(var):
            cand += [Path(os.environ[var]) / "Desktop", Path(os.environ[var]) / "Área de Trabalho"]
    if SISTEMA == "Windows":  # como administrador (outra conta) o "home" é do admin: inclui as Áreas de Trabalho de todos os perfis
        usuarios = Path(os.environ.get("SystemDrive", "C:") + "/Users")
        try:
            for u in usuarios.iterdir():
                if u.is_dir() and u.name not in ("Public", "Default", "Default User", "All Users"):
                    cand += [u / "Desktop", u / "Área de Trabalho", u / "OneDrive" / "Desktop",
                             u / "OneDrive" / "Área de Trabalho"]
        except OSError:
            pass
    vistos, saida = set(), []
    for c in cand:
        if c.is_dir() and str(c) not in vistos:
            vistos.add(str(c)); saida.append(c)
    return saida


def e_administrador() -> bool:
    try:
        import ctypes
        return bool(ctypes.windll.shell32.IsUserAnAdmin()) if SISTEMA == "Windows" else os.geteuid() == 0
    except Exception:
        return False


def _abrir_so(caminho: str):
    """Abre no explorador/programa padrão. Levanta exceção se falhar."""
    if SISTEMA == "Windows":
        os.startfile(caminho)  # type: ignore[attr-defined]
    elif SISTEMA == "Darwin":
        subprocess.Popen(["open", caminho])
    else:
        subprocess.Popen(["xdg-open", caminho], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


# ───────────────────────── assistente ─────────────────────────
class Assistente:
    def __init__(self, cfg: dict = None):
        self.cfg = cfg or carregar_config()
        self.atual = None          # pasta onde "estamos" (fica memorizada entre comandos)
        self.historico = []        # pilha para "voltar"
        self._catalogo = None
        self._catalogo_t = 0
        self._programas = None
        self.log = print

    # ---------- utilidades de pasta ----------
    def _ignorar(self):
        return {i.lower() for i in self.cfg["ignorar"]}

    def _destino_entrada(self, e):
        """(caminho_real, é_pasta) de uma entrada de os.scandir, resolvendo atalho .lnk."""
        try:
            if e.name.lower().endswith(".lnk"):
                alvo = resolver_atalhos([e.path])[e.path]
                return (alvo, os.path.isdir(alvo)) if alvo else (e.path, False)
            return e.path, e.is_dir()
        except OSError:
            return e.path, False

    def _nome_entrada(self, e):
        n = e.name
        return n[:-4] if n.lower().endswith(".lnk") else n

    def _definir_atual(self, caminho: str):
        if self.atual and self.atual != caminho:
            self.historico.append(self.atual)
        self.atual = caminho

    def _construir_catalogo(self):
        """Pastas que se abrem pelo nome em qualquer momento: config, atalhos da Área de Trabalho e raízes rasas."""
        itens = []  # (nome_norm, nome, caminho, prioridade)
        for nome, caminho in self.cfg["atalhos"].items():
            real = resolver_atalhos([caminho])[caminho] if caminho.lower().endswith(".lnk") else caminho
            if real and os.path.isdir(real):
                itens.append((norm(nome), nome, real, 3))
        locais = pastas_desktop() + [Path(p) for p in self.cfg["pastas_de_atalhos"]]
        for loc in locais:
            try:
                ents = list(os.scandir(loc))
            except OSError:
                continue
            lnks = [e.path for e in ents if e.name.lower().endswith(".lnk")]
            resolver_atalhos(lnks)
            for e in ents:
                real, eh_dir = self._destino_entrada(e)
                if eh_dir:
                    itens.append((norm(self._nome_entrada(e)), self._nome_entrada(e), real, 2))
        itens += self._varrer_raizes()
        self._catalogo, self._catalogo_t = itens, time.time()

    def _raizes(self):
        if self.cfg["raizes"]:
            return [str(Path(r).expanduser()) for r in self.cfg["raizes"]]
        h = Path.home()
        r = [str(p) for p in h.iterdir() if p.is_dir() and not p.name.startswith(".")] if h.is_dir() else []
        if SISTEMA == "Windows":
            r += [f"{l}:/" for l in "DEFGH" if Path(f"{l}:/").exists()]
        return r

    def _varrer_raizes(self):
        ign, itens = self._ignorar(), []
        limite = time.time() + self.cfg["tempo_max_busca_s"]
        for raiz in self._raizes():
            base = raiz.rstrip("\\/").count(os.sep)
            for atual, subs, _ in os.walk(raiz, onerror=lambda e: None):
                if time.time() > limite:
                    return itens
                if atual.count(os.sep) - base >= self.cfg["profundidade_raiz"]:
                    subs[:] = []
                    continue
                subs[:] = [s for s in subs if s.lower() not in ign and not s.startswith(".")]
                for s in subs:
                    itens.append((norm(s), s, os.path.join(atual, s), 1))
        return itens

    def _catalogo_ok(self, forcar=False):
        if forcar or self._catalogo is None or time.time() - self._catalogo_t > 600:
            self._construir_catalogo()
        return self._catalogo

    def _melhor_global(self, nome: str, minimo=60):
        q = norm(nome)
        melhor, mp = None, 0
        for nn, n, c, prio in self._catalogo_ok():
            p = pontuar(q, nn)
            if p <= 0:
                continue
            p += prio * 4 - c.count(os.sep) * 0.2
            if p > mp:
                melhor, mp = (n, c), p
        return melhor if mp >= minimo else None

    def _buscar_dentro(self, base: str, avaliar, prof_max: int, so_pastas=False, limite_resultados=50):
        """BFS ao vivo dentro de `base`. avaliar(nome_norm, nome, e_pasta)->pontuação. Devolve [(pont, prof, nome, caminho, e_pasta)]."""
        ign, achados = self._ignorar(), []
        nivel, limite_t = [base], time.time() + self.cfg["tempo_max_busca_s"]
        for prof in range(1, prof_max + 1):
            proximo = []
            for pasta in nivel:
                try:
                    ents = list(os.scandir(pasta))
                except OSError:
                    continue
                lnks = [e.path for e in ents if e.name.lower().endswith(".lnk")]
                if lnks:
                    resolver_atalhos(lnks)
                for e in ents:
                    if time.time() > limite_t:
                        return sorted(achados, key=lambda x: (-x[0], x[1]))[:limite_resultados]
                    if e.name.startswith(".") or e.name.lower() in ign:
                        continue
                    real, eh_dir = self._destino_entrada(e)
                    if so_pastas and not eh_dir:
                        continue
                    nome = self._nome_entrada(e)
                    p = avaliar(norm(nome), nome, eh_dir)
                    if p > 0:
                        achados.append((p - (prof - 1) * 6, prof, nome, real, eh_dir))
                    if eh_dir and not e.name.lower().endswith(".lnk"):
                        proximo.append(real)
            if achados and max(a[0] for a in achados) >= 70 - (prof - 1) * 6 and prof >= 1:
                break  # já tem algo bom em nível mais raso; não varre mais fundo
            nivel = proximo
        return sorted(achados, key=lambda x: (-x[0], x[1]))[:limite_resultados]

    def _abrir_caminho(self, caminho: str, nome: str):
        try:
            _abrir_so(caminho)
            return True
        except Exception as e:
            self.log(f"[erro] {e}")
            return False

    # ---------- ferramentas (chamadas pela voz) ----------
    def abrir_pasta(self, nome: str, na_raiz: bool = False) -> str:
        """Abre uma pasta pelo nome. Se já estamos dentro de uma pasta, procura nas subpastas dela primeiro."""
        q = norm(nome)
        if self.atual and not na_raiz:
            r = self._buscar_dentro(self.atual, lambda nn, n, d: pontuar(q, nn) if d else 0,
                                    self.cfg["profundidade_subpasta"], so_pastas=True)
            if r and r[0][0] >= 55:
                _, _, n, c, _ = r[0]
                if self._abrir_caminho(c, n):
                    self._definir_atual(c)
                    extra = f" (também achei {len(r) - 1} parecida(s))" if len(r) > 1 and r[1][0] >= r[0][0] - 3 else ""
                    return f"Abri a pasta {n}, dentro de {Path(self.historico[-1]).name}.{extra}"
        g = self._melhor_global(nome)
        if not g and self._catalogo is not None:           # catálogo pode estar velho: refaz uma vez
            self._catalogo_ok(forcar=True)
            g = self._melhor_global(nome)
        if g:
            n, c = g
            if self._abrir_caminho(c, n):
                self._definir_atual(c)
                return f"Abri a pasta {n}."
        return f"Não encontrei nenhuma pasta parecida com '{nome}'."

    def pesquisar_referencia(self, referencia: str, marca: str = "") -> str:
        """Procura, dentro da pasta atual (ou da marca indicada), pastas/arquivos cujo nome contém a referência."""
        if not self.atual:
            return "Nenhuma pasta aberta. Peça primeiro para abrir uma pasta, como Lançamentos."
        ref_txt = fala_para_numero(referencia) if re.search(r"[a-zA-Z]", referencia) else referencia
        dig = so_digitos(ref_txt)
        base = self.atual
        if marca and pontuar(norm(marca), norm(Path(self.atual).name)) >= 55:
            marca = ""  # já estamos dentro dessa marca
        if marca:
            qm = norm(marca)
            rm = self._buscar_dentro(self.atual, lambda nn, n, d: pontuar(qm, nn) if d else 0,
                                     self.cfg["profundidade_subpasta"], so_pastas=True)
            if not rm or rm[0][0] < 55:
                return f"Não achei a marca '{marca}' dentro de {Path(self.atual).name}."
            base = rm[0][3]
        if not dig:
            q = norm(referencia)
            av = lambda nn, n, d: pontuar(q, nn)
        else:
            def av(nn, n, d):
                dn = so_digitos(n)
                if dn == dig:
                    return 100
                return 85 if dig in dn else 0
        r = self._buscar_dentro(base, av, self.cfg["profundidade_referencia"])
        if not r:
            return f"Não encontrei '{ref_txt or referencia}' dentro de {Path(base).name}."
        r.sort(key=lambda x: (-x[0], not x[4], x[1]))  # melhor pontuação, pasta antes de arquivo, mais raso
        _, _, n, c, eh_dir = r[0]
        if self._abrir_caminho(c, n):
            # A pasta atual continua sendo a marca: assim a próxima referência é procurada no mesmo lugar.
            outras = [x[2] for x in r[1:4]]
            resp = f"Abri {n}."
            if outras:
                resp += f" Também há {len(r) - 1} resultado(s): {', '.join(outras)}."
            return resp
        return f"Achei {n}, mas não consegui abrir."

    def listar(self, limite: int = 15) -> str:
        if not self.atual:
            return "Nenhuma pasta aberta."
        try:
            nomes = sorted(self._nome_entrada(e) for e in os.scandir(self.atual) if not e.name.startswith("."))
        except OSError as e:
            return f"Não consegui listar: {e}"
        if not nomes:
            return f"A pasta {Path(self.atual).name} está vazia."
        mais = f" e mais {len(nomes) - limite}" if len(nomes) > limite else ""
        return f"Em {Path(self.atual).name} há {len(nomes)} itens: " + ", ".join(nomes[:limite]) + mais + "."

    def voltar(self) -> str:
        if not self.historico:
            return "Não há pasta anterior."
        self.atual = self.historico.pop()
        self._abrir_caminho(self.atual, Path(self.atual).name)
        return f"Voltei para {Path(self.atual).name}."

    def onde_estou(self) -> str:
        return f"Estou em {self.atual}." if self.atual else "Nenhuma pasta aberta."

    def limpar_contexto(self) -> str:
        self.atual, self.historico = None, []
        return "Pronto, comecei do zero."

    def atualizar_lista(self) -> str:
        self._catalogo_ok(forcar=True)
        self._programas = None
        return f"Lista atualizada: {len(self._catalogo)} pastas conhecidas."

    # ---------- programas ----------
    _ALIAS_WIN = {"calculadora": "calc.exe", "bloco de notas": "notepad.exe", "explorador": "explorer.exe",
                  "explorador de arquivos": "explorer.exe", "paint": "mspaint.exe", "prompt": "cmd.exe",
                  "terminal": "wt.exe", "painel de controle": "control.exe", "gerenciador de tarefas": "taskmgr.exe",
                  "configuracoes": "ms-settings:", "chrome": "chrome", "google chrome": "chrome", "edge": "msedge",
                  "excel": "excel", "word": "winword", "powerpoint": "powerpnt", "outlook": "outlook"}

    def _indice_programas(self):
        if self._programas is not None:
            return self._programas
        itens = []
        if SISTEMA == "Windows":
            dirs = [os.path.expandvars(r"%ProgramData%\Microsoft\Windows\Start Menu\Programs"),
                    os.path.expandvars(r"%AppData%\Microsoft\Windows\Start Menu\Programs")]
            dirs += [str(p) for p in pastas_desktop()]
            for d in dirs:
                for atual, _, arqs in os.walk(d):
                    for a in arqs:
                        if a.lower().endswith((".lnk", ".exe", ".url")):
                            itens.append((norm(Path(a).stem), Path(a).stem, os.path.join(atual, a)))
        elif SISTEMA == "Darwin":
            for d in ("/Applications", "/System/Applications"):
                if os.path.isdir(d):
                    itens += [(norm(a[:-4]), a[:-4], os.path.join(d, a)) for a in os.listdir(d) if a.endswith(".app")]
        else:
            for d in ("/usr/share/applications", str(Path.home() / ".local/share/applications")):
                if os.path.isdir(d):
                    for a in os.listdir(d):
                        if a.endswith(".desktop"):
                            itens.append((norm(a[:-8]), a[:-8], os.path.join(d, a)))
        self._programas = itens
        return itens

    def abrir_programa(self, nome: str) -> str:
        q = norm(nome)
        if SISTEMA == "Windows":
            for chave, cmd in self._ALIAS_WIN.items():
                if norm(chave) == q:
                    try:
                        os.startfile(cmd)  # type: ignore[attr-defined]
                        return f"Abri {nome}."
                    except OSError:
                        break
        melhor, mp = None, 0
        for nn, n, c in self._indice_programas():
            p = pontuar(q, nn)
            if p > mp:
                melhor, mp = (n, c), p
        if melhor and mp >= 60:
            n, c = melhor
            try:
                if SISTEMA == "Linux" and c.endswith(".desktop"):
                    subprocess.Popen(["gtk-launch", Path(c).stem], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    _abrir_so(c)
                return f"Abri {n}."
            except Exception as e:
                return f"Achei {n}, mas não consegui abrir: {e}"
        if SISTEMA == "Windows":
            try:
                os.startfile(nome)  # type: ignore[attr-defined]
                return f"Tentei abrir {nome}."
            except OSError:
                pass
        return f"Não encontrei o programa '{nome}'."

    # ---------- controles do computador ----------
    _VK = {"volume_mais": 0xAF, "volume_menos": 0xAE, "mudo": 0xAD, "play_pause": 0xB3,
           "proxima": 0xB0, "anterior": 0xB1}
    ACOES = ["volume_mais", "volume_menos", "mudo", "play_pause", "proxima", "anterior", "minimizar_tudo",
             "bloquear_tela", "captura_tela", "fechar_janela", "trocar_janela"]

    def controlar_pc(self, acao: str, passos: int = 1) -> str:
        acao = norm(acao).replace(" ", "_")
        if acao not in self.ACOES:
            return "Ação desconhecida. Opções: " + ", ".join(self.ACOES)
        passos = max(1, min(int(passos or 1), 25))
        try:
            if SISTEMA == "Windows":
                import ctypes
                u = ctypes.windll.user32

                def tecla(*vks):
                    for v in vks:
                        u.keybd_event(v, 0, 0, 0)
                    for v in reversed(vks):
                        u.keybd_event(v, 0, 2, 0)
                if acao in self._VK:
                    for _ in range(passos if acao.startswith("volume") else 1):
                        tecla(self._VK[acao])
                elif acao == "minimizar_tudo":
                    tecla(0x5B, 0x44)
                elif acao == "bloquear_tela":
                    u.LockWorkStation()
                elif acao == "captura_tela":
                    tecla(0x5B, 0x10, 0x53)
                elif acao == "fechar_janela":
                    tecla(0x12, 0x73)
                elif acao == "trocar_janela":
                    tecla(0x12, 0x09)
            elif SISTEMA == "Darwin":
                s = {"volume_mais": "set volume output volume ((output volume of (get volume settings)) + 6)",
                     "volume_menos": "set volume output volume ((output volume of (get volume settings)) - 6)",
                     "mudo": "set volume output muted true"}.get(acao)
                if not s:
                    return "Essa ação só está disponível no Windows."
                for _ in range(passos):
                    subprocess.run(["osascript", "-e", s])
            else:
                m = {"volume_mais": ["pactl", "set-sink-volume", "@DEFAULT_SINK@", "+5%"],
                     "volume_menos": ["pactl", "set-sink-volume", "@DEFAULT_SINK@", "-5%"],
                     "mudo": ["pactl", "set-sink-mute", "@DEFAULT_SINK@", "toggle"]}.get(acao)
                if not m:
                    return "Essa ação só está disponível no Windows."
                for _ in range(passos):
                    subprocess.run(m)
            return "Feito."
        except Exception as e:
            return f"Não consegui: {e}"


# Declaração das ferramentas para a voz (formato Gemini / function calling)
FERRAMENTAS = [
    {"name": "abrir_pasta",
     "description": "Abre uma pasta pelo nome (atalho, pasta ou subpasta). Se já há uma pasta aberta (ex.: Lançamentos), procura primeiro DENTRO dela, "
                    "então serve para abrir a marca e depois a subpasta da marca. Use na_raiz=true só para ignorar a pasta atual.",
     "parameters": {"type": "OBJECT", "properties": {
         "nome": {"type": "STRING", "description": "Nome da pasta como o usuário falou, ex.: 'lançamentos', 'modare', 'referências'"},
         "na_raiz": {"type": "BOOLEAN", "description": "true para procurar fora da pasta atual"}}, "required": ["nome"]}},
    {"name": "pesquisar_referencia",
     "description": "Procura e abre a pasta (ou arquivo) de uma REFERÊNCIA numérica dentro da pasta atual ou de uma marca. "
                    "Escreva a referência em dígitos, ex.: 'sete cinco vinte e seis ponto vinte e cinco vinte e seis' -> '7526.2526'.",
     "parameters": {"type": "OBJECT", "properties": {
         "referencia": {"type": "STRING", "description": "Referência em dígitos, ex.: '7526.2526'"},
         "marca": {"type": "STRING", "description": "Marca/pasta onde procurar (opcional; padrão = pasta atual)"}}, "required": ["referencia"]}},
    {"name": "listar_pasta_atual", "description": "Lista o que há dentro da pasta atual.", "parameters": {"type": "OBJECT", "properties": {}}},
    {"name": "voltar", "description": "Volta para a pasta anterior.", "parameters": {"type": "OBJECT", "properties": {}}},
    {"name": "onde_estou", "description": "Diz qual é a pasta atual.", "parameters": {"type": "OBJECT", "properties": {}}},
    {"name": "limpar_contexto", "description": "Esquece a pasta atual e recomeça do zero.", "parameters": {"type": "OBJECT", "properties": {}}},
    {"name": "abrir_programa", "description": "Abre um programa/aplicativo do computador (Chrome, Excel, Word, calculadora...).",
     "parameters": {"type": "OBJECT", "properties": {"nome": {"type": "STRING"}}, "required": ["nome"]}},
    {"name": "controlar_pc",
     "description": "Controla o computador: " + ", ".join(Assistente.ACOES) + ".",
     "parameters": {"type": "OBJECT", "properties": {
         "acao": {"type": "STRING", "enum": Assistente.ACOES},
         "passos": {"type": "INTEGER", "description": "Quantas vezes repetir (volume). Padrão 1; cada passo ≈ 2%."}}, "required": ["acao"]}},
    {"name": "atualizar_lista", "description": "Refaz a lista de pastas e programas conhecidos (use se criou pastas novas).",
     "parameters": {"type": "OBJECT", "properties": {}}},
]


def executar_ferramenta(a: Assistente, nome: str, args: dict) -> str:
    args = args or {}
    try:
        if nome == "abrir_pasta":
            return a.abrir_pasta(args.get("nome", ""), bool(args.get("na_raiz", False)))
        if nome == "pesquisar_referencia":
            return a.pesquisar_referencia(args.get("referencia", ""), args.get("marca", "") or "")
        if nome == "listar_pasta_atual":
            return a.listar()
        if nome == "voltar":
            return a.voltar()
        if nome == "onde_estou":
            return a.onde_estou()
        if nome == "limpar_contexto":
            return a.limpar_contexto()
        if nome == "abrir_programa":
            return a.abrir_programa(args.get("nome", ""))
        if nome == "controlar_pc":
            return a.controlar_pc(args.get("acao", ""), args.get("passos", 1))
        if nome == "atualizar_lista":
            return a.atualizar_lista()
        return f"Ferramenta desconhecida: {nome}"
    except Exception as e:  # nunca derruba a conversa
        return f"Erro ao executar {nome}: {e}"
