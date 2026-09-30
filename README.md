# NoteDeck — by DLTechSup

Notas adesivas para Windows com **gerenciador central**: você cria quantas notas quiser e escolhe
quais ficam aparecendo na tela (e pode ligar/desligar depois). Feito com Electron + React.

## Recursos
- Gerenciador com todas as notas: busca, filtros (Todas / Na tela / Ocultas), chave liga/desliga por nota, mostrar/ocultar todas, duplicar, lixeira com restauração.
- Inicia com o Windows em segundo plano (`--hidden`) mostrando **somente** as notas marcadas "Na tela".
- Fica na bandeja do sistema; fechar o gerenciador não encerra o programa. Menu da bandeja liga/desliga notas.
- Editor rico: fonte, tamanho, negrito/itálico/sublinhado/tachado, cor do texto, marca-texto, alinhamento, listas, checklist, link, limpar formatação, desfazer/refazer, corretor ortográfico e menu de contexto (recortar/copiar/colar/colar sem formatação/selecionar tudo).
- **Marca-texto/cor só no trecho selecionado**: o que você digita depois não herda a cor.
- 11 cores de nota, fixar por cima das janelas, transparência, exportar nota em `.txt`.
- Backup: exportar/importar `.json`, backup automático diário (mantém os últimos N) e **importação de arquivos `.db`** do Simple Sticky Notes (SQLite, com conversão de RTF).
- Salvamento automático e cópia `.bak` dos dados.

## Desenvolvimento
```bash
npm install
npm run dev      # Vite + Electron com hot reload
npm start        # build + executa
```

## Gerar o instalador (.exe)
No Windows:
```bash
npm run dist
```
O instalador sai em `release/NoteDeck-Setup-<versão>.exe`.
Sem Windows à mão: o workflow **Build instalador Windows** (GitHub Actions) gera o `.exe` como artefato a cada push.

Dados ficam em `%APPDATA%\notedeck\notedeck-data.json`. Backups automáticos em `Documentos\NoteDeck Backups`.
