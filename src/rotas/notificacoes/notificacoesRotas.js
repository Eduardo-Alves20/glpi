import { Router } from "express";
import {
  exigirLogin,
  exigirUsuarioAtivo,
  exigirPerfis,
} from "../../compartilhado/middlewares/seguranca.js";
import { acharPorId } from "../../repos/usuariosRepo.js";
import {
  notificacoesIndexGet,
  notificacaoMarcarLidaPost,
  notificacoesMarcarTodasPost,
} from "../../controllers/notificacoes/notificacoesWebController.js";

export function criarNotificacoesRotas({ auditoria } = {}) {
  const router = Router();
  const validarAtivo = exigirUsuarioAtivo(acharPorId);

  router.use(
    "/notificacoes",
    exigirLogin,
    validarAtivo,
    exigirPerfis(["usuario", "tecnico", "admin"], {
      onNegado: auditoria?.registrarTentativaAcessoNegado,
    }),
  );

  router.get("/notificacoes", notificacoesIndexGet);
  router.post("/notificacoes/marcar-todas-lidas", notificacoesMarcarTodasPost);
  router.post("/notificacoes/:id/lida", notificacaoMarcarLidaPost);

  return router;
}
