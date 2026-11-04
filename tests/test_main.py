import unittest
from unittest.mock import patch

import main


class MainTests(unittest.TestCase):
    def test_pedir_valor_repete_ate_receber_valor_finito_positivo(self):
        with patch("builtins.input", side_effect=["nan", "inf", "0", "12,50"]):
            with patch("builtins.print"):
                self.assertEqual(main.pedir_valor(), 12.5)

    def test_registrar_pede_descricao_e_salva_gasto(self):
        lancamentos = []
        with patch(
            "builtins.input", side_effect=["  ", "Mercado", "25,90"]
        ), patch("main.gastos.salvar") as salvar:
            with patch("builtins.print"):
                main.registrar(lancamentos, "saida")

        self.assertEqual(lancamentos[0]["descricao"], "Mercado")
        self.assertEqual(lancamentos[0]["valor"], 25.9)
        self.assertEqual(lancamentos[0]["tipo"], "saida")
        salvar.assert_called_once_with(lancamentos)


if __name__ == "__main__":
    unittest.main()
