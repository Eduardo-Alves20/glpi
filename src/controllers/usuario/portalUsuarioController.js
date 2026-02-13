function nomeUsuario(usuarioSessao) {
  return usuarioSessao?.nome || usuarioSessao?.usuario || "Usuário";
}

export function usuarioHomeGet(req, res) {
  return res.render("usuario/home", {
    layout: "layout-app",
    titulo: "GLPI - Portal do Usuário",
    cssExtra: "/styles/usuario.css",
    nomeUsuario: nomeUsuario(req.session?.usuario),
  });
}

export function meusChamadosGet(req, res) {
  return res.render("chamados/meus", {
    layout: "layout-app",
    titulo: "GLPI - Meus Chamados",
    cssExtra: "/styles/usuario.css",
    chamados: [],
  });
}

export function abrirChamadoGet(req, res) {
  return res.render("chamados/novo", {
    layout: "layout-app",
    titulo: "GLPI - Abrir Chamado",
    cssExtra: "/styles/usuario.css",
  });
}

export function perfilGet(req, res) {
  return res.render("conta/perfil", {
    layout: "layout-app",
    titulo: "GLPI - Meu Perfil",
    cssExtra: "/styles/usuario.css",
    usuario: req.session?.usuario,
  });
}
