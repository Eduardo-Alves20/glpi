import { Router } from "express";
import {
  exigirLogin,
  exigirUsuarioAtivo,
  exigirPerfis,
} from "../../compartilhado/middlewares/seguranca.js";
import { acharPorId } from "../../repos/usuariosRepo.js";

import {
  tecnicoHomeGet,
  tecnicoFilaGet,
  tecnicoAssumirPost,
} from "../../controllers/tecnico/tecnicoController.js";

import {
  tecnicoChamadoShowGet,
  tecnicoChamadoSolucaoPost,
  tecnicoChamadoInteracaoPost,
} from "../../controllers/tecnico/chamadosTecnicoController.js";

export function criarTecnicoRotas({ auditoria } = {}) {
  const router = Router();
  const validarAtivo = exigirUsuarioAtivo(acharPorId);

  // ✅ protege tudo que começa com /tecnico
  router.use(
    "/tecnico",
    exigirLogin,
    validarAtivo,
    exigirPerfis(["tecnico", "admin"], {
      onNegado: auditoria?.registrarTentativaAcessoNegado,
    })
  );

  // home do técnico
  router.get("/tecnico", tecnicoHomeGet);

  // fila (coloca antes do :id por clareza; não conflita, mas fica mais legível)
  router.get("/tecnico/chamados", tecnicoFilaGet);

  // detalhe do chamado (ABRIR)
  router.get("/tecnico/chamados/:id", tecnicoChamadoShowGet);

  // ações
  router.post("/tecnico/chamados/:id/assumir", tecnicoAssumirPost);
  router.post("/tecnico/chamados/:id/solucao", tecnicoChamadoSolucaoPost);
  router.post("/tecnico/chamados/:id/interacao", tecnicoChamadoInteracaoPost);

  return router;
}