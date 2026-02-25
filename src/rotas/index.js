import { criarAuthRotas } from "./authRotas.js";
import { criarAppRotas } from "./appRotas.js";
import { criarAdminRotas } from "./admin/adminRotas.js";
import { criarTecnicoRotas } from "./tecnico/tecnicoRotas.js";
import { criarUsuarioRotas } from "./usuario/usuarioRotas.js";
import { criarChamadosRotas } from "./chamados/chamadosRotas.js";
import { criarApiRotas } from "./api/apiRotas.js";
import { criarNotificacoesRotas } from "./notificacoes/notificacoesRotas.js";
import { criarBaseConhecimentoRotas } from "./baseConhecimento/baseConhecimentoRotas.js";

export function montarRotas(app, { auditoria } = {}) {
  app.use(criarAuthRotas());
  app.use(criarAppRotas());

  // ✅ API sempre sob /api
  app.use("/api", criarApiRotas({ auditoria }));

  app.use(criarAdminRotas({ auditoria }));
  app.use(criarTecnicoRotas({ auditoria }));
  app.use(criarUsuarioRotas({ auditoria }));
  app.use(criarChamadosRotas({ auditoria }));
  app.use(criarNotificacoesRotas({ auditoria }));
  app.use(criarBaseConhecimentoRotas({ auditoria }));

  app.get("/", (req, res) => res.redirect("/auth"));
}
