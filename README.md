# GLPI Desafio

Sistema web de chamados (helpdesk) com perfis de acesso (`admin`, `tecnico`, `usuario`), notificacoes em tempo real e fluxo completo de atendimento.

## O que o sistema faz hoje

- Autenticacao com sessao (`/auth`) e redirecionamento por perfil (`/app`).
- Gestao de chamados:
  - Abertura, edicao e acompanhamento pelo solicitante.
  - Assumir chamado, interagir no chat, enviar solucao e moderar avaliacao (tecnico/admin).
  - Confirmar solucao, reabrir chamado e avaliar atendimento (usuario).
  - Exclusao de chamado somente pelo admin.
- Painel administrativo:
  - Dashboard geral.
  - Dashboard de tecnicos (carga, produtividade, criticidade, saude).
  - Gestao de usuarios.
  - Gestao de categorias e prioridades.
  - Logs e trilha de auditoria.
- Notificacoes:
  - Realtime via WebSocket (`/ws/notificacoes`).
  - Endpoints HTTP para listar e marcar como lida.
- Base de conhecimento:
  - Listagem e visualizacao por todos os perfis logados.
  - Criacao de artigo por tecnico/admin.
- Anexos em chamados com validacao de tipo e tamanho.

## Stack tecnica

- Node.js + Express + EJS
- MongoDB
- Sessao com `express-session` + `connect-mongo`
- WebSocket com `ws`

## Requisitos

- Git
- Node.js 20+ (recomendado)
- Docker Desktop (opcional, para subida rapida)
- MongoDB 7+ (se rodar sem Docker)

---

## Como baixar/puxar o projeto

### Primeira vez (clonar)

```bash
git clone <URL_DO_REPOSITORIO>
cd glpi-desafio
```

### Atualizar repositorio local (depois de clonado)

```bash
git pull origin main
npm install
```

Se a branch principal nao for `main`, troque para a branch correta (ex.: `master`).

---

## Subir o sistema - opcao recomendada (Docker)

1. Entre na pasta do projeto:

```bash
cd glpi-desafio
```

2. Suba os servicos:

```bash
docker compose up -d --build
```

3. Acesse no navegador:

```text
http://localhost:3000/auth
```

4. Login bootstrap (somente desenvolvimento):

```text
usuario: admin
senha: admin123
```

> Em `NODE_ENV=production`, esse login bootstrap e bloqueado.

5. Para parar:

```bash
docker compose down
```

---

## Subir o sistema - opcao local (Node + Mongo no host)

1. Instale dependencias:

```bash
npm install
```

2. Crie um arquivo `.env` na raiz com o minimo:

```env
NODE_ENV=development
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017
MONGO_DB=glpi_dev
SESSION_SECRET=troque-por-uma-chave-bem-grande-com-32-ou-mais-caracteres
AMBIENTE=LOCAL
```

3. Garanta que o MongoDB esta rodando localmente.

4. Rode a aplicacao:

```bash
npm run dev
```

ou

```bash
npm start
```

5. Acesse:

```text
http://localhost:3000/auth
```

## Variaveis de ambiente usadas

- `PORT`: porta HTTP (padrao `3000`)
- `NODE_ENV`: ambiente (`development` ou `production`)
- `MONGO_URI`: conexao Mongo
- `MONGO_DB`: nome do banco
- `SESSION_SECRET`: segredo da sessao (em producao, use valor forte)
- `SESSION_TTL_HOURS`: duracao da sessao (padrao `8`)
- `SESSION_ROLLING`: renova cookie a cada request (`false` recomendado para reduzir escrita)
- `SESSION_TOUCH_AFTER_SECONDS`: intervalo minimo para atualizar sessao no store (padrao `300`)
- `AMBIENTE`: texto para exibicao/diagnostico em telas/logs
- `FAQ_WIKI_DOCS_DIR`: caminho alternativo para docs da base de conhecimento (opcional)
- `MONGO_MAX_POOL_SIZE`: tamanho maximo do pool Mongo (padrao `60`)
- `MONGO_MIN_POOL_SIZE`: conexoes minimas no pool Mongo (padrao `5`)
- `USER_ACTIVE_CACHE_TTL_MS`: cache local para validacao de usuario ativo (padrao `15000`)

## Estrutura resumida

```text
src/
  controllers/   # regras de entrada e resposta HTTP
  repos/         # acesso a dados no Mongo
  rotas/         # definicao das rotas por modulo
  service/       # regras de negocio e utilitarios
  views/         # telas EJS
  public/        # css/js/assets
storage/
  anexos/chamados/   # arquivos enviados nos chamados
```

## Fluxo funcional (resumo)

