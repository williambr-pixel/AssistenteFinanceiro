# Segurança e backup no Google Drive

## Arquitetura

O Meu Financeiro continua offline-first e não possui banco de dados central,
conta própria ou servidor de sincronização. Lançamentos e configurações ficam
no armazenamento local do navegador; documentos ficam no IndexedDB.

O backup opcional usa a pasta privada `appDataFolder` do Google Drive de cada
usuário. O aplicativo não lista nem compartilha esses arquivos como documentos
comuns do Drive. Cada conta Google guarda seu próprio backup.

## Proteção criptográfica

- O conteúdo é criptografado no aparelho antes de qualquer upload.
- Algoritmo: AES-256-GCM.
- Derivação da chave: PBKDF2 com SHA-256 e 310.000 iterações, salt aleatório
  de 16 bytes e IV aleatório de 12 bytes por backup.
- A senha de criptografia não é enviada ao Google nem salva em
  `localStorage`. Ela permanece na memória da sessão.
- O PIN local não é incluído no backup; ao restaurar, o PIN já configurado no
  aparelho de destino é preservado.
- O token OAuth fica apenas em memória e expira. Não gravar tokens no
  armazenamento local ou no repositório.
- Se o usuário esquecer a senha de criptografia, não há recuperação possível.
  O app deve explicar isso antes do primeiro backup.

A criptografia protege o conteúdo do arquivo armazenado no Drive. Ela não
substitui a segurança do aparelho, a proteção da conta Google ou a revisão do
código entregue ao navegador.

## Comportamento da sincronização

1. O usuário configura o ID OAuth do aplicativo, conecta a própria conta Google
   e digita sua senha exclusiva de backup.
2. Se ainda não houver backup, o app cria o primeiro arquivo criptografado.
3. Alterações financeiras e de documentos agendam um backup após alguns
   segundos, enquanto o app estiver aberto, conectado e autorizado.
4. Ao abrir o app em outro aparelho, o usuário conecta a mesma conta Google e
   informa a mesma senha. Pode restaurar o arquivo remoto.
5. O backup inclui lançamentos, categorias, orçamentos, metas, contas,
   configurações e arquivos da biblioteca local. Limite do pacote: 80 MB;
   cada documento continua sujeito ao limite local de 25 MB.
6. O PIN não é transferido entre aparelhos.
7. Se o arquivo remoto tiver sido alterado desde a última sincronização
   conhecida, o envio automático é pausado. O usuário deve escolher
   explicitamente restaurar ou substituir a versão da nuvem.

O navegador pode suspender abas e PWAs em segundo plano. Portanto, não prometer
backup em segundo plano quando o app estiver fechado. O token pode expirar e
exigir nova autorização. O modo local permanece funcional mesmo sem conexão.

## Configuração Google Cloud

Siga o roteiro em [google-drive-backup.md](google-drive-backup.md). O cliente
usa apenas o escopo `drive.appdata`, não usa chave de servidor, service account
ou credencial administrativa. O ID de cliente OAuth é público; nunca adicionar
client secret ao frontend.

## Antes de divulgar o recurso

- Criar e configurar o projeto OAuth do proprietário do app.
- Habilitar Google Drive API e configurar origens JavaScript autorizadas.
- Concluir o processo de consentimento/verificação exigido pelo Google para
  disponibilizar o app publicamente.
- Testar contas Google diferentes e verificar que cada uma acessa somente seu
  próprio `appDataFolder`.
- Testar primeira cópia, restauração em outro aparelho, senha incorreta,
  token expirado, rede interrompida, conflitos e backup grande.
- Testar no Chrome/Android e Safari/iPhone, incluindo o app instalado como PWA.
- Confirmar que o app continua funcionando offline e que nenhum token ou senha
  é persistido.

## Limitações conhecidas

A implementação atual é um backup de arquivo único, não sincronização em tempo
real por registro. Alterações concorrentes são tratadas como conflito e exigem
escolha do usuário. O Google pode exigir verificação OAuth para uso público,
dependendo da configuração e dos escopos. Não anunciar o recurso como pronto
para todos até concluir a configuração e os testes acima.
