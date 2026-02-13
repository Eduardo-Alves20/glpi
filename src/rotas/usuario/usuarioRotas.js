import { Router } from "express";
import { exigirLogin, exigirUsuarioAtivo, exigirPerfis } from "../../compartilhado/middlewares/seguranca.js";
import { acharPorId } from "../../repos/usuariosRepo.js";
import { usuarioHomeGet } from "../../controllers/usuario/portalUsuarioController.js";

export function criarUsuarioRotas({ auditoria } = {}) {
  const router = Router();

  const validarAtivo = exigirUsuarioAtivo(acharPorId);

  router.use(
    "/usuario",
    exigirLogin,
    validarAtivo,
    exigirPerfis(["usuario", "admin"], {
      onNegado: auditoria?.registrarTentativaAcessoNegado,
    })
  );

  router.get("/usuario", usuarioHomeGet);

  return router;
}
