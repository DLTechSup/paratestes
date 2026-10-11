# Assistente V2 (Mark-LV) — guia rápido em português

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
