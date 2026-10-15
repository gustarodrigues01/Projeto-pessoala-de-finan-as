# Família Próspera — MariaDB e Node.js

## Requisitos

- Node.js **24.18.0 ou superior**.
- MariaDB instalado e iniciado no computador. A configuração abaixo usa `127.0.0.1:3306`.
- VS Code aberto na pasta do projeto.

## Preparar o MariaDB

1. Abra o HeidiSQL e conecte com uma conta administradora do MariaDB.
2. Abra uma nova aba de consulta e carregue o arquivo `schema.sql` desta pasta.
3. No começo do arquivo, substitua `SUBSTITUA_POR_UMA_SENHA_NOVA` por uma senha nova para `familia_app`. Não use apóstrofo (`'`) nessa senha.
4. Execute o arquivo inteiro. Ele cria o banco, as tabelas e configura `familia_app` para autenticar com senha (`mysql_native_password`), método aceito pelo conector Node do projeto. Ele não apaga os dados das tabelas.
5. Copie `.env.example` para um arquivo chamado `.env` nesta mesma pasta. No `.env`, substitua `SUBSTITUA_PELA_MESMA_SENHA_DO_SCHEMA` pela senha que usou no SQL.

O `.env` precisa ficar ao lado de `package.json` e `server.mjs`. Não envie esse arquivo nem publique sua senha.

Se você esqueceu a senha de administrador do MariaDB, o HeidiSQL não poderá executar `schema.sql` até a conta administrativa ser recuperada. A senha `root` é diferente da senha do usuário `familia_app`. Não coloque a senha de `familia_app` no campo de senha do `root`.

## Iniciar o aplicativo

No terminal do VS Code, confirme que o caminho termina em `familia-prospera` e execute:

```powershell
npm install
npm start
```

Quando aparecer `Família Próspera aberto em http://127.0.0.1:3000`, abra esse endereço no navegador. Não abra `index.html` diretamente nem use Live Server: login e salvamento precisam do servidor Node.

O servidor verifica a conexão MariaDB antes de abrir o site. Se houver falha, mostra uma mensagem curta para indicar se faltam as credenciais, se a senha foi recusada, se o banco não existe ou se o MariaDB está solicitando GSSAPI.

## Dados e contas

- O cadastro é feito no próprio aplicativo, com e-mail e senha de pelo menos 10 caracteres.
- Cada pessoa tem seus próprios dados guardados em MariaDB.
- A senha de login do aplicativo é guardada como hash com salt. As sessões usam cookie `HttpOnly` e vencem após 7 dias.
- O app começa sem movimentações ou valores fictícios.
- O guia de uso aparece no primeiro acesso e pode ser aberto pelo botão “Aprender a usar”.

## Preparar publicação na internet (Railway)

Esta configuração mantém o MariaDB e publica o servidor Node. A aplicação aceita `MARIADB_PRIVATE_URL` para conectar ao banco dentro da rede privada da hospedagem. Não coloque o endereço público do banco nem credenciais no código ou no GitHub.

1. Confirme que o GitHub recebeu os arquivos do projeto (`server.mjs`, `package.json`, `package-lock.json`, `index.html`, `app.css`, `app.js` e `schema.sql`). O `.env` e `node_modules` não devem ser enviados.
2. No Railway, crie um projeto e adicione um serviço MariaDB com volume persistente em `/var/lib/mysql`. Mantenha a porta 3306 privada.
3. Adicione o projeto Node ao mesmo projeto Railway conectando o repositório do GitHub. O comando de início é `npm start`; a versão mínima de Node está definida em `package.json`.
4. Nas variáveis do serviço Node, configure `HOST=0.0.0.0`, `NODE_ENV=production` e `COOKIE_SECURE=true`.
5. Configure `MARIADB_PRIVATE_URL` como referência para a URL privada fornecida pelo serviço MariaDB. Não digite nem cole essa credencial em conversas, commits ou arquivos públicos.
6. Gere um domínio público HTTPS para o serviço Node. Depois do deploy, confira o domínio e o endereço `/health`, que deve responder `{"ok":true}`.
7. Crie uma conta de teste e confirme cadastro, login e salvamento. As contas e lançamentos do MariaDB local não são copiados automaticamente para o banco hospedado.

O serviço MariaDB em Railway exige plano com cobrança e armazenamento persistente. Confira os valores atuais antes de ativar. Faça backup periódico do banco. Este aplicativo ainda é um protótipo: antes de guardar dados financeiros reais de outras pessoas, revise segurança, recuperação de senha, limite de tentativas de login e rotina de backup.

## Arquivos principais

- `server.mjs`: conexão com MariaDB, API, cadastro, login e sessões.
- `schema.sql`: banco, usuário de conexão com autenticação por senha e tabelas.
- `.env.example`: modelo das credenciais locais; copie para `.env`.
- `package.json`: dependências e versão mínima do Node.js.
- `index.html`, `app.css`, `app.js`: interface e lógica do aplicativo.

Fontes e importação/exportação XLSX usam serviços CDN e precisam de internet. Esta versão é um protótipo local; antes de publicar na internet, configure HTTPS, backups e proteção adequada das credenciais e do banco.
