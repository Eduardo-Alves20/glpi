import { Router } from "express";
import { exigirLogin, exigirUsuarioAtivo, exigirPerfis } from "../../compartilhado/middlewares/seguranca.js";
import { acharPorId } from "../../repos/usuariosRepo.js";
import { tecnicoFilaGet, tecnicoHomeGet } from "../../controllers/tecnico/portalTecnicoController.js";

export function criarTecnicoRotas({ auditoria } = {}) {
  const router = Router();
  const validarAtivo = exigirUsuarioAtivo(acharPorId);

  router.use(
    "/tecnico",
    exigirLogin,
    validarAtivo,
    exigirPerfis(["tecnico", "admin"], {
      onNegado: auditoria?.registrarTentativaAcessoNegado,
    })
  );

  router.get("/tecnico", tecnicoHomeGet);
  router.get("/tecnico/fila", tecnicoFilaGet);

  return router;
}
