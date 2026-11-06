# Meu Financeiro

Controle financeiro pessoal para usar no celular: anote entradas e gastos,
acompanhe seu saldo e veja relatórios do dia, da semana, do mês e do ano. É um
aplicativo instalável (PWA) em HTML, CSS e JavaScript puro, e os lançamentos
ficam salvos apenas no aparelho.

## Estrutura

```text
.
├── .github/workflows/pages.yml   Publica o app no GitHub Pages
└── web/                          Aplicativo
    ├── index.html
    ├── aplicativo.js
    ├── estilos.css
    ├── manifest.webmanifest
    ├── service-worker.js
    └── icons/
```

## Rodar no computador

O app é estático, mas o service worker (modo offline) só funciona em `localhost`
ou HTTPS. Sirva a pasta `web/` com qualquer servidor local:

```bash
python -m http.server 8000 --directory web
```

Depois abra <http://localhost:8000>. Se preferir, use a extensão **Live Server**
do VS Code apontando para `web/index.html`.

## Instalar no celular

O aplicativo precisa estar publicado em um site com HTTPS para ser instalado.
Depois de abrir o endereço no celular, use a aba **Instalar** do app para ver as
instruções do seu aparelho. Quando o navegador permitir, também aparecerá o botão
**Instalar app**.

- **Android:** no Chrome, abra o menu e toque em **Instalar app** ou **Adicionar à
  tela inicial**.
- **iPhone:** no Safari, toque em **Compartilhar** e depois **Adicionar à Tela de
  Início**.

## Publicar no GitHub Pages

O fluxo em `.github/workflows/pages.yml` publica o conteúdo de `web/` sempre que a
branch `main` recebe mudanças. No repositório, abra **Settings → Pages**, defina
**Build and deployment** como **GitHub Actions** e aguarde a execução do fluxo. O
endereço aparecerá nessa tela e no próprio fluxo. O site funciona offline depois
da primeira abertura.

## Usar

1. Abra a aba **Anotar** e escolha **Gasto** ou **Entrada**.
2. Informe a descrição, o valor e a data e toque em **Salvar lançamento**.
3. Na aba **Início**, acompanhe seu saldo e as movimentações recentes.
4. Em **Relatórios**, veja os gastos de cada período e baixe o relatório em CSV.

## Privacidade e dados

Os lançamentos ficam no armazenamento local do navegador deste aparelho; não são
enviados a um servidor nem sincronizados entre dispositivos. Se os dados do
navegador forem apagados, os lançamentos também podem ser perdidos, por isso
baixe os relatórios CSV com regularidade.
