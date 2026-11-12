# Referências open source para evolução do Meu Financeiro

Este documento registra projetos externos avaliados para orientar melhorias futuras.
O Meu Financeiro continua em HTML, CSS e JavaScript puro, com prioridade para
funcionamento offline, baixo peso, privacidade e compatibilidade com celulares.

## Projetos avaliados

| Projeto | Repositório | Licença | Possível uso no app | Decisão atual |
|---|---|---|---|---|
| DOMPurify | https://github.com/cure53/DOMPurify | Apache-2.0 | Sanitizar HTML não confiável antes de inseri-lo no DOM | Candidato para uma revisão de segurança; não aplicar globalmente sem revisar os pontos de inserção |
| Floating UI | https://github.com/floating-ui/floating-ui | MIT | Posicionar menus, popovers e dicas sem sair da tela | Adotar somente se testes reais identificarem menus cortados ou posicionamento inconsistente |
| focus-trap | https://github.com/focus-trap/focus-trap | MIT | Manter o foco dentro de diálogos acessíveis | Não adicionar agora: o app já usa o elemento nativo `<dialog>` com `showModal()`, que oferece contenção de foco nativa nos navegadores compatíveis |
| Lucide | https://github.com/lucide-icons/lucide | ISC (com ícones derivados de Feather sob MIT) | Ícones SVG consistentes | Não adicionar agora: o app já possui sprite SVG próprio; outra coleção aumentaria o peso e duplicaria recursos |

## Referências visuais adicionais\n\n| Projeto | Repositório | Licença | Uso considerado | Decisão nesta etapa |\n|---|---|---|---|---|\n| Animate.css | https://github.com/animate-css/animate.css | MIT | Referência para transições e microanimações discretas | Padrões visuais adaptados em CSS próprio; nenhuma dependência externa foi adicionada |\n| SpinKit | https://github.com/tobiasahlin/SpinKit | MIT | Referência para indicadores de carregamento leves | Mantido como referência para futuras melhorias; sem alterar o fluxo de carregamento atual |\n\n## Regras para futuras integrações

1. Não incorporar repositórios inteiros ao projeto. Usar somente o pacote, arquivo ou componente estritamente necessário.
2. Conferir licença, manutenção, dependências e tamanho antes de integrar.
3. Preferir arquivos locais versionados no projeto, para não depender de CDN e preservar o uso offline.
4. Não enviar lançamentos, valores, PINs ou documentos dos usuários para serviços externos.
5. Fazer cada integração em branch e pull request separados, com testes em desktop e celular.
6. Não substituir componentes existentes sem demonstrar uma melhoria concreta e testar regressões.

## Próximos alvos de melhoria

- Revisar com cuidado os pontos em que dados digitados/importados são inseridos via `innerHTML`, para decidir se DOMPurify é necessário.
- Testar menus, listas e popovers em telas pequenas antes de considerar Floating UI.
- Preservar os gráficos SVG e os ícones atuais enquanto cumprirem os requisitos de acessibilidade e desempenho.

**Nota:** adicionar a referência de um projeto não significa que o código desse projeto foi incorporado ao aplicativo. As bibliotecas só devem entrar no pacote quando houver um caso de uso comprovado.
