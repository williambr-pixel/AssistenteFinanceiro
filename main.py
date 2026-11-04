"""Assistente Financeiro - controle simples de entradas e saídas."""

import math
from datetime import date

import gastos


def formatar(valor):
    """Transforma 1300.5 em 'R$ 1300,50'."""
    return f"R$ {valor:.2f}".replace(".", ",")


def pedir_valor():
    """Pergunta um valor até a pessoa digitar um número válido."""
    while True:
        texto = input("Valor: ").replace(",", ".")
        try:
            valor = float(texto)
            if not math.isfinite(valor) or valor <= 0:
                print("Digite um valor maior que zero.")
                continue
            return valor
        except ValueError:
            print("Isso não parece um número. Tente de novo (ex: 25,90).")


def registrar(lancamentos, tipo):
    descricao = input("Descrição (ex: Mercado): ").strip()
    while not descricao:
        print("Digite uma descrição para o lançamento.")
        descricao = input("Descrição (ex: Mercado): ").strip()
    valor = pedir_valor()
    gastos.adicionar(lancamentos, descricao, valor, tipo)
    gastos.salvar(lancamentos)
    print("Anotado!")


def mostrar_saldo(lancamentos):
    print("\n--- Resumo ---")
    print("Entradas:", formatar(gastos.total_por_tipo(lancamentos, "entrada")))
    print("Saídas:  ", formatar(gastos.total_por_tipo(lancamentos, "saida")))
    print("Saldo:   ", formatar(gastos.calcular_saldo(lancamentos)))


def mostrar_extrato(lancamentos):
    print("\n--- Extrato ---")
    if not lancamentos:
        print("Nenhum lançamento ainda.")
        return
    for item in lancamentos:
        sinal = "+" if item["tipo"] == "entrada" else "-"
        print(
            f'{item["data"]}  {sinal} {formatar(item["valor"])}  '
            f'{item["descricao"]}'
        )


def mostrar_relatorios(lancamentos, referencia):
    periodos = (
        ("diario", "Hoje"),
        ("semanal", "Esta semana"),
        ("mensal", "Este mês"),
        ("anual", "Este ano"),
    )
    for periodo, titulo in periodos:
        itens = gastos.selecionar_gastos(lancamentos, periodo, referencia)
        total = sum(item["valor"] for item in itens)
        print(f"\n--- {titulo} ---")
        if not itens:
            print("Nenhum gasto neste período.")
        else:
            print(f'{"Data":<12} {"Descrição":<24} {"Valor":>12}')
            for item in itens:
                data = date.fromisoformat(item["data"]).strftime("%d/%m/%Y")
                descricao = item["descricao"][:24]
                print(f'{data:<12} {descricao:<24} {formatar(item["valor"]):>12}')
        print(f"Total: {formatar(total)}")


def main():
    lancamentos = gastos.carregar()
    print("Assistente Financeiro")

    while True:
        print("\n1 - Anotar entrada (dinheiro que entrou)")
        print("2 - Anotar saída (gasto)")
        print("3 - Ver saldo")
        print("4 - Ver extrato")
        print("5 - Gerar planilhas de gastos (dia, semana, mês e ano)")
        print("0 - Sair")
        opcao = input("Escolha: ").strip()

        if opcao == "1":
            registrar(lancamentos, "entrada")
        elif opcao == "2":
            registrar(lancamentos, "saida")
        elif opcao == "3":
            mostrar_saldo(lancamentos)
        elif opcao == "4":
            mostrar_extrato(lancamentos)
        elif opcao == "5":
            referencia = date.today()
            try:
                mostrar_relatorios(lancamentos, referencia)
                caminhos = gastos.gerar_relatorios(lancamentos, referencia)
            except (OSError, ValueError) as erro:
                print(f"Não foi possível gerar as planilhas: {erro}")
            else:
                print("\nArquivos CSV salvos:")
                for caminho in caminhos:
                    print(f"- {caminho}")
        elif opcao == "0":
            print("Até a próxima!")
            break
        else:
            print("Opção inválida.")


if __name__ == "__main__":
    main()
