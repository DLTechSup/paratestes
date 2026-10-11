# Assistente de Voz (React + Electron)

Assistente de voz **natural** (Gemini Live) que abre suas pastas, subpastas e referências, abre programas e controla o PC.
Interface em React, janela própria, **bandeja do Windows**, **palavra de ativação** com o nome que você escolher
e modo **ouvir direto**. Roda como **administrador** para alcançar todas as pastas e atalhos.

## Seu fluxo de trabalho
> “**Luna**, abra a pasta Lançamentos” → abre e **fica** nela  
> “Abra a pasta Modare” → entra em Lançamentos\Modare  
> “Pesquise sete cinco vinte e seis ponto vinte e cinco vinte e seis” → abre a pasta `7526.2526` dentro da Modare  
> “Volta” · “O que tem aqui?” · “Abra o Chrome” · “Aumenta o volume” · “Tchau”  
> **Sites:** “Abre o YouTube” · “Acessa gmail.com no Chrome” · “Pesquisa receita de bolo no Google” (também YouTube, Amazon, Mercado Livre)  
> **Fechar:** “Fecha essa pasta” (a última aberta) · “Fecha a pasta Modare” · “Fecha todas as pastas” · “Fecha o Chrome” (o programa ainda pergunta se quer salvar)

## Como funciona a palavra de ativação
- **Palavra de ativação** (padrão): o assistente fica dormindo. O reconhecimento do nome roda **no seu PC, offline**
  (Vosk) — nada vai para a internet enquanto ele dorme. Ao ouvir o nome ele toca um bipe, conecta ao Gemini e atende.
  Se você falar o nome e o comando juntos (“Luna, abre a Modare”), ele não perde nada: guarda os últimos 2,5 s de áudio.
  Depois de alguns segundos sem você falar (ajustável), ou se você disser “tchau”, ele volta a dormir.
- **Ouvir direto**: sem nome; fica conectado ouvindo o tempo todo (usa mais da cota do Gemini).
- Na janela você digita o **nome do assistente** (2 a 3 sílabas, fácil de falar) e escolhe o modo. Também há o botão
  **Chamar agora** e o atalho global **Ctrl + Alt + Espaço** (funciona com a janela escondida).
- Na 1ª vez em modo ativação ele baixa o modelo de voz em português (~50 MB, só essa vez, precisa de internet).

## Instalar / gerar o programa (Windows)
1. Instale o **Node.js LTS** (https://nodejs.org).
2. Dê dois cliques em **`CRIAR_EXE.bat`** (pede administrador; leva alguns minutos na 1ª vez).
3. Abra a pasta **`release`**:
   - `Assistente de Voz Setup 2.0.0.exe` — instalador (recomendado). Só ele permite **Iniciar com o Windows**.
   - `AssistenteDeVoz-portatil.exe` — roda sem instalar.
4. Ao abrir, o Windows pergunta sobre administrador: **Sim**.
5. Na 1ª vez o programa pede a **chave do Gemini** dentro da janela: cole e clique em **Salvar e começar**
   (grátis em https://aistudio.google.com/apikey; vale o formato antigo `AIza…` e o novo `AQ.…`). Ela fica salva criptografada só neste computador.

Para testar sem gerar o `.exe`: **`INICIAR.bat`**.

## Medidor de uso do Gemini
Na barra de título aparece um indicador (`1 h 06 min · 238 mil tokens`) com o uso de **hoje**; clique para abrir os detalhes em **Ajustes → Uso do Gemini**
(tempo conectado, tokens, número de conversas, gráfico dos últimos 7 dias).
- **Importante:** o Google **não informa** por API quanto resta da sua cota. Os números são uma **estimativa do app**
  (tokens informados pelo servidor durante a conversa + tempo conectado). O oficial fica em https://aistudio.google.com/usage (há um botão para abrir).
- Digite em **“Meu limite diário de tokens”** o limite da sua conta (veja na página do Google). O indicador fica **amarelo aos 70%**,
  **vermelho aos 90%**, e o app avisa aos **80% e 100%**.
- Se o Google responder que o limite acabou, o indicador fica vermelho (“Limite atingido”), o app **para de insistir**
  (no modo ativação ele continua escutando o nome) e mostra um aviso com o link do uso.

## Bandeja
Minimizar ou fechar (X) manda o programa para a bandeja, ao lado do relógio, **ouvindo normalmente**.
Clique no ícone para abrir; botão direito: *Mostrar janela / Pausar escuta / Sair*. O ícone fica verde quando está escutando.
Para fechar de vez: bandeja → **Sair**.

## Pastas
Aba **Pastas**: dê nomes falados a pastas (ex.: `lançamentos` → `D:\Trabalho\Lançamentos`) e use **Testar** para ver se abre.
Seus atalhos (.lnk) da Área de Trabalho, inclusive de outros usuários do PC, já são reconhecidos sozinhos.
A busca de subpastas e de referências é feita **ao vivo** dentro da pasta atual, então pastas novas aparecem na hora.
A referência é comparada só pelos **dígitos** do nome: `7526.2526`, `7526-2526` e `MODARE 7526.2526` casam com “7526.2526”.

## Dicas se algo não funcionar
| Sintoma | O que fazer |
|---|---|
| Não responde ao nome | Ajustes → Sensibilidade **Flexível**; fale devagar e claro; teste outro nome; use **Chamar agora** |
| Ativa sozinho | Sensibilidade **Rigorosa** ou um nome mais longo |
| Microfone mudo/bloqueado | Windows → Configurações → Privacidade e segurança → Microfone → permitir apps da área de trabalho |
| Ele se ouve falando | Marque “Estou usando fones” só com fones; sem fones o microfone já pausa enquanto ele fala |
| Pasta não abre | Aba Pastas → **Testar**; confira o caminho; rode como administrador |
| Drive de rede (Z:) some | Programas como administrador não veem drives mapeados: use o caminho `\\servidor\pasta` |
| “Chave recusada” | Cole a chave inteira, sem espaços; crie outra no AI Studio |

## Para desenvolvedores
`npm test` (testes do núcleo de pastas, do detector de nome, do motor de voz e do processo principal) ·
`npm run ui` (interface no navegador, com dados de mentira; acrescente `?demo`) · `npm start` (Electron).
Estrutura: `electron/` (janela, bandeja, IPC, `nucleo.js` com as ferramentas de pasta/programa/PC) ·
`src/motor/` (voz: `Motor.js` máquina de estados, `audio.js` microfone/saída/Vosk, `matchNome.mjs` nome falado, `liveConfig.js`) · `src/components/` (React).

## Privacidade e limites
- Enquanto dorme, o áudio **não sai do PC**. Acordado, o áudio vai para o Gemini (Google). Use uma chave/conta que você aceite para isso.
- O plano gratuito do Gemini tem limites de uso (confira no AI Studio). Modo “Ouvir direto” gasta mais que a ativação por nome.
- Os controles do PC (volume, mídia, janelas) e o início com o Windows funcionam no Windows.
