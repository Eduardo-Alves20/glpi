import { Router } from "express";
import { exigirLogin, exigirUsuarioAtivo, exigirPerfis } from "../../compartilhado/middlewares/seguranca.js";
import { acharPorId } from "../../repos/usuariosRepo.js";
import {
  abrirChamadoGet,
  meusChamadosGet,
  perfilGet,
  usuarioHomeGet,
} from "../../controllers/usuario/portalUsuarioController.js";

export function criarUsuarioRotas({ auditoria } = {}) {
  const router = Router();
  const validarAtivo = exigirUsuarioAtivo(acharPorId);

  const protegerAreaUsuario = [
    exigirLogin,
    validarAtivo,
    exigirPerfis(["usuario", "admin"], {
      onNegado: auditoria?.registrarTentativaAcessoNegado,
    }),
  ];

  router.get("/usuario", ...protegerAreaUsuario, usuarioHomeGet);
  router.get("/chamados/meus", ...protegerAreaUsuario, meusChamadosGet);
  router.get("/chamados/novo", ...protegerAreaUsuario, abrirChamadoGet);
  router.get("/conta/perfil", ...protegerAreaUsuario, perfilGet);

  return router;
}
