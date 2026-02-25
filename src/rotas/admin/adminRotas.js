import { Router } from "express";
import {
  exigirLogin,
  exigirPerfis,
  exigirUsuarioAtivo,
} from "../../compartilhado/middlewares/seguranca.js";
import { acharPorId } from "../../repos/usuariosRepo.js";

import {
  adminChamadosGet,
  adminChamadoExcluirPost,
  adminHomeGet,
  adminTecnicosGet,
} from "../../controllers/admin/adminController.js";
import { adminLogsGet } from "../../controllers/admin/logsController.js";
import { adminAvaliacoesGet } from "../../controllers/admin/avaliacoesController.js";
import {
  usuariosIndexGet,
  usuariosNovoGet,
  usuariosCreatePost,
  usuariosEditarGet,
  usuariosEditarPost,
  usuariosSugerirLoginGet,
} from "../../controllers/admin/usuariosController.js";
import {
  categoriasIndexGet,
  categoriasNovoGet,
  categoriasCreatePost,
  categoriasEditarGet,
  categoriasEditarPost,
  categoriasExcluirPost,
} from "../../controllers/admin/categoriasController.js";

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
  router.get("/admin/tecnicos", adminTecnicosGet);
  router.get("/admin/logs", adminLogsGet);
  router.get("/admin/avaliacoes", adminAvaliacoesGet);
  router.get("/admin/usuarios", usuariosIndexGet);
  router.get("/admin/usuarios/novo", usuariosNovoGet);
  router.get("/admin/usuarios/:id/editar", usuariosEditarGet);
  router.get("/admin/usuarios/sugerir-login", usuariosSugerirLoginGet);
  router.get("/admin/categorias", categoriasIndexGet);
  router.get("/admin/categorias/novo", categoriasNovoGet);
  router.get("/admin/categorias/:id/editar", categoriasEditarGet);

  router.post("/admin/usuarios", usuariosCreatePost);
  router.post("/admin/usuarios/:id/editar", usuariosEditarPost);
  router.post("/admin/chamados/:id/excluir", adminChamadoExcluirPost);
  router.post("/admin/categorias", categoriasCreatePost);
  router.post("/admin/categorias/:id/editar", categoriasEditarPost);
  router.post("/admin/categorias/:id/excluir", categoriasExcluirPost);

  return router;
}
