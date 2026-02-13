function nomeTecnico(usuarioSessao) {
  return usuarioSessao?.nome || usuarioSessao?.usuario || "Técnico";
}

export function tecnicoHomeGet(req, res) {
  return res.render("tecnico/home", {
    layout: "layout-app",
    titulo: "GLPI - Portal do Técnico",
    cssExtra: "/styles/usuario.css",
    nomeTecnico: nomeTecnico(req.session?.usuario),
  });
}

export function tecnicoFilaGet(req, res) {
  return res.render("tecnico/fila", {
    layout: "layout-app",
    titulo: "GLPI - Fila Técnica",
    cssExtra: "/styles/usuario.css",
  });
}
