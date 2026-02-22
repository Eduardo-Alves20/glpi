import { Router } from "express";
import { exigirLogin, exigirUsuarioAtivo, exigirPerfis } from "../../compartilhado/middlewares/seguranca.js";
import { acharPorId } from "../../repos/usuariosRepo.js";

import { tecnicoHomeGet, tecnicoFilaGet, tecnicoAssumirPost, tecnicoResolverPost } from "../../controllers/tecnico/tecnicoController.js";
import { tecnicoChamadoShowGet, tecnicoChamadoSolucaoPost } from "../../controllers/tecnico/chamadosTecnicoController.js";

export function criarTecnicoRotas({ auditoria } = {}) {
  const router = Router();
  const validarAtivo = exigirUsuarioAtivo(acharPorId);

  // ✅ protege tudo que começa com /tecnico
  router.use(
    "/tecnico",
    exigirLogin,
    validarAtivo,
    exigirPerfis(["tecnico", "admin"], { onNegado: auditoria?.registrarTentativaAcessoNegado })
  );

  // home do técnico
  router.get("/tecnico", tecnicoHomeGet);


  // detalhe do chamado (ABRIR)
  router.get("/tecnico/chamados/:id", tecnicoChamadoShowGet);

  // fila
  router.get("/tecnico/chamados", tecnicoFilaGet);
  
  // ações
  router.post("/tecnico/chamados/:id/assumir", tecnicoAssumirPost); // você já tem
  router.post("/tecnico/chamados/:id/resolver", tecnicoResolverPost); // se ainda usa
  router.post("/tecnico/chamados/:id/solucao", tecnicoChamadoSolucaoPost); // novo fluxo

  return router;
}