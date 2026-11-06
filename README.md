# Meu Financeiro

Aplicativo financeiro pessoal instalável (PWA) feito com HTML, CSS e JavaScript
puro. Funciona offline depois da primeira visita e guarda os lançamentos apenas
no aparelho — sem conta, sem servidor e sem sincronização.

## Recursos

### Painel
- Saldo, receitas, despesas e resultado do período.
- Comparativo com o mês anterior e indicador de economia.
- Contas a vencer, metas em andamento e últimas movimentações.
- Gráficos interativos de evolução, categorias e comparação mensal.
- Filtros de dia, semana, mês e ano.

### Lançamentos
- Cadastro, edição, exclusão e busca de receitas e despesas.
- Categorias personalizadas com nome, cor e ícone.
- Forma de pagamento, movimentações fixas, recorrências e observações.
- Filtros por tipo, categoria, mês, pagamento e texto.
- Registro por voz com revisão obrigatória antes de salvar.

### Registro por voz
- Botão de microfone na barra superior e na página de lançamentos.
- Reconhecimento em português (`pt-BR`) pela Web Speech API do navegador.
- Identifica tipo (gasto ou receita), valor, data, categoria e forma de pagamento
  a partir da fala.
- Entende valores em dígitos e por extenso, centavos, datas relativas, dias da
  semana e formas de pagamento comuns.
- Mostra a transcrição e abre o formulário preenchido para revisão. Nada é salvo
  sem a sua confirmação e nenhum valor é inventado: se o valor não for citado, o
  campo fica vazio.
- Quando o microfone não está disponível ou o navegador exige HTTPS, o mesmo
  lançamento pode ser digitado no formulário de voz.
- O áudio pode ser processado pelo serviço de voz do navegador. Os lançamentos
  continuam armazenados somente neste aparelho.

### Planejamento
- Orçamento mensal com limites por categoria.
- Metas e cofrinhos com contribuições.
- Contas a pagar, dívidas e parcelas.
- Assinaturas e recorrências.
- Previsão de saldo e comparação entre meses.

### Relatórios
- Relatórios por período com gráficos e resumos.
- Exportação em CSV (compatível com planilhas).
- Impressão ou salvamento em PDF pelo diálogo do navegador.
- Assistente que responde apenas com base nos dados reais do app.

### Organização e segurança
- Mini registro no primeiro acesso para informar como você quer ser chamado. O
  nome personaliza a saudação e pode ser alterado ou preenchido depois em
  **Configurações**.
- Calendário financeiro com os lançamentos de cada dia.
- Simulador de economia, calculadora de juros e comparador de meses.
- Notificações de contas, orçamento, metas e resumo.
- Tema claro, escuro ou automático, com cor de destaque configurável.
- PIN local opcional para bloquear a interface.
- Backup e restauração em JSON, além de importação de extratos em CSV.
- Estados vazios, confirmação de exclusão e tratamento de erros.

> O PIN protege o acesso pela interface, mas não criptografa o armazenamento do
> navegador. Para proteção real, use o bloqueio do próprio aparelho.

## Estrutura

```text
.
├── .github/workflows/
│   ├── pages.yml                 Publica o app no GitHub Pages
│   └── validar.yml               Verifica sintaxe e arquivos essenciais
├── docs/
│   └── estrutura-do-projeto.md   Organização e cuidados ao contribuir
├── LICENSE
├── README.md
└── web/                          Aplicativo
    ├── index.html
    ├── estilos.css
    ├── manifest.webmanifest
    ├── service-worker.js
    ├── icons/                     Ícones SVG e PNG do aplicativo
    └── js/
        ├── nucleo.js             Dados, persistência e regras financeiras
        ├── graficos.js           Gráficos em SVG
        ├── assistente.js         Respostas e insights do assistente
        ├── voz.js                Interface e controle do reconhecimento de voz
        └── app.js                Interface, relatórios e ferramentas
```

Não há bibliotecas externas nem etapa de build. Os scripts são carregados na
ordem correta pelo `index.html`.

## Rodar no computador

O app é estático, mas o service worker (modo offline) e o microfone só funcionam
em `localhost` ou HTTPS. Sirva a pasta `web/` com qualquer servidor local:

```bash
python -m http.server 8000 --directory web
```

Depois abra <http://localhost:8000>. Se preferir, use a extensão **Live Server**
do VS Code apontando para `web/index.html`.

Abrir o arquivo direto por `file://` também permite usar o app, mas sem service
worker e, na maioria dos navegadores, sem microfone.

## Instalar no celular

O aplicativo precisa estar publicado em um site com HTTPS para ser instalado.
Depois de abrir o endereço no celular, use a aba **Instalar** do app para ver as
instruções do seu aparelho. Quando o navegador permitir, também aparecerá o
botão **Instalar app**.

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

## Dados e privacidade

Os dados ficam no `localStorage` do navegador, na chave
`meu-financeiro-dados-v2`. A versão anterior do app usava outra chave e é
migrada automaticamente na primeira abertura.

- Nada é enviado a um servidor.
- Limpar os dados do navegador pode apagar os lançamentos.
- Use **Configurações → Baixar backup (JSON)** regularmente.
- O recurso de voz depende do navegador e pode enviar o áudio ao serviço de
  reconhecimento; a transcrição e os lançamentos permanecem locais.

## Limitações conhecidas

- A exportação para planilhas é feita em **CSV**, não em `.xlsx`.
- O PDF é gerado pela impressão do navegador (**Imprimir → Salvar como PDF**).
- O reconhecimento de voz depende da Web Speech API. Chrome, Edge e Android
  costumam oferecer suporte; Firefox não oferece. Sem suporte, use o campo de
  digitação no modal de voz.
- Os dados são por navegador e por aparelho; não há sincronização entre
  dispositivos.

## Licença

Distribuído sob a licença MIT. Veja [LICENSE](LICENSE).
