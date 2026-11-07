# Configurar o Google Drive para o Meu Financeiro

Este aplicativo usa a pasta privada `appDataFolder` do Google Drive. Não é
necessário criar banco de dados ou servidor próprio.

## 1. Criar o projeto e ativar a API

1. Entre no [Google Cloud Console](https://console.cloud.google.com/).
2. Crie um projeto para o Meu Financeiro.
3. Abra **APIs e serviços → Biblioteca**.
4. Pesquise **Google Drive API** e clique em **Ativar**.

## 2. Configurar a tela de consentimento OAuth

1. Abra **Google Auth Platform** (ou **APIs e serviços → Tela de consentimento OAuth**).
2. Configure o nome do aplicativo como **Meu Financeiro** e informe um e-mail
   de suporte/contato que você controla.
3. Escolha o tipo de usuário adequado. Para testes, deixe o app em modo
   **Testing** e adicione sua conta Google em **Test users**.
4. O aplicativo solicita somente o escopo
   `https://www.googleapis.com/auth/drive.appdata`.

O Google pode exibir um aviso de aplicativo não verificado durante os testes.
Para disponibilizar o recurso amplamente, verifique os requisitos atuais de
verificação OAuth do Google. Não peça aos usuários para ignorar avisos de
segurança.

## 3. Criar o ID de cliente OAuth

1. Em **Clientes → Criar cliente**, escolha **Aplicativo da Web**.
2. Em **Origens JavaScript autorizadas**, adicione:
   - `https://williambr-pixel.github.io`
   - `http://localhost:8000` (somente se usar o servidor local indicado no README).
3. Não é necessário cadastrar URI de redirecionamento para o fluxo de token
   usado pelo aplicativo.
4. Crie o cliente e copie o **ID do cliente** terminado em
   `.apps.googleusercontent.com`.

O ID de cliente é público e pode ser usado no navegador. Não copie nem publique
client secret, senha, token ou chave administrativa.

## 4. Configurar no aplicativo

1. Abra **Meu Financeiro → Configurações → Backup automático no Google Drive**.
2. Cole o ID do cliente OAuth.
3. Crie uma senha exclusiva para criptografar seus backups, com pelo menos
   12 caracteres.
4. Use a mesma senha em todos os aparelhos que precisar restaurar.
5. Toque em **Conectar ao Google Drive** e autorize o acesso solicitado.

A senha de criptografia não é a senha da conta Google. Ela não é enviada ao
Google nem armazenada pelo aplicativo. Se esquecê-la, o backup não poderá ser
descriptografado.

## 5. Como funciona

- O primeiro acesso cria um backup se ainda não existir um.
- Alterações são enviadas alguns segundos depois, enquanto o app está aberto,
  conectado e autorizado.
- Para restaurar em outro aparelho, use o mesmo ID OAuth, a mesma conta Google
  e a mesma senha de criptografia; depois toque em **Restaurar da nuvem**.
- Se já existir backup na nuvem, o app pede que você escolha entre restaurar
  ou substituir. Não escolha substituir se a cópia remota for a que deseja
  preservar.
- Se o Google expirar a autorização, conecte novamente.
- Se o app estiver fechado, o navegador pode suspender o trabalho; não há
  garantia de backup em segundo plano.
- Os dados locais não são apagados quando o backup é enviado.

## Atenção

O backup é criptografado com AES-256-GCM antes do upload. Inclui dados
financeiros e documentos da biblioteca, dentro do limite de 80 MB por pacote.
O PIN local não é transferido entre dispositivos. Faça também um backup JSON
manual antes de testar a restauração pela primeira vez.
