import { Router } from "express";
import { exigirLogin, exigirUsuarioAtivo } from "../compartilhado/middlewares/seguranca.js";
import { acharPorId } from "../repos/usuariosRepo.js";
import { appGet } from "../controllers/app/roteamentoAppController.js";

export function criarAppRotas() {
  const router = Router();

  const validarAtivo = exigirUsuarioAtivo(acharPorId);

  // Pós-login: decide destino por perfil
  router.get("/app", exigirLogin, validarAtivo, appGet);

  return router;
}
