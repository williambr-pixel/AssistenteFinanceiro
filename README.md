# Meu Financeiro

Aplicativo de controle financeiro pessoal e de pequenos negócios, instalável como PWA. Desenvolvido com HTML, CSS e JavaScript puro, sem etapa de build.

**Acesse:** https://williambr-pixel.github.io/AssistenteFinanceiro/

O Meu Financeiro ajuda a registrar receitas e despesas, acompanhar orçamento, planejar metas, organizar documentos e controlar valores que clientes devem. Os dados ficam no aparelho do usuário e o aplicativo funciona offline depois da primeira visita.

## Funcionalidades

### Visão geral e lançamentos
- Painel com saldo, receitas, despesas e resultado do período.
- Comparação com o mês anterior, evolução financeira e gráficos por categoria.
- Cadastro, edição, exclusão, busca e filtros de receitas e despesas.
- Categorias personalizadas, formas de pagamento, observações e recorrências.
- Registro por voz em português (pt-BR), com transcrição e revisão antes de salvar.

### Planejamento financeiro
- Orçamento mensal e limites por categoria.
- Metas e cofrinhos com acompanhamento de contribuições.
- Contas a pagar, dívidas, parcelas e assinaturas.
- Previsão de saldo, simulador de economia e calculadora de juros.
- Comparação entre períodos e calendário financeiro.

### Relatórios e assistente
- Relatórios por período, com gráficos e resumos.
- Exportação de lançamentos em CSV.
- Impressão ou salvamento de relatórios em PDF pelo navegador.
- Assistente financeiro local: responde perguntas e apresenta insights usando os dados disponíveis no próprio aplicativo, sem chamar uma API de IA.

### Documentos e planilhas
- Biblioteca de arquivos no aparelho, organizada por categoria e busca.
- Importação e armazenamento de PDF, Excel, CSV, documentos e imagens nos formatos aceitos pela tela de documentos.
- Leitura de planilhas XLSX e CSV para identificar receitas e despesas.
- Prévia dos totais e confirmação do usuário antes de adicionar os lançamentos.
- Abrir imagens compatíveis, baixar arquivos e excluir documentos da biblioteca.

### Modo Empreendedor
- Cadastro de clientes com nome e valor inicial devido.
- Registro de pagamentos vinculados a cada cliente.
- Desconto automático do pagamento no saldo pendente.
- Lista de clientes e consulta ao saldo em aberto.
- Histórico de dívidas e pagamentos, com filtro por cliente.

### Personalização e proteção
- Tema claro, escuro ou automático e cor de destaque configurável.
- PIN local opcional para bloquear a interface.
- Backup e restauração de dados em JSON.
- Backup opcional criptografado no Google Drive, configurado pelo usuário.
- Notificações, busca global, confirmação de ações e tratamento de erros.

## Privacidade e funcionamento offline

- Lançamentos, categorias, orçamentos, metas e configurações ficam no armazenamento local do navegador.
- Documentos ficam no IndexedDB do próprio aparelho.
- Não existe conta própria do Meu Financeiro nem servidor central de dados.
- O backup no Google Drive é opcional e criptografado antes do envio.
- O aplicativo funciona offline após a primeira visita; recursos que dependem do navegador, como reconhecimento de voz, podem ter requisitos próprios.

**Atenção:** o PIN é uma barreira de acesso pela interface, não criptografia do armazenamento local. Limpar os dados do navegador, perder o aparelho ou desinstalar o aplicativo pode causar perda dos dados. Faça backups regularmente. O backup JSON não inclui os arquivos da biblioteca de documentos; use o recurso de backup criptografado no Google Drive para incluir a biblioteca.

Consulte [Privacidade e segurança](docs/seguranca-e-sincronizacao.md) antes de usar o backup remoto.

## Estrutura do repositório

- .github/workflows/: validação automática e publicação no Pages.
- docs/: guias, arquitetura e documentação.
- web/index.html: telas e estrutura do aplicativo.
- web/estilos.css: interface e responsividade.
- web/manifest.webmanifest: configuração do PWA instalável.
- web/service-worker.js: cache e funcionamento offline.
- web/js/nucleo.js: dados, persistência e regras financeiras.
- web/js/graficos.js: gráficos.
- web/js/assistente.js: insights e respostas financeiras locais.
- web/js/voz.js: reconhecimento de voz.
- web/js/app.js: interface, relatórios e ferramentas.
- web/js/empreendedor.js: clientes, dívidas e pagamentos.
- web/js/documentos.js: biblioteca local de documentos.
- web/js/google-drive-sync.js: backup criptografado opcional.

Veja a descrição detalhada em [Funcionalidades](docs/funcionalidades.md) e a organização técnica em [Estrutura do projeto](docs/estrutura-do-projeto.md).

## Executar localmente

É necessário servir a pasta web/ por HTTP para testar o service worker e os recursos que exigem contexto seguro.

Com Python instalado, execute: python -m http.server 8000 --directory web

Abra http://localhost:8000. Também é possível usar a extensão Live Server do VS Code apontando para web/index.html.

## Instalar no celular

O site precisa estar publicado em HTTPS.

- **Android:** abra no Chrome e escolha **Instalar app** ou **Adicionar à tela inicial**.
- **iPhone:** abra no Safari, toque em **Compartilhar** e escolha **Adicionar à Tela de Início**.

## Publicação

O GitHub Actions publica automaticamente o conteúdo de web/ no GitHub Pages quando há alterações na branch main. A configuração fica em .github/workflows/pages.yml. O fluxo de validação está em .github/workflows/validar.yml.

No GitHub, configure **Settings → Pages → Build and deployment → GitHub Actions**.

## Limitações conhecidas

- A exportação de planilhas é CSV; não é gerado arquivo XLSX.
- A leitura de planilhas de entrada aceita XLSX e CSV.
- O PDF é obtido pela opção de impressão do navegador (Salvar como PDF).
- O reconhecimento de voz depende do suporte do navegador e pode utilizar o serviço de reconhecimento oferecido por ele.
- Os dados são locais por navegador/aparelho. O backup Google Drive é uma cópia criptografada opcional, não sincronização em tempo real.
- O PIN não criptografa os dados locais.
- O assistente atual é local e não utiliza a API da OpenAI.

## Licença

Distribuído sob a licença MIT. Consulte [LICENSE](LICENSE).
