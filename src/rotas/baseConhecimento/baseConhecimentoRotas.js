import { Router } from "express";
import {
  exigirLogin,
  exigirUsuarioAtivo,
  exigirPerfis,
} from "../../compartilhado/middlewares/seguranca.js";
import { acharPorId } from "../../repos/usuariosRepo.js";
import {
  baseConhecimentoIndexGet,
  baseConhecimentoNovoGet,
  baseConhecimentoNovoPost,
  baseConhecimentoShowGet,
} from "../../controllers/baseConhecimento/baseConhecimentoController.js";

export function criarBaseConhecimentoRotas({ auditoria } = {}) {
  const router = Router();
  const validarAtivo = exigirUsuarioAtivo(acharPorId);

  router.use(
    ["/base-conhecimento", "/artigos", "/admin/artigos"],
    exigirLogin,
    validarAtivo,
    exigirPerfis(["usuario", "tecnico", "admin"], {
      onNegado: auditoria?.registrarTentativaAcessoNegado,
    }),
  );

  router.get("/artigos", (req, res) => res.redirect("/base-conhecimento"));
  router.get("/admin/artigos", (req, res) => res.redirect("/base-conhecimento"));
  router.get("/base-conhecimento", baseConhecimentoIndexGet);
  router.get(
    "/base-conhecimento/novo",
    exigirPerfis(["tecnico", "admin"], {
      onNegado: auditoria?.registrarTentativaAcessoNegado,
    }),
    baseConhecimentoNovoGet,
  );
  router.post(
    "/base-conhecimento/novo",
    exigirPerfis(["tecnico", "admin"], {
      onNegado: auditoria?.registrarTentativaAcessoNegado,
    }),
    baseConhecimentoNovoPost,
  );
  router.get("/base-conhecimento/:slug", baseConhecimentoShowGet);

  return router;
}
