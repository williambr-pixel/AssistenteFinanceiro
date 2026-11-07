# Preparação da sincronização segura

## Situação

O aplicativo continua funcionando localmente e offline. A sincronização ainda NÃO está ativa. Este repositório contém a estrutura SQL inicial e este roteiro; não existe conexão com um projeto Supabase até que o proprietário crie e configure um projeto e que o cliente de sincronização seja implementado e testado.

## O que esta estrutura protege

- Cada conta tem um único backup financeiro identificado pelo próprio ID de autenticação.
- Row Level Security (RLS) está habilitada nas tabelas.
- As políticas permitem que uma pessoa consulte, crie, altere ou apague somente suas linhas.
- Os documentos usam bucket privado, limite de 25 MB e políticas que exigem que o primeiro diretório do caminho seja o ID da própria conta.
- A exclusão de uma conta no Auth remove as linhas relacionadas por chave estrangeira. A limpeza dos objetos do Storage deve ser tratada por fluxo próprio antes de liberar exclusão de conta.

## Preparar o projeto Supabase

1. Crie um projeto Supabase em uma conta controlada pelo proprietário do Meu Financeiro.
2. No painel, abra SQL Editor e execute o conteúdo de supabase/schema.sql.
3. Em Authentication → Providers, habilite e-mail/senha. Exija confirmação de e-mail e configure recuperação de senha e URLs de redirecionamento para o endereço HTTPS publicado do app.
4. Em Authentication → URL Configuration, defina o endereço publicado como Site URL e adicione os endereços de produção e desenvolvimento realmente usados.
5. Em Project Settings → API, copie somente a Project URL e a chave publicável (publishable/anon) para a futura configuração do cliente.
6. Nunca copie a chave service_role/secret para o navegador, HTML, JavaScript, GitHub Pages, issue ou conversa.
7. Antes de armazenar dados reais, teste duas contas diferentes: cada conta deve receber erro ou nenhum resultado ao tentar acessar o backup, metadados e arquivos da outra.

## Limites desta etapa

- O SQL cria a estrutura do banco e do armazenamento privado, mas não cria telas de cadastro/login e não sincroniza nada sozinho.
- O cliente ainda precisa implementar confirmação de e-mail, login, logout, recuperação de senha, backup/restauração explícitos, sincronização com controle de versão e conflitos.
- O backup financeiro é um JSON completo. A sincronização não deve sobrescrever dados locais silenciosamente: deve mostrar a data da cópia na nuvem e pedir confirmação antes de restaurar ou substituir.
- Os documentos precisam ser enviados e baixados separadamente; o backup JSON atual não inclui os arquivos.
- A criptografia em trânsito é fornecida por HTTPS/TLS. O banco gerenciado oferece criptografia em repouso conforme a plataforma, mas este desenho inicial não oferece criptografia ponta a ponta: o operador do projeto com privilégios administrativos poderá acessar dados armazenados.
- Não há painel administrativo para visualizar finanças dos usuários. Não se deve criar acesso administrativo aos dados pessoais sem finalidade, transparência e controles adequados.

## Critério para ativar em produção

Não anunciar backup na nuvem como ativo até implementar o cliente, verificar as políticas RLS no projeto real, testar isolamento entre contas, testar recuperação em outro aparelho, testar rede interrompida e conflitos, e confirmar que o modo offline e os dados locais continuam intactos.
