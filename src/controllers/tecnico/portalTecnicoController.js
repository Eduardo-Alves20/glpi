export function tecnicoHomeGet(req, res) {
 return res.render("tecnico/home", {
  layout: "layout-app",
  titulo: "GLPI - Portal do Técnico",
  cssPortal: "/styles/tecnico.css",
  cssExtra: "/styles/tecnico-home.css",
});

}
