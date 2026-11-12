# Funcionalidades do Meu Financeiro

Este documento apresenta as funções disponíveis no código do aplicativo. O projeto é um PWA offline-first: a maior parte das operações é executada no navegador e os dados permanecem no aparelho.

## 1. Painel
- Saldo, receitas, despesas e resultado do período.
- Comparação com o mês anterior.
- Gráficos de evolução e distribuição por categoria.
- Contas próximas do vencimento, metas e últimas movimentações.
- Filtros por dia, semana, mês e ano.

## 2. Lançamentos
- Criar, editar, excluir, pesquisar e filtrar receitas e despesas.
- Categorias personalizadas com cor e ícone.
- Forma de pagamento, observações e recorrências.
- Revisão antes de confirmar lançamentos capturados por voz.

## 3. Registro por voz
- Reconhecimento de fala em português brasileiro, conforme suporte do navegador.
- Interpretação de tipo, valor, data, categoria e forma de pagamento.
- Transcrição apresentada para conferência.
- O usuário confirma os dados antes de salvar.
- Quando o microfone não está disponível, é possível preencher o formulário.

## 4. Planejamento
- Orçamentos mensais e limites por categoria.
- Metas e cofrinhos.
- Contas a pagar, dívidas e parcelas.
- Assinaturas e lançamentos recorrentes.
- Previsão de saldo e comparação de períodos.

## 5. Relatórios e assistente local
- Relatórios por período, com gráficos e resumos.
- Exportação CSV e impressão em PDF pelo navegador.
- Assistente local que responde perguntas e gera insights a partir dos dados disponíveis no aparelho.
- O assistente atual não é uma integração com IA generativa externa e não exige chave de API.

## 6. Biblioteca de documentos e importação
- Armazenamento de documentos no IndexedDB local.
- Categorias, descrição, busca, abertura/visualização compatível, download e exclusão.
- Formatos aceitos pela interface incluem PDF, CSV, XLS, XLSX, DOC, DOCX, ODT, ODS, JPG, JPEG, PNG, WEBP e TXT.
- Limite local por arquivo: 25 MB.
- A leitura de lançamentos a partir de planilhas aceita XLSX e CSV.
- O leitor identifica linhas válidas, soma receitas e despesas e informa linhas ignoradas.
- O usuário visualiza o resumo e confirma a importação antes de registrar os lançamentos.
- Arquivos PDF e outros documentos permanecem na biblioteca; não são automaticamente convertidos em lançamentos.

## 7. Modo Empreendedor
- Cadastro de cliente com nome e valor inicial da dívida.
- Registro de pagamento selecionando o cliente.
- Atualização do saldo pendente após o pagamento.
- Lista de clientes com valores em aberto.
- Histórico de dívidas e pagamentos, com filtro por cliente.

## 8. Ferramentas e organização
- Calendário financeiro.
- Simulador de economia e calculadora de juros.
- Comparador de meses.
- Notificações de contas, orçamento e metas.
- Busca global.
- Tema claro, escuro ou automático e cor de destaque.

## 9. Backup e dados
- Backup e restauração dos dados do aplicativo em JSON.
- Backup opcional criptografado no Google Drive, na área privada do usuário.
- A cópia criptografada inclui os documentos da biblioteca.
- O backup JSON não inclui os arquivos da biblioteca de documentos.
- O PIN local não é transferido para outros aparelhos.

## 10. Limitações importantes
- O aplicativo não possui conta própria nem banco de dados central.
- Os dados locais podem ser perdidos se o navegador for limpo ou o aplicativo for desinstalado sem backup.
- O PIN protege a interface, mas não criptografa o armazenamento local.
- O backup no Google Drive depende de configuração OAuth, conexão e autorização.
- O backup remoto não é sincronização em tempo real garantida.
- A exportação de lançamentos é CSV; relatórios podem ser impressos/salvos em PDF.
- A leitura automática de planilhas está limitada a XLSX e CSV. Outros tipos de arquivo podem ser guardados na biblioteca, mas não interpretados como extrato.
