export function appGet(req, res) {
  const perfil = req.session?.usuario?.perfil;

  if (perfil === "admin") return res.redirect("/admin");
  if (perfil === "tecnico") return res.redirect("/tecnico");
  if (perfil === "usuario") return res.redirect("/usuario");

  req.session.destroy(() => res.redirect("/auth"));
}
