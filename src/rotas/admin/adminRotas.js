import { Router } from "express";
import {
  exigirLogin,
  exigirPerfis,
  exigirUsuarioAtivo,
} from "../../compartilhado/middlewares/seguranca.js";
import { acharPorId, listarRecentes } from "../../repos/usuariosRepo.js";

import {
  adminChamadosGet,
  adminHomeGet,
} from "../../controllers/admin/adminController.js";
import { adminLogsGet } from "../../controllers/admin/logsController.js";
import {
  usuariosIndexGet,
  usuariosNovoGet,
  usuariosCreatePost,
  usuariosSugerirLoginGet,
} from "../../controllers/admin/usuariosController.js";

export function criarAdminRotas({ auditoria } = {}) {
  const router = Router();

  const validarAtivo = exigirUsuarioAtivo(acharPorId);

  // 🔒 “Gate” do admin: tudo abaixo disso exige admin
  router.use(
    "/admin",
    exigirLogin,
    validarAtivo,
    exigirPerfis(["admin"], {
      onNegado: auditoria?.registrarTentativaAcessoNegado,
    }),
  );

  router.get("/admin", adminHomeGet);
  router.get("/admin/chamados", adminChamadosGet);
  router.get("/admin/logs", adminLogsGet);
  router.get("/admin/usuarios", usuariosIndexGet);
  router.get("/admin/usuarios/novo", usuariosNovoGet);
  router.get("/admin/usuarios/sugerir-login", usuariosSugerirLoginGet);

  router.post("/admin/usuarios", usuariosCreatePost);

  return router;
}
