"""python testes.py — testa números falados e a navegação Lançamentos > marca > referência (sem abrir nada de verdade)."""
import os
import sys
import tempfile
from pathlib import Path

tmp = Path(tempfile.mkdtemp())
os.environ["HOME"] = os.environ["USERPROFILE"] = str(tmp)
import nucleo  # noqa: E402

abertos = []
nucleo._abrir_so = lambda c: abertos.append(c)

# --- números falados ---
casos = {
    "sete cinco vinte e seis ponto vinte e cinco vinte e seis": "7526.2526",
    "7526.2526": "7526.2526",
    "um dois três quatro ponto cinco seis sete oito": "1234.5678",
    "setecentos e cinquenta e dois": "752",
    "cento e vinte e três": "123",
    "trinta e um zero quinze": "31015",
    "dezoito vinte e dois traço quatro": "1822-4",
}
for fala, esperado in casos.items():
    got = nucleo.fala_para_numero(fala)
    assert got == esperado, (fala, got, esperado)

# --- árvore de teste ---
L = tmp / "Trabalho" / "Lançamentos"
for p in ["Modare/7526.2526", "Modare/7526.2527", "Modare/Outros/1234.5678",
          "Vizzano/7526.2526", "Vizzano/9999.0001", "Beira Rio Conforto/4242.1010", "Moleca/Ref 3030.2020"]:
    (L / p).mkdir(parents=True)
(L / "Modare" / "7526.2526" / "foto.jpg").write_text("x")

cfg = dict(nucleo.CONFIG_PADRAO, atalhos={"lançamentos": str(L)}, raizes=[str(tmp)])
a = nucleo.Assistente(cfg)

r = a.abrir_pasta("lançamentos"); assert abertos[-1] == str(L), r
r = a.abrir_pasta("Modare"); assert abertos[-1] == str(L / "Modare"), r
assert a.atual == str(L / "Modare")
r = a.pesquisar_referencia("sete cinco vinte e seis ponto vinte e cinco vinte e seis")
assert abertos[-1] == str(L / "Modare" / "7526.2526"), (r, abertos[-1])
r = a.pesquisar_referencia("1234.5678"); assert abertos[-1].endswith("Outros/1234.5678".replace("/", os.sep)), r
assert a.atual == str(L / "Modare")            # continua na marca depois de abrir referências
r = a.voltar(); assert a.atual == str(L), r     # voltar = sobe para Lançamentos

# marca dita na pesquisa (estando em Lançamentos)
a.limpar_contexto(); a.abrir_pasta("lançamentos")
r = a.pesquisar_referencia("7526.2526", marca="vizzano"); assert abertos[-1] == str(L / "Vizzano" / "7526.2526"), r
# marca com nome composto e ref com prefixo no nome da pasta
a.limpar_contexto(); a.abrir_pasta("lançamentos"); a.abrir_pasta("beira rio")
assert a.atual == str(L / "Beira Rio Conforto")
a.limpar_contexto(); a.abrir_pasta("lançamentos"); a.abrir_pasta("moleca")
r = a.pesquisar_referencia("30302020"); assert "Ref 3030.2020" in r, r
# sem pasta aberta
a.limpar_contexto(); assert "Nenhuma pasta aberta" in a.pesquisar_referencia("1")
# não achou
a.abrir_pasta("lançamentos"); a.abrir_pasta("modare")
assert "Não encontrei" in a.pesquisar_referencia("0000.0000")
assert "Modare" in a.listar()
print("OK — todos os testes passaram")
