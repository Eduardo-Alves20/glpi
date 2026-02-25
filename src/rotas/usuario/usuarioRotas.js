import { Router } from "express";
import {
  exigirLogin,
  exigirUsuarioAtivo,
  exigirPerfis,
} from "../../compartilhado/middlewares/seguranca.js";

import { acharPorId } from "../../repos/usuariosRepo.js";
import { usuarioHomeGet } from "../../controllers/usuario/portalUsuarioController.js";
import {
  perfilGet,
  perfilPost,
  perfilSenhaPost,
} from "../../controllers/usuario/perfilController.js";
import { usuarioAvaliacoesGet } from "../../controllers/usuario/avaliacoesController.js";


export function criarUsuarioRotas({ auditoria } = {}) {
  const router = Router();
  const validarAtivo = exigirUsuarioAtivo(acharPorId);

  // Middlewares + rotas do portal do usuário
  router.use(
    "/usuario",
    exigirLogin,
    validarAtivo,
    exigirPerfis(["usuario", "admin","tecnico"], {
      onNegado: auditoria?.registrarTentativaAcessoNegado,
    })
  );

  // ✅ garante que /usuario exista
  router.get("/usuario", usuarioHomeGet);
  router.get("/usuario/", usuarioHomeGet);

  // opcional: rota alternativa
  router.get("/usuario/home", usuarioHomeGet);

  router.get("/usuario/perfil", perfilGet);
  router.get("/usuario/avaliacoes", usuarioAvaliacoesGet);
  router.post("/usuario/perfil", perfilPost);
  router.post("/usuario/perfil/senha", perfilSenhaPost);

  return router;
}
