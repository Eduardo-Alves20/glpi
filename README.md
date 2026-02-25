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
- `AMBIENTE`: texto para exibicao/diagnostico em telas/logs
- `FAQ_WIKI_DOCS_DIR`: caminho alternativo para docs da base de conhecimento (opcional)

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

## Publicar no Git

Depois de ajustar e validar local:

```bash
git add .
git commit -m "docs: adiciona README com setup e visao funcional"
git push origin main
```

