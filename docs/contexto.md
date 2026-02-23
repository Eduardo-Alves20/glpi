# CONTEXTO-PROJETO — GLPI-desafio (Clone simples GLPI/SISLOG)

## 1) Objetivo
Clone simples de helpdesk/ITSM (estilo GLPI/SISLOG), feito do zero com Node.js + Express + EJS + MongoDB.
Prioridades não-negociáveis:
- Estrutura limpa (camadas)
- Escalabilidade
- Segurança desde o início (RBAC, ownership, allowlist, projeção mínima)

---

## 2) Stack e padrões técnicos
- Node.js + Express em ES Modules (`"type": "module"`).
- Views: EJS + `express-ejs-layouts`.
- MongoDB: `MongoClient` com helpers `conectarMongo()` / `pegarDb()`.
- Sessões: `express-session` + `connect-mongo`
  - collection: `sessoes`
  - cookie: `httpOnly`, `sameSite=lax`, `secure` em produção
  - `maxAge`: 8h, `rolling: true`, `name: glpi.sid`
- Static: `/styles`, `/assets`, `/js` servidos de `src/public/...`
- Hardening básico:
  - `app.disable("x-powered-by")`
  - `trust proxy`
  - headers defensivos
  - limites defensivos no body parser

---

## 3) Arquitetura por camadas (regra do projeto)
- Rotas: `src/rotas/...`
- Controllers: `src/controllers/...`
- Repos (dados): `src/repos/...`

Regras:
- Repo NÃO renderiza view.
- Controller NÃO faz query “crua” repetida (usa repo).
- Segurança e regras de negócio críticas ficam no repo:
  - ownership (ex.: `criadoPor.usuarioId`)
  - allowlist de campos em updates
  - projeção mínima nas consultas
  - limites defensivos em listagens/paginação

---

## 4) Montagem de rotas (ordem e módulos)
Ordem de montagem:
1) Auth
2) App (roteamento pós-login)
3) Admin
4) Técnico
5) Usuário
6) Chamados
Raiz `/` redireciona para `/auth`.

(Arquivo: `src/rotas/index.js`)

---

## 5) Segurança (RBAC + sessão)
- RBAC via middleware (não confiar no client).
- Gates por prefixo:
  - `/admin` exige login + usuário ativo + perfil `admin`.
  - `/tecnico` exige login + usuário ativo + perfil `tecnico` (e/ou `admin`).
  - Outros módulos seguem a mesma estratégia (evitar repetir middleware por rota).
- Sessão derrubada se usuário não existir ou estiver bloqueado.
- EJS com escape `<%= %>` + validação server-side.

---

## 6) Autenticação e redirect por perfil
- Login: `POST /auth` usando `acharPorUsuarioOuEmail()` + bcrypt.
- Sessão padrão:
  `req.session.usuario = { id, nome, usuario, perfil }`
- Redirect pós-login via `GET /app`:
  - admin -> `/admin`
  - tecnico -> `/tecnico`
  - usuario -> `/chamados/meus`
- Admin bootstrap temporário em dev: `admin/admin123`.

---

## 7) Flash + SweetAlert
- Controller seta:
  `req.session.flash = { tipo, mensagem }`
- Layout injeta e `/js/alerts.js` dispara Swal.
- Layout suporta:
  - `cssExtra` (CSS por página)
  - `jsExtra` (scripts por página)

---

## 8) Módulo Usuários (Admin)
- Admin cria usuário em `/admin/usuarios/novo`
- Validação server-side: `validarNovoUsuario`
- Senha mín. 8 -> hash com `gerarHashSenha`
- Bloqueia duplicidade por `acharPorUsuarioOuEmail`
- Sugestão automática de login:
  - inicial do primeiro nome + último sobrenome (ex.: `ealves`)
  - fallback: inicial + outros sobrenomes
  - sem fallback numérico (decisão atual)
- Endpoint:
  `GET /admin/usuarios/sugerir-login?nome=...` (JSON)

---

## 9) Módulo Chamados (Usuário)
Funcionalidades:
- Criar: `GET/POST /chamados/novo`
- Listar meus: `GET /chamados/meus`
- Editar: `GET/POST /chamados/:id/editar` (somente dono e status `aberto`)
- Detalhe do chamado: `GET /chamados/:id` (se implementado)

Modelo (Mongo `chamados`):
- `numero` sequencial via `counters` (`findOneAndUpdate` com `$inc`)
- `status`, `criadoPor`, `responsavelId/login/nome`, datas de ciclo
- `historico[]` com eventos
- `createdAt`, `updatedAt`

Listagem escalável:
- `listarChamados({ status, solicitanteId, responsavelId, limit })`
- wrappers: `listarMeusChamados`, `listarMeusAtendimentos`, `listarFilaChamados`
- projeção mínima + allowlist + limites defensivos

Índices típicos:
- `numero` unique
- `status + createdAt`
- `responsavelId + createdAt`

---

## 10) Módulo Técnico (fluxo mínimo)
Rotas/telas:
- Home técnico: `GET /tecnico`
- Fila técnico: `GET /tecnico/chamados`
- Detalhe: `GET /tecnico/chamados/:id`
- Assumir: `POST /tecnico/chamados/:id/assumir`
- Enviar solução: `POST /tecnico/chamados/:id/solucao`

Regra podeTecnicoVerChamado:
- técnico vê se:
  - chamado está aberto sem responsável (fila), OU
  - `responsavelId == tecnicoId` (qualquer status)

Fluxo mínimo:
1) Usuário cria chamado (aberto)
2) Técnico assume (em_atendimento)
3) Técnico envia solução -> (aguardando_usuario)
4) Usuário confirma -> fechado
5) Usuário reabre com comentário -> aberto

Auto-fechamento (planejado):
- `fecharChamadosVencidosAguardandoUsuario({ dias: 30 })`
- hoje: interval diário no servidor
- futuro: worker/cron + lock no Mongo para multi-instância

---

## 11) Próximas entregas (planejamento)
- Transferir chamado (técnico -> outro técnico)
  - se chamado é do técnico logado: botão “Transferir”
  - UI com SweetAlert (login do técnico destino ou busca/lista)
  - backend:
    - validar destino: perfil=tecnico, status=ativo
    - atualizar `responsavelId/nome/login`
    - histórico de transferência
- Padronizar status (“resolvido” vs “aguardando_usuario”) para não competir
- Refinos UX:
  - link “Abrir” em listas
  - badges de status
  - CSS organizado por módulo (`/styles/tecnico`, `/styles/admin`, etc.)
- Robustez auto-fechamento:
  - tirar do interval local e colocar em job dedicado depois

---

## 12) Arquivos âncora (sempre úteis em chat novo)
Envie estes 4 para qualquer novo chat entender o projeto:
1) `server.js`
2) `src/rotas/index.js`
3) `src/repos/chamadosRepo.js`
4) `src/compartilhado/middlewares/seguranca.js`