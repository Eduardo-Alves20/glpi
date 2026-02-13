import { criarAuthRotas } from "./authRotas.js";
import { criarAppRotas } from "./appRotas.js";
import { criarAdminRotas } from "./admin/adminRotas.js";
import { criarTecnicoRotas } from "./tecnico/tecnicoRotas.js";
import { criarUsuarioRotas } from "./usuario/usuarioRotas.js";

export function montarRotas(app, { auditoria } = {}) {
  app.use(criarAuthRotas());
  app.use(criarAppRotas());

  app.use(criarAdminRotas({ auditoria }));
  app.use(criarTecnicoRotas({ auditoria }));
  app.use(criarUsuarioRotas({ auditoria }));

  app.get("/", (req, res) => res.redirect("/auth"));
}
