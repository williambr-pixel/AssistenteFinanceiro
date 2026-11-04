# Meu Financeiro

Um controle financeiro pessoal simples, feito para usar no celular: anote entradas
e gastos, acompanhe seu saldo e veja relatórios do dia, da semana, do mês e do ano.

## Instalar no celular

O aplicativo precisa estar publicado em um site com HTTPS para ser instalado. Depois
de abrir o endereço no celular:

- **Android:** no Chrome, abra o menu e toque em **Instalar app** ou **Adicionar à
  tela inicial**.
- **iPhone:** no Safari, toque em **Compartilhar** e depois **Adicionar à Tela de
  Início**.

Para publicar pelo GitHub Pages, envie os arquivos do projeto ao GitHub e, no
repositório, abra **Settings → Pages**. Em **Build and deployment**, selecione
**GitHub Actions**. O fluxo de publicação incluído publica o aplicativo depois que
as mudanças chegam à branch `main`; o endereço aparecerá nessa tela e no fluxo de
execução. Abra esse endereço no celular e siga as instruções acima. O site funciona
offline depois da primeira abertura.

## Usar

1. Abra a aba **Anotar** e escolha **Gasto** ou **Entrada**.
2. Informe a descrição, o valor e a data e toque em **Adicionar lançamento**.
3. Na aba **Início**, acompanhe seu saldo e movimentações recentes. Em **Relatórios**,
   veja os gastos de cada período e baixe o relatório em CSV.

## Privacidade e dados

Os lançamentos ficam armazenados localmente no navegador deste aparelho; não são
enviados a um servidor e não são sincronizados entre dispositivos. Se limpar os
dados do navegador, os lançamentos poderão ser apagados. Baixe regularmente os
relatórios CSV para guardar uma cópia dos gastos.

O projeto também mantém o controle financeiro original para terminal:

```bash
python main.py
```

Para executar os testes do controle de terminal:

```bash
python -m unittest discover
```
