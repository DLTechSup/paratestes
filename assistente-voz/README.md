# Assistente de voz — pastas por voz

Conversa em tempo real (voz natural do **Gemini Live**) e executa **no seu PC**: abrir pastas
(inclusive atalhos), entrar em subpastas, pesquisar referências, abrir programas e controlar o volume.

## Exemplo do seu trabalho
> "Abra a pasta Lançamentos"  → abre e **fica** nela
> "Abra a pasta Modare"       → entra em Lançamentos\Modare
> "Pesquise sete cinco vinte e seis ponto vinte e cinco vinte e seis" → abre a pasta `7526.2526` dentro da Modare

Depois você pode pedir outra referência na mesma marca, "o que tem aqui?", "volta" (sobe um nível),
"abra o Chrome", "aumenta o volume", "pausa a música"...

## Instalar (Windows)
1. Instale o **Python 3.11 ou 3.12** (python.org, marque *Add Python to PATH*).
2. Crie a chave em https://aistudio.google.com/apikey (use a conta que preferir; **não ative cobrança**).
3. Dê dois cliques em **`INICIAR.bat`**. Na 1ª vez ele instala tudo e pede a chave (fica só em `config.json`, no seu PC).
4. Fale. Com **fones de ouvido**, ponha `"fones_de_ouvido": true` em `config.json` para poder interrompê-lo falando por cima.
   Sem fones, o microfone pausa enquanto ele fala (evita ouvir a própria voz).

Microfone errado? `python voz_gemini.py --listar-mic` mostra os números; use `--mic N --saida M`.

## Configurar suas pastas (`config.json`, criado na 1ª execução)
- Seus **atalhos da Área de Trabalho** (`.lnk`) já são reconhecidos sozinhos, inclusive atalhos dentro de pastas.
- Para garantir "Lançamentos" mesmo sem atalho: `"atalhos": {"lançamentos": "D:/Trabalho/Lançamentos"}`
- Outras pastas com atalhos: `"pastas_de_atalhos": ["D:/Atalhos"]`
- Discos/pastas para procurar: `"raizes": ["D:/", "E:/Trabalho"]`
- Se você criar pastas novas, diga "atualize a lista".

## Testar sem voz e sem chave
- `python testes.py` — verifica números falados e a navegação Lançamentos > marca > referência.
- `python texto.py` — digita comandos (`pasta lançamentos`, `pasta modare`, `ref 7526.2526`).

## Observações
- A voz exige internet e a chave do Gemini; o plano gratuito pode ter limite de uso (confira no AI Studio).
  As ações no PC são locais. O modelo está em `config.json` (`modelo_voz`) caso a Google troque o nome.
- A referência é comparada só pelos **dígitos** do nome da pasta, então `7526.2526`, `7526-2526` e
  `MODARE 7526.2526` são achadas por "7526.2526".
- Não testei a voz com microfone real nem a API (sem chave aqui). Se algo falhar, copie a mensagem de erro
  que aparece no terminal.
