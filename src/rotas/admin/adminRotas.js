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
  adminConfigGet,
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
import {
  camposCustomizadosCreatePost,
  camposCustomizadosExcluirPost,
  camposCustomizadosIndexGet,
  camposCustomizadosStatusPost,
} from "../../controllers/admin/camposCustomizadosController.js";

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
  router.get("/admin/config", adminConfigGet);
  router.get("/admin/usuarios", usuariosIndexGet);
  router.get("/admin/usuarios/novo", usuariosNovoGet);
  router.get("/admin/usuarios/:id/editar", usuariosEditarGet);
  router.get("/admin/usuarios/sugerir-login", usuariosSugerirLoginGet);
  router.get("/admin/categorias", categoriasIndexGet);
  router.get("/admin/categorias/novo", categoriasNovoGet);
  router.get("/admin/categorias/:id/editar", categoriasEditarGet);
  router.get("/admin/campos-customizados", camposCustomizadosIndexGet);

  router.post("/admin/usuarios", usuariosCreatePost);
  router.post("/admin/usuarios/:id/editar", usuariosEditarPost);
  router.post("/admin/chamados/:id/excluir", adminChamadoExcluirPost);
  router.post("/admin/categorias", categoriasCreatePost);
  router.post("/admin/categorias/:id/editar", categoriasEditarPost);
  router.post("/admin/categorias/:id/excluir", categoriasExcluirPost);
  router.post("/admin/campos-customizados", camposCustomizadosCreatePost);
  router.post("/admin/campos-customizados/:id/ativo", camposCustomizadosStatusPost);
  router.post("/admin/campos-customizados/:id/excluir", camposCustomizadosExcluirPost);

  return router;
}
