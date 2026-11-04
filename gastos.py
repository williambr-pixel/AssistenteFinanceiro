"""Funções do assistente financeiro: guardar e calcular os lançamentos."""

import csv
import json
from datetime import date, timedelta
from pathlib import Path

ARQUIVO = "dados.json"
PASTA_RELATORIOS = "relatorios"


def carregar():
    """Carrega os lançamentos ou devolve uma lista vazia se ainda não há arquivo."""
    try:
        with open(ARQUIVO, "r", encoding="utf-8") as arquivo:
            return json.load(arquivo)
    except FileNotFoundError:
        return []


def salvar(lancamentos):
    """Salva os lançamentos no arquivo local."""
    with open(ARQUIVO, "w", encoding="utf-8") as arquivo:
        json.dump(lancamentos, arquivo, ensure_ascii=False, indent=2)


def adicionar(lancamentos, descricao, valor, tipo):
    """Adiciona um lançamento com a data atual."""
    lancamentos.append(
        {
            "data": date.today().isoformat(),
            "descricao": descricao,
            "valor": valor,
            "tipo": tipo,
        }
    )


def total_por_tipo(lancamentos, tipo):
    """Soma os valores de um tipo de lançamento."""
    return sum(item["valor"] for item in lancamentos if item["tipo"] == tipo)


def calcular_saldo(lancamentos):
    """Calcula o saldo: entradas menos saídas."""
    return total_por_tipo(lancamentos, "entrada") - total_por_tipo(
        lancamentos, "saida"
    )


def _intervalo(periodo, referencia):
    if periodo == "diario":
        return referencia, referencia
    if periodo == "semanal":
        inicio = referencia - timedelta(days=referencia.weekday())
        return inicio, inicio + timedelta(days=6)
    if periodo == "mensal":
        return (
            date(referencia.year, referencia.month, 1),
            date(
                referencia.year + (referencia.month == 12),
                referencia.month % 12 + 1,
                1,
            )
            - timedelta(days=1),
        )
    if periodo == "anual":
        return date(referencia.year, 1, 1), date(referencia.year, 12, 31)
    raise ValueError(f"Período inválido: {periodo}")


def selecionar_gastos(lancamentos, periodo, referencia=None):
    """Seleciona as saídas dentro do período indicado."""
    referencia = referencia or date.today()
    inicio, fim = _intervalo(periodo, referencia)
    return [
        item
        for item in lancamentos
        if item["tipo"] == "saida"
        and inicio <= date.fromisoformat(item["data"]) <= fim
    ]


def gerar_relatorio(lancamentos, periodo, referencia=None):
    """Gera um CSV dos gastos do período atual, compatível com Excel."""
    referencia = referencia or date.today()
    gastos_periodo = selecionar_gastos(lancamentos, periodo, referencia)

    if periodo == "diario":
        identificador = referencia.isoformat()
    elif periodo == "semanal":
        ano, semana, _ = referencia.isocalendar()
        identificador = f"{ano}-S{semana:02d}"
    elif periodo == "mensal":
        identificador = referencia.strftime("%Y-%m")
    else:
        identificador = str(referencia.year)

    pasta = Path(PASTA_RELATORIOS)
    pasta.mkdir(parents=True, exist_ok=True)
    caminho = pasta / f"gastos_{periodo}_{identificador}.csv"
    with caminho.open("w", encoding="utf-8-sig", newline="") as arquivo:
        escritor = csv.writer(arquivo, delimiter=";")
        escritor.writerow(["Data", "Descrição", "Valor (R$)"])
        for item in gastos_periodo:
            escritor.writerow(
                [
                    item["data"],
                    item["descricao"],
                    f'{item["valor"]:.2f}'.replace(".", ","),
                ]
            )
        total = sum(item["valor"] for item in gastos_periodo)
        escritor.writerow(["Total do período", "", f"{total:.2f}".replace(".", ",")])

    return caminho


def gerar_relatorios(lancamentos, referencia=None):
    """Gera os relatórios diário, semanal, mensal e anual para a data indicada."""
    return [
        gerar_relatorio(lancamentos, periodo, referencia)
        for periodo in ("diario", "semanal", "mensal", "anual")
    ]
