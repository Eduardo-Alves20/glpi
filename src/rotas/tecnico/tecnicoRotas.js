import { Router } from "express";
import {
  exigirLogin,
  exigirUsuarioAtivo,
  exigirPerfis,
} from "../../compartilhado/middlewares/seguranca.js";
import { uploadAnexos } from "../../compartilhado/middlewares/uploadAnexos.js";
import { acharPorId } from "../../repos/usuariosRepo.js";

import {
  tecnicoHomeGet,
  tecnicoMetricasGet,
  tecnicoFilaGet,
  tecnicoAssumirPost,
  tecnicoMeusChamadosGet,
  tecnicoHistoricoChamadosGet,
} from "../../controllers/tecnico/tecnicoController.js";

import {
  tecnicoChamadoShowGet,
  tecnicoChamadoResponsavelPost,
  tecnicoChamadoSolucaoPost,
  tecnicoChamadoInteracaoPost,
  tecnicoChamadoAvaliacaoModerarPost,
  tecnicoChamadoApoioAdicionarPost,
  tecnicoChamadoApoioRemoverPost,
  tecnicoChamadoSeguirNotificacoesPost,
  tecnicoChamadoPararNotificacoesPost,
} from "../../controllers/tecnico/chamadosTecnicoController.js";
import { tecnicoLogsGet } from "../../controllers/admin/logsController.js";
import {
  tecnicoUsuariosIndexGet,
  tecnicoUsuariosNovoGet,
  tecnicoUsuariosCreatePost,
  tecnicoUsuariosEditarGet,
  tecnicoUsuariosEditarPost,
  tecnicoUsuariosSugerirLoginGet,
} from "../../controllers/tecnico/usuariosTecnicoController.js";

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
  router.get("/tecnico/home", tecnicoHomeGet);
  router.get("/tecnico/metricas", tecnicoMetricasGet);

  // fila (coloca antes do :id por clareza; não conflita, mas fica mais legível)
  router.get("/tecnico/chamados", tecnicoFilaGet);

  router.get("/tecnico/meus-chamados", tecnicoMeusChamadosGet);
  router.get("/tecnico/historico-chamados", tecnicoHistoricoChamadosGet);
  router.get("/tecnico/usuarios", tecnicoUsuariosIndexGet);
  router.get("/tecnico/usuarios/novo", tecnicoUsuariosNovoGet);
  router.get("/tecnico/usuarios/:id/editar", tecnicoUsuariosEditarGet);
  router.get("/tecnico/usuarios/sugerir-login", tecnicoUsuariosSugerirLoginGet);
  router.get("/tecnico/logs", tecnicoLogsGet);

  // detalhe do chamado (ABRIR)
  router.get("/tecnico/chamados/:id", tecnicoChamadoShowGet);

  // ações
  router.post("/tecnico/chamados/:id/assumir", tecnicoAssumirPost);
  router.post("/tecnico/chamados/:id/responsavel", tecnicoChamadoResponsavelPost);
  router.post("/tecnico/chamados/:id/apoio/adicionar", tecnicoChamadoApoioAdicionarPost);
  router.post("/tecnico/chamados/:id/apoio/remover", tecnicoChamadoApoioRemoverPost);
  router.post("/tecnico/chamados/:id/notificacoes/seguir", tecnicoChamadoSeguirNotificacoesPost);
  router.post("/tecnico/chamados/:id/notificacoes/parar", tecnicoChamadoPararNotificacoesPost);
  router.post("/tecnico/chamados/:id/avaliacao/moderar", tecnicoChamadoAvaliacaoModerarPost);
  router.post("/tecnico/chamados/:id/solucao", uploadAnexos, tecnicoChamadoSolucaoPost);
  router.post("/tecnico/chamados/:id/interacao", uploadAnexos, tecnicoChamadoInteracaoPost);
  router.post("/tecnico/usuarios", tecnicoUsuariosCreatePost);
  router.post("/tecnico/usuarios/:id/editar", tecnicoUsuariosEditarPost);

  return router;
}
