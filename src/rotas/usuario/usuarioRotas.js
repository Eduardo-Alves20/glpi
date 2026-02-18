import { Router } from "express";
import {
  exigirLogin,
  exigirUsuarioAtivo,
  exigirPerfis,
} from "../../compartilhado/middlewares/seguranca.js";

import { acharPorId } from "../../repos/usuariosRepo.js";
import { usuarioHomeGet } from "../../controllers/usuario/portalUsuarioController.js";

export function criarUsuarioRotas({ auditoria } = {}) {
  const router = Router();
  const validarAtivo = exigirUsuarioAtivo(acharPorId);

  // Middlewares + rotas do portal do usuário
  router.use(
    "/usuario",
    exigirLogin,
    validarAtivo,
    exigirPerfis(["usuario", "admin"], {
      onNegado: auditoria?.registrarTentativaAcessoNegado,
    })
  );

  // ✅ garante que /usuario exista
  router.get("/usuario", usuarioHomeGet);
  router.get("/usuario/", usuarioHomeGet);

  // opcional: rota alternativa
  router.get("/usuario/home", usuarioHomeGet);

  return router;
}
