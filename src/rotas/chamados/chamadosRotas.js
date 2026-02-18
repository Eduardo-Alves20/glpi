import { Router } from "express";
import {
  exigirLogin,
  exigirUsuarioAtivo,
  exigirPerfis,
} from "../../compartilhado/middlewares/seguranca.js";
import { acharPorId } from "../../repos/usuariosRepo.js";



import { chamadoNovoGet, chamadoNovoPost, meusChamadosGet } from "../../controllers/chamados/chamadosController.js";

export function criarChamadosRotas({ auditoria } = {}) {
  const router = Router();
  const validarAtivo = exigirUsuarioAtivo(acharPorId);

  // protege tudo em /chamados
  router.use(
    "/chamados",
    exigirLogin,
    validarAtivo,
    exigirPerfis(["usuario", "admin", "tecnico"], {
      onNegado: auditoria?.registrarTentativaAcessoNegado,
    })
  );
router.get("/chamados/meus", meusChamadosGet);
  router.get("/chamados/novo", chamadoNovoGet);
  router.post("/chamados/novo", chamadoNovoPost);

  return router;
}
