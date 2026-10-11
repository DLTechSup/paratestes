# Assistente V2 (Mark-LV) — guia rápido em português

## ▶ MODO LOCAL (sem API, sem custo) — recomendado
Usa as partes locais do Mark-LV: reconhecimento de voz offline (**Vosk**), abertura de
programas (`open_app`), volume/brilho (`computer_settings`) e um índice local de pastas
e subpastas. **Não usa Gemini nem chave de API.**

1. Instale o **Python 3.11 ou 3.12** (marque *Add Python to PATH*).
2. Dê dois cliques em **`INICIAR-LOCAL.bat`**. A 1ª vez instala os pacotes e baixa o
   modelo de voz em português (~50 MB, precisa de internet **só essa vez**).
3. Fale: "abrir chrome", "abrir pasta downloads", "abrir pasta relatórios" (acha subpastas),
   "volume mais", "silenciar", "buscar contrato", "atualizar índice", "sair".
   Pode começar com "Jarvis, ...".
- Escolher o microfone: `python modo_local.py --listar-mic` e depois `python modo_local.py --mic N`.
- Sem microfone/para testar: `python modo_local.py --texto`. Sem voz de resposta: `--sem-fala`.
- Pastas varridas e apelidos: `config.json` (criado na 1ª execução). Para varrer o disco
  todo: `"raizes": ["C:/"]`.

### Fluxo de trabalho (navegação por níveis)
O assistente lembra em qual pasta você está e procura **dentro dela**:
1. "abrir pasta Lançamentos"
2. "Nike" (só o nome da marca) → abre `Lançamentos\Nike`
3. "Referência" → abre `Lançamentos\Nike\Referência`
Outros comandos: "voltar" (sobe um nível), "o que tem aqui" (lista o conteúdo),
"onde estou", "limpar" (começa do zero). Se o nome não existir na pasta atual,
procura no computador todo. A busca dentro da pasta é ao vivo, então pastas
novas de marcas aparecem sem precisar atualizar o índice.

Limitação honesta: o Vosk entende comandos curtos bem, mas não conversa como o Gemini. Nomes de marcas (palavras estranhas) podem ser ouvidos errado; a busca aproximada ajuda, e em último caso use `--texto` ou o comando "o que tem aqui".
Funciona com frases que começam por "abrir/abra...".

---

## Modo original do Mark-LV (usa Gemini, precisa de chave)

Esta pasta é uma cópia do [Mark-LV](https://github.com/FatihMakes/Mark-LV)
(© FatihMakes, licença CC BY-NC 4.0 — uso **não comercial**, mantenha o arquivo `LICENSE`).

## Importante: ele NÃO é 100% local
A voz e o entendimento rodam no **Gemini Live** (Google). Por isso ele é fluido e entende bem,
e por isso precisa de **internet + chave de API gratuita**. Só as ações no computador
(abrir programas, pastas, arquivos, volume, etc.) são executadas localmente.

## Passo a passo (Windows)
1. Instale o **Python 3.11, 3.12 ou 3.13** (python.org) — marque *Add Python to PATH*.
2. Crie uma chave gratuita em https://aistudio.google.com/apikey
3. Dê dois cliques em **`INICIAR.bat`** (a 1ª vez instala tudo; leva alguns minutos).
4. Na tela inicial do app, cole a chave. Ela fica só no seu PC (`config/api_keys.json`).
5. Se faltar algum módulo: `pip install nome_do_modulo`.

## Comandos de voz para o que você quer
- "Abra o Chrome" / "Abra o Spotify" / "Abra o Word"
- "Abra a pasta Downloads" / "Abra a pasta Documentos"
- Para subpastas e programas fora da lista padrão, descreva o caminho completo
  ("abra a pasta D:\Projetos\Clientes").

No microfone: escolha o dispositivo correto em ⚙ (configurações) do app.
