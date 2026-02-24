import { Router } from "express";
import {
  exigirLogin,
  exigirUsuarioAtivo,
  exigirPerfis,
} from "../../compartilhado/middlewares/seguranca.js";
import { acharPorId } from "../../repos/usuariosRepo.js";
import {
  chamadoNovoGet,
  chamadoNovoPost,
  meusChamadosGet,
  chamadoEditarGet,
  chamadoEditarPost,
} from "../../controllers/chamados/chamadosController.js";

import {
  usuarioChamadoShowGet,
  usuarioChamadoConfirmarPost,
  usuarioChamadoReabrirPost,
  usuarioChamadoInteracaoPost
} from "../../controllers/chamados/chamadoUsuarioController.js";



export function criarChamadosRotas({ auditoria } = {}) {
  const router = Router();
  const validarAtivo = exigirUsuarioAtivo(acharPorId);

  // protege tudo em /chamados
 router.use(
  exigirLogin,
  validarAtivo,
  exigirPerfis(["usuario", "admin", "tecnico"], { onNegado: auditoria?.registrarTentativaAcessoNegado })
);;
router.get("/chamados/meus", meusChamadosGet);
  router.get("/chamados/novo", chamadoNovoGet);
  router.post("/chamados/novo", chamadoNovoPost);
  router.get("/chamados/:id/editar", chamadoEditarGet);
router.post("/chamados/:id/editar", chamadoEditarPost);
router.get("/chamados/:id", usuarioChamadoShowGet);
router.post("/chamados/:id/confirmar", usuarioChamadoConfirmarPost);
router.post("/chamados/:id/reabrir", usuarioChamadoReabrirPost);
router.post("/chamados/:id/interacao", usuarioChamadoInteracaoPost);
  return router;
}
