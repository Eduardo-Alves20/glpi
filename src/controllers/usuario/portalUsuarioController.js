// src/controllers/usuario/portalUsuarioController.js

export function usuarioHomeGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;

  // Defaults para não quebrar o EJS
  const kpisUsuario = {
    total: 0,
    abertos: 0,
    emAndamento: 0,
    aguardando: 0,
    fechados: 0,
  };

  const ultimosMeusChamados = [];

  return res.render("usuario/home", {
    layout: "layout-app",
    titulo: "GLPI - Portal do Usuário",
    cssPortal: "/styles/usuario.css",
    cssExtra: "/styles/usuario.css",

    // ✅ o que o EJS precisa
    usuarioSessao,
    kpisUsuario,
    ultimosMeusChamados,
  });
}
