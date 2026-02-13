// src/controllers/usuario/portalUsuarioController.js

export function usuarioHomeGet(req, res) {
return res.render("usuario/home", {
  layout: "layout-app",
  titulo: "GLPI - Portal do Usuário",
  cssPortal: "/styles/usuario.css",
  cssExtra: "/styles/usuario-home.css",
});

}
