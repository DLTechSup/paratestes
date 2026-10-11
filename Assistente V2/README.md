# Assistente V2

Assistente local para **abrir pastas, subpastas e programas** do seu computador
digitando o nome (busca aproximada, sem acentos). Inspirado no
[Mark-LV](https://github.com/FatihMakes/Mark-LV), porém enxuto: **só Python 3.8+,
nenhuma instalação de pacotes**. Funciona em Windows, macOS e Linux.

## Como usar
- **Windows:** dê dois cliques em `iniciar.bat`
- **macOS/Linux:** `./iniciar.sh`
- Na janela: digite (ex.: `chrome`, `pasta relatorios`), use ↑↓ e **Enter** para abrir.

Também funciona por linha de comando:

```
python assistente.py abrir chrome
python assistente.py abrir pasta downloads
python assistente.py abrir C:\Users\voce\Projetos
python assistente.py --cli          # modo texto interativo (buscar/abrir)
python assistente.py --reindexar    # refaz o índice
```

## Configuração (`config.json`, criado na primeira execução)
| chave | o que faz |
|---|---|
| `raizes` | pastas varridas (com todas as subpastas). Vazio = Desktop, Documentos, Downloads, Imagens, Músicas, Vídeos (+ discos D:–G: no Windows) |
| `profundidade_maxima` | quantos níveis de subpasta descer (padrão 6) |
| `ignorar` | nomes de pastas ignoradas (`node_modules`, `.git`, ...) |
| `indice_validade_horas` | de quanto em quanto tempo o índice é refeito |
| `apelidos` | atalhos próprios, ex.: `"meu projeto": "C:/Users/voce/Projetos/x"` |

Para varrer o disco inteiro, coloque `"raizes": ["C:/"]` (a primeira indexação demora mais).

## Programas detectados
- Windows: Menu Iniciar (`.lnk`) + registro *App Paths*
- macOS: `/Applications` (`.app`)
- Linux: arquivos `.desktop`

O assistente **só abre** itens; não apaga, move nem altera arquivos.
