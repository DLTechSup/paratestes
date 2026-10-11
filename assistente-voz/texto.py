#!/usr/bin/env python3
"""Testa as ferramentas digitando (sem microfone e sem API).

  pasta lançamentos        ref 7526.2526 [marca]      ref sete cinco vinte e seis ponto vinte e cinco vinte e seis
  prog chrome              listar | voltar | onde | limpar | atualizar
  pc volume_mais [passos]  sair
"""
import nucleo

a = nucleo.Assistente()
print(__doc__)
while True:
    try:
        linha = input("> ").strip()
    except (EOFError, KeyboardInterrupt):
        break
    cmd, _, resto = linha.partition(" ")
    cmd = cmd.lower()
    if cmd in ("sair", "exit"):
        break
    mapa = {
        "pasta": lambda: nucleo.executar_ferramenta(a, "abrir_pasta", {"nome": resto}),
        "ref": lambda: nucleo.executar_ferramenta(a, "pesquisar_referencia", {"referencia": resto}),
        "prog": lambda: nucleo.executar_ferramenta(a, "abrir_programa", {"nome": resto}),
        "listar": lambda: nucleo.executar_ferramenta(a, "listar_pasta_atual", {}),
        "voltar": lambda: nucleo.executar_ferramenta(a, "voltar", {}),
        "onde": lambda: nucleo.executar_ferramenta(a, "onde_estou", {}),
        "limpar": lambda: nucleo.executar_ferramenta(a, "limpar_contexto", {}),
        "atualizar": lambda: nucleo.executar_ferramenta(a, "atualizar_lista", {}),
        "pc": lambda: nucleo.executar_ferramenta(a, "controlar_pc", {"acao": resto.split()[0], "passos": int(resto.split()[1]) if len(resto.split()) > 1 else 1}),
    }
    print(mapa[cmd]() if cmd in mapa else "Comando desconhecido.")
