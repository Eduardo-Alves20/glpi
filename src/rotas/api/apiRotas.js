import { Router } from "express";
import { exigirLogin, exigirUsuarioAtivo, exigirPerfis } from "../../compartilhado/middlewares/seguranca.js";
import { acharPorId } from "../../repos/usuariosRepo.js";

import { apiPollChamadoGet } from "../../controllers/api/apiChamadosController.js";
import { apiTecnicoInboxGet } from "../../controllers/api/apiTecnicoController.js";
import { apiUsuarioInboxGet } from "../../controllers/api/apiUsuarioController.js";

// +++ NOVO (notificações)
import * as notif from "../../controllers/api/notificacoesController.js";

export function criarApiRotas({ auditoria } = {}) {
  const router = Router();
  const validarAtivo = exigirUsuarioAtivo(acharPorId);

  // Tudo aqui já estará sob /api (porque app.use("/api", router))
  router.use(exigirLogin, validarAtivo);

  // Poll de um chamado
  router.get("/chamados/:id/poll", apiPollChamadoGet);

  // Inbox técnico
  router.get(
    "/tecnico/inbox",
    exigirPerfis(["tecnico", "admin"], { onNegado: auditoria?.registrarTentativaAcessoNegado }),
    apiTecnicoInboxGet
  );

  // Inbox usuário
  router.get(
    "/usuario/inbox",
    exigirPerfis(["usuario", "admin", "tecnico"], { onNegado: auditoria?.registrarTentativaAcessoNegado }),
    apiUsuarioInboxGet
  );

  // ===== Notificações (Opção 2) =====
  router.get("/notificacoes", notif.listar);
  router.get("/notificacoes/unread-count", notif.unreadCount);
  router.patch("/notificacoes/:id/lida", notif.marcarLida);
  router.post("/notificacoes/marcar-todas-lidas", notif.marcarTodas);

  return router;
}