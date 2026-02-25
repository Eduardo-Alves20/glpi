// src/controllers/usuario/portalUsuarioController.js
import { obterUsuarioDashboardData } from "../../repos/usuario/usuarioDashboardRepo.js";

export async function usuarioHomeGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  const kpisBase = {
    total: 0,
    abertos: 0,
    emAndamento: 0,
    aguardando: 0,
    fechados: 0,
  };

  try {
    const { kpis, ultimosMeusChamados } = await obterUsuarioDashboardData(
      usuarioSessao.id,
      { limit: 10 },
    );

    return res.render("usuario/home", {
      layout: "layout-app",
      titulo: "GLPI - Portal do Usuario",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/usuario.css",
      jsExtra: "/js/usuario-live.js",
      usuarioSessao,
      kpisUsuario: kpis || kpisBase,
      ultimosMeusChamados: ultimosMeusChamados || [],
      erroGeral: null,
    });
  } catch (err) {
    console.error("Erro ao carregar home do usuario:", err);
    return res.status(500).render("usuario/home", {
      layout: "layout-app",
      titulo: "GLPI - Portal do Usuario",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/usuario.css",
      jsExtra: "/js/usuario-live.js",
      usuarioSessao,
      kpisUsuario: kpisBase,
      ultimosMeusChamados: [],
      erroGeral: "Nao foi possivel carregar os chamados agora.",
    });
  }
}