import csv
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

import gastos


class GastosTests(unittest.TestCase):
    def test_adicionar_registra_data_descricao_valor_e_tipo(self):
        lancamentos = []

        gastos.adicionar(lancamentos, "Salário", 2500.0, "entrada")

        self.assertEqual(
            lancamentos,
            [
                {
                    "data": date.today().isoformat(),
                    "descricao": "Salário",
                    "valor": 2500.0,
                    "tipo": "entrada",
                }
            ],
        )

    def test_calcular_totais_e_saldo(self):
        lancamentos = [
            {"tipo": "entrada", "valor": 2500.0},
            {"tipo": "entrada", "valor": 300.0},
            {"tipo": "saida", "valor": 125.5},
        ]

        self.assertEqual(gastos.total_por_tipo(lancamentos, "entrada"), 2800.0)
        self.assertEqual(gastos.total_por_tipo(lancamentos, "saida"), 125.5)
        self.assertEqual(gastos.calcular_saldo(lancamentos), 2674.5)

    def test_carregar_sem_arquivo_devolve_lista_vazia(self):
        with tempfile.TemporaryDirectory() as diretorio:
            caminho = Path(diretorio) / "dados.json"
            with patch.object(gastos, "ARQUIVO", str(caminho)):
                self.assertEqual(gastos.carregar(), [])

    def test_salvar_e_carregar_preservam_lancamentos(self):
        lancamentos = [
            {
                "data": "2026-11-04",
                "descricao": "Café",
                "valor": 12.5,
                "tipo": "saida",
            }
        ]

        with tempfile.TemporaryDirectory() as diretorio:
            caminho = Path(diretorio) / "dados.json"
            with patch.object(gastos, "ARQUIVO", str(caminho)):
                gastos.salvar(lancamentos)
                self.assertEqual(gastos.carregar(), lancamentos)

    def test_gerar_relatorios_cria_quatro_periodos_com_gastos_e_totais(self):
        referencia = date(2026, 11, 4)
        lancamentos = [
            {
                "data": referencia.isoformat(),
                "descricao": "Almoço",
                "valor": 35.5,
                "tipo": "saida",
            },
            {
                "data": (referencia - timedelta(days=1)).isoformat(),
                "descricao": "Ônibus",
                "valor": 5.0,
                "tipo": "saida",
            },
            {
                "data": referencia.isoformat(),
                "descricao": "Salário",
                "valor": 2000.0,
                "tipo": "entrada",
            },
        ]

        with tempfile.TemporaryDirectory() as diretorio:
            with patch.object(gastos, "PASTA_RELATORIOS", diretorio):
                caminhos = gastos.gerar_relatorios(lancamentos, referencia)

            self.assertEqual(len(caminhos), 4)
            for caminho, total_esperado in zip(
                caminhos, ("35,50", "40,50", "40,50", "40,50")
            ):
                with caminho.open(encoding="utf-8-sig", newline="") as arquivo:
                    linhas = list(csv.reader(arquivo, delimiter=";"))
                self.assertEqual(linhas[0], ["Data", "Descrição", "Valor (R$)"])
                self.assertEqual(
                    linhas[-1], ["Total do período", "", total_esperado]
                )
                self.assertTrue(all("Salário" not in linha for linha in linhas))
            with caminhos[0].open(encoding="utf-8-sig", newline="") as arquivo:
                linhas_diarias = list(csv.reader(arquivo, delimiter=";"))
            self.assertEqual(len(linhas_diarias), 3)
            self.assertEqual(linhas_diarias[1][1:], ["Almoço", "35,50"])

    def test_semana_mensal_e_anual_filtam_gastos_por_intervalo(self):
        referencia = date(2026, 1, 2)
        lancamentos = [
            {
                "data": "2025-12-31",
                "descricao": "Ano anterior",
                "valor": 10.0,
                "tipo": "saida",
            },
            {
                "data": "2026-01-01",
                "descricao": "Semana anterior",
                "valor": 20.0,
                "tipo": "saida",
            },
            {
                "data": "2026-01-02",
                "descricao": "Esta semana",
                "valor": 30.0,
                "tipo": "saida",
            },
        ]

        with tempfile.TemporaryDirectory() as diretorio:
            with patch.object(gastos, "PASTA_RELATORIOS", diretorio):
                semanal = gastos.gerar_relatorio(lancamentos, "semanal", referencia)
                mensal = gastos.gerar_relatorio(lancamentos, "mensal", referencia)
                anual = gastos.gerar_relatorio(lancamentos, "anual", referencia)

            def obter_total(caminho):
                with caminho.open(encoding="utf-8-sig", newline="") as arquivo:
                    return list(csv.reader(arquivo, delimiter=";"))[-1][2]

            self.assertEqual(obter_total(semanal), "60,00")
            self.assertEqual(obter_total(mensal), "50,00")
            self.assertEqual(obter_total(anual), "50,00")

    def test_selecionar_gastos_dia_retorna_apenas_saidas_da_data(self):
        lancamentos = [
            {"data": "2026-11-04", "descricao": "Almoço", "valor": 35, "tipo": "saida"},
            {"data": "2026-11-03", "descricao": "Ônibus", "valor": 5, "tipo": "saida"},
            {"data": "2026-11-04", "descricao": "Salário", "valor": 2000, "tipo": "entrada"},
        ]

        resultado = gastos.selecionar_gastos(
            lancamentos, "diario", date(2026, 11, 4)
        )

        self.assertEqual([item["descricao"] for item in resultado], ["Almoço"])


if __name__ == "__main__":
    unittest.main()
