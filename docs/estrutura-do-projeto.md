# Estrutura do projeto

O Meu Financeiro é um aplicativo web estático (PWA), desenvolvido sem
frameworks ou etapa de compilação. O navegador carrega os arquivos diretamente
da pasta `web/`. Não há dependências npm nem pacote de bibliotecas de terceiros
instalado no repositório.

## Organização

| Caminho | Responsabilidade |
| --- | --- |
| `web/index.html` | Estrutura das telas, modais e carregamento dos scripts |
| `web/estilos.css` | Aparência, responsividade e estados visuais |
| `web/js/nucleo.js` | Regras financeiras, dados e persistência local |
| `web/js/graficos.js` | Geração dos gráficos |
| `web/js/assistente.js` | Análises e respostas locais do assistente |
| `web/js/voz.js` | Interface e controle do reconhecimento de voz |
| `web/js/documentos.js` | Biblioteca local de documentos, armazenada no IndexedDB |
| `web/js/google-drive-sync.js` | Backup criptografado opcional no Google Drive |
| `web/js/app.js` | Inicialização, eventos e integração das telas |
| `web/service-worker.js` | Cache dos arquivos e funcionamento offline |
| `web/manifest.webmanifest` | Nome, ícones e configurações de instalação |
| `web/icons/` | Ícones usados pelo aplicativo |
| `docs/` | Documentação de arquitetura, segurança e configuração do backup |
| `.github/workflows/pages.yml` | Publicação do aplicativo no GitHub Pages |
| `.github/workflows/validar.yml` | Verificações automáticas de sintaxe e arquivos essenciais |

Os sete módulos JavaScript são carregados pelo `index.html` e incluídos no
cache do service worker. Não remova um módulo sem verificar suas chamadas,
integrações e dependências no restante do aplicativo.

## Cuidados ao contribuir

- Preserve o funcionamento offline e atualize o cache do service worker quando
  adicionar, remover ou renomear arquivos essenciais.
- Não mova nem renomeie a chave de armazenamento sem criar uma migração
  compatível com os dados existentes.
- Não altere o fluxo do PIN sem revisar os efeitos sobre os aparelhos que já
  utilizam o aplicativo.
- O reconhecimento de voz depende dos recursos oferecidos pelo navegador; não
  prometa reconhecimento totalmente offline sem implementar e testar um motor
  local.
- O backup do Google Drive é opcional e não equivale a sincronização em tempo
  real. O app continua gravando os dados localmente; o envio depende de conexão,
  autorização válida e aplicativo aberto.
- Prefira mudanças pequenas e isoladas. Verifique a sintaxe JavaScript antes de
  integrar alterações.

## Validação automática

O fluxo `.github/workflows/validar.yml` verifica a sintaxe dos arquivos
JavaScript, valida o manifesto PWA e confirma a presença dos arquivos
essenciais. Ele é executado em envios para `main`, em pull requests destinados
a `main` e manualmente pelo GitHub Actions.

Essa verificação detecta erros de sintaxe e arquivos ausentes, mas não substitui
testes funcionais em navegadores e celulares.
