import { Router } from "express";
import { exigirLogin, exigirUsuarioAtivo, exigirPerfis } from "../../compartilhado/middlewares/seguranca.js";
import { acharPorId } from "../../repos/usuariosRepo.js";

import {  tecnicoHomeGet, tecnicoFilaGet, tecnicoAssumirPost, tecnicoResolverPost } from "../../controllers/tecnico/tecnicoController.js";

export function criarTecnicoRotas({ auditoria } = {}) {
  const router = Router();
  const validarAtivo = exigirUsuarioAtivo(acharPorId);

  router.use(
    "/tecnico",
    exigirLogin,
    validarAtivo,
    exigirPerfis(["tecnico", "admin"], { onNegado: auditoria?.registrarTentativaAcessoNegado })
  );

  router.get("/tecnico", tecnicoHomeGet);
  router.get("/tecnico/chamados", tecnicoFilaGet);
  router.post("/tecnico/chamados/:id/assumir", tecnicoAssumirPost);
  router.post("/tecnico/chamados/:id/resolver", tecnicoResolverPost);

  return router;
}