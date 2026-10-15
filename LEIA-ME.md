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

## Publicar no Vercel com PostgreSQL

O site pode ser servido diretamente pelo Vercel. A API foi separada em funções da pasta `api/`, e a versão hospedada usa PostgreSQL pela variável `DATABASE_URL`. O servidor `server.mjs` continua disponível para iniciar a versão local com MariaDB.

1. No Vercel, importe o repositório do GitHub como um projeto novo.
2. No Marketplace do Vercel, adicione uma integração PostgreSQL, como Neon. Escolha um plano e região e confirme os termos e custos apresentados pelo provedor.
3. Confira nas variáveis do projeto Vercel se existe `DATABASE_URL` com a conexão do PostgreSQL. O app cria as tabelas automaticamente no primeiro acesso à API.
4. Em **Settings → Build and Deployment**, selecione Node.js `24.x`, compatível com a versão local do projeto.
5. Faça o deploy. A raiz do repositório contém `index.html`, `app.css`, `app.js` e as funções `api/`.
6. Depois do deploy, abra `/api/health` para confirmar que a função está publicada; ela deve responder `{"ok":true}`. Depois teste cadastro, saída, login e salvamento. A conexão PostgreSQL será confirmada ao usar a API com `DATABASE_URL` configurada.

### Copiar as contas e dados do MariaDB local

Para um banco PostgreSQL novo e vazio, faça primeiro um backup do banco no HeidiSQL. Depois, copie `.env.example` para `.env`, mantenha as variáveis `DB_*` apontando para seu MariaDB local e preencha `PG_DATABASE_URL` com a conexão PostgreSQL privada do provedor. Não envie `.env` ao GitHub nem compartilhe a URL.

No terminal, dentro da pasta do projeto, execute `npm run migrate:postgres`. O script verifica se o destino já tem contas; se houver, cancela para evitar sobrescrever dados. Ele copia contas, sessões e dados salvos, incluindo os hashes das senhas, sem conhecer nem revelar as senhas originais. Faça essa cópia antes de permitir novos lançamentos no app online.

Não use o arquivo `schema.sql` para configurar o PostgreSQL: ele é específico do MariaDB local. O projeto cria as tabelas PostgreSQL automaticamente. Faça backups do destino e use primeiro somente dados de teste; este protótipo ainda precisa de revisão de segurança antes de armazenar informações financeiras reais de outras pessoas.

## Arquivos principais

- `server.mjs`: conexão com MariaDB, API, cadastro, login e sessões.
- `schema.sql`: banco, usuário de conexão com autenticação por senha e tabelas.
- `.env.example`: modelo das credenciais locais; copie para `.env`.
- `package.json`: dependências e versão mínima do Node.js.
- `index.html`, `app.css`, `app.js`: interface e lógica do aplicativo.

Fontes e importação/exportação XLSX usam serviços CDN e precisam de internet. Esta versão é um protótipo local; antes de publicar na internet, configure HTTPS, backups e proteção adequada das credenciais e do banco.
