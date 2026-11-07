# Segurança e futura sincronização na nuvem

## Estado atual

A aplicação é offline-first e não possui contas de usuário nem backend de dados.
Lançamentos, categorias, orçamentos, metas, dívidas, assinaturas, recorrências e
configurações ficam no `localStorage`. Documentos ficam no IndexedDB. O PIN
atual protege somente a interface; não criptografa o armazenamento.

A sincronização na nuvem **não está ativada**. A interface deve informar isso sem
induzir o usuário a acreditar que há backup remoto.

## Requisitos obrigatórios antes de lançar sincronização

1. Criar projeto de backend gerenciado (por exemplo, Supabase) em conta controlada
   pelo proprietário do aplicativo.
2. Usar autenticação oficial por e-mail, com confirmação de endereço, recuperação
   segura de senha e sessões com expiração apropriada.
3. Criar tabelas com identificador de usuário e habilitar Row Level Security
   (RLS) em todas elas.
4. Criar políticas que permitam SELECT/INSERT/UPDATE/DELETE somente quando
   `auth.uid() = user_id`. Não confiar em filtros feitos apenas no frontend.
5. Não colocar `service_role`, senhas, tokens administrativos ou segredos no
   repositório, no HTML ou no JavaScript entregue ao navegador. Somente a chave
   pública/anon do projeto pode ser usada no cliente, sempre com RLS correto.
6. Separar dados por usuário e validar tamanho, formato e propriedade dos
   documentos enviados. Definir limites e regras de armazenamento.
7. Manter o modo local como fonte disponível offline, com sincronização explícita
   e tratamento de conflitos; nunca sobrescrever dados locais silenciosamente.
8. Não apagar dados locais após upload. Oferecer exportação e exclusão de conta
   com aviso claro e confirmação.
9. Documentar privacidade, retenção, exclusão, incidentes e contato do responsável.
10. Testar com duas contas distintas: uma conta jamais pode ler, alterar ou apagar
    dados da outra. Testar também sessão expirada, rede interrompida, duplicação,
    conflito e restauração.

## Configuração necessária

A implementação real depende de um projeto backend criado pelo proprietário.
Após a criação, serão necessários somente os dados públicos de conexão do projeto
(URL e chave anon/public). Nunca solicitar nem aceitar a chave `service_role`,
senha administrativa ou credenciais pessoais do proprietário no código público.

## Critério de liberação

A sincronização só pode ser anunciada como disponível após:
- políticas RLS verificadas no próprio banco;
- testes automatizados de isolamento entre contas;
- sincronização e recuperação testadas em dois dispositivos;
- validação de que o app continua operando offline;
- revisão do fluxo de exclusão e recuperação de conta.

Até cumprir esses critérios, a mensagem exibida ao usuário deve dizer que não há
backup automático na nuvem e recomendar backup local periódico.


## Artefatos preparados no repositório

- `supabase/schema.sql`: tabelas de backup e metadados, políticas RLS e bucket privado de documentos.
- `docs/preparacao-supabase.md`: roteiro de criação e configuração do projeto Supabase.

Esses arquivos são apenas a preparação do backend. O app ainda não tem autenticação nem cliente de sincronização conectado. Não ativar a função nem prometer recuperação em outro aparelho até concluir a implementação do cliente e os testes descritos acima.
