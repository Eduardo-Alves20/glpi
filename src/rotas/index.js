import { criarAuthRotas } from "./authRotas.js";
import { criarAppRotas } from "./appRotas.js";
import { criarAdminRotas } from "./admin/adminRotas.js";
import { criarTecnicoRotas } from "./tecnico/tecnicoRotas.js";
import { criarUsuarioRotas } from "./usuario/usuarioRotas.js";
import { criarChamadosRotas } from "./chamados/chamadosRotas.js"; 

// ✅ novo

export function montarRotas(app, { auditoria } = {}) {
  app.use(criarAuthRotas());
  app.use(criarAppRotas());

  app.use(criarAdminRotas({ auditoria }));
  app.use(criarTecnicoRotas({ auditoria }));
  app.use(criarUsuarioRotas({ auditoria }));
  app.use(criarChamadosRotas({ auditoria })); // ✅ novo

  app.get("/", (req, res) => res.redirect("/auth"));
}