1. Usuario abre chamado.
2. Tecnico/admin assume chamado.
3. Conversa e atualizacoes acontecem no chat do chamado.
4. Tecnico envia solucao.
5. Usuario confirma (fecha), ou reabre com nova interacao.
6. Usuario pode avaliar atendimento.

## Troubleshooting rapido

- Porta 3000 ocupada:
  - Troque `PORT` no `.env`.
- Erro de conexao com Mongo:
  - Valide `MONGO_URI`, `MONGO_DB` e se o Mongo esta ativo.
- Login bootstrap nao funciona:
  - Verifique se esta em `NODE_ENV=development`.
- Notificacao em tempo real nao chega:
  - Verifique se o navegador consegue conectar no endpoint `/ws/notificacoes`.

## Teste de carga (100 usuarios logados)

Arquivos:
- `scripts/load/k6-100-users.js`
- `scripts/load/k6-workflow-full.js`
- `scripts/load/credentials.sample.csv`
- `scripts/load/run-k6.ps1`
- `scripts/load/run-k6-workflow.ps1`
- `scripts/load/seed-loadtest-users.mongo.js`
- `scripts/load/cleanup-loadtest-users.mongo.js`
- `scripts/load/generate-credentials.ps1`

### Seed de usuarios (usuario, tecnico e admin)

Opcao 1 (mongosh local):

```powershell
mongosh "mongodb://localhost:27017/glpi_dev" --file scripts/load/seed-loadtest-users.mongo.js
```

Opcao 2 (usando container Docker do projeto):

```powershell
Get-Content -Raw .\scripts\load\seed-loadtest-users.mongo.js | docker exec -i glpi_mongo mongosh "mongodb://localhost:27017/glpi_dev"
```

Por padrao, o seed cria:
- 100 usuarios: `usuario001..usuario100`
- 20 tecnicos: `tecnico001..tecnico020`
- 5 admins: `admin001..admin005`
- senha padrao: `senha123`

Gerar `credentials.csv` automaticamente:

```powershell
.\scripts\load\generate-credentials.ps1 -Usuarios 100 -Tecnicos 20 -Admins 5 -Password "senha123"
```

Limpar usuarios do seed:

```powershell
mongosh "mongodb://localhost:27017/glpi_dev" --file scripts/load/cleanup-loadtest-users.mongo.js
```

1. Instale o k6 (uma vez):

```powershell
winget install --id GrafanaLabs.k6 --exact
```

2. Crie o arquivo de credenciais:

```powershell
Copy-Item scripts/load/credentials.sample.csv scripts/load/credentials.csv
```

3. Preencha `scripts/load/credentials.csv` com usuarios reais (`username,password`).

4. Rode o teste para 100 VUs:

```powershell
.\scripts\load\run-k6.ps1 -BaseUrl "http://localhost:3000" -Vus 100 -Ramp "30s" -Hold "2m"
```

Opcional via npm:

```powershell
$env:BASE_URL="http://localhost:3000"
$env:VUS="100"
$env:CREDS_FILE="scripts/load/credentials.csv"
npm run loadtest:k6
```

### Teste workflow completo (criacao + atendimento + chat + solucao + confirmacao)

Esse teste usa os usuarios seed por padrao:
- usuario: `usuario001..`
- tecnico: `tecnico001..`
- admin: `admin001..`
- senha: `senha123`

Rodar:

```powershell
.\scripts\load\run-k6-workflow.ps1 -BaseUrl "http://localhost:3000" -Vus 40 -Ramp "30s" -Hold "2m"
```

Esse script agora testa tambem:
- 10 interacoes por chamado (5 tecnico + 5 usuario)
- 5 envios de anexos variados por chamado (`pdf`, `png/jpg`, `docx`, `xlsx`)
- avaliacao do atendimento apos fechamento
- acesso por URL do chamado depois de fechado
- tentativas de acesso negado por perfil (1 a cada 100 iteracoes por padrao)

Com reabertura opcional:

```powershell
.\scripts\load\run-k6-workflow.ps1 -BaseUrl "http://localhost:3000" -Vus 40 -EnableReopen "1"
```

Exemplo de execucao "stress/chaos" (mantendo 1/100 para rotas proibidas):

```powershell
.\scripts\load\run-k6-workflow.ps1 `
  -BaseUrl "http://localhost:3000" `
  -Vus 100 `
  -Ramp "30s" `
  -Hold "10m" `
  -ChatInteractions 10 `
  -AttachmentSends 5 `
  -EnableAvaliacao "1" `
  -EnableClosedUrlCheck "1" `
  -EnablePermissionNegative "1" `
  -NegativeSampleEvery 100
```

## Publicar no Git

Depois de ajustar e validar local:

```bash
git add .
git commit -m "docs: adiciona README com setup e visao funcional"
git push origin main
```
