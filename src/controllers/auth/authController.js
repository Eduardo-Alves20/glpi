import { acharPorUsuarioOuEmail } from "../../repos/usuariosRepo.js";
import { compararSenha } from "../../compartilhado/seguranca/senha.js";

export function authGet(req, res) {
  if (req.session?.usuario) return res.redirect("/app");

  return res.render("autenticacao/login", {
    titulo: "GLPI",
    bodyClass: "login-layout",
    cssExtra: "/styles/auth.css",
    mensagemErro: "",
  });
}

export async function authPost(req, res) {
  const login = String(req.body.username || "")
    .trim()
    .toLowerCase();
  const senha = String(req.body.password || "").trim();

  if (!login || !senha) {
    return res.status(400).render("autenticacao/login", {
      titulo: "GLPI",
      bodyClass: "login-layout",
      cssExtra: "/styles/auth.css",
      mensagemErro: "Informe usuário/e-mail e senha.",
    });
  }

  // 1) Mongo
  const usuario = await acharPorUsuarioOuEmail(login);

  if (usuario) {
    if (usuario.status === "bloqueado") {
      return res.status(403).render("autenticacao/login", {
        titulo: "GLPI",
        bodyClass: "login-layout",
        cssExtra: "/styles/auth.css",
        mensagemErro: "Usuário bloqueado. Contate a administração.",
      });
    }

    const ok = await compararSenha(senha, usuario.senhaHash);
    if (!ok) {
      return res.status(401).render("autenticacao/login", {
        titulo: "GLPI",
        bodyClass: "login-layout",
        cssExtra: "/styles/auth.css",
        mensagemErro: "Usuário ou senha inválidos.",
      });
    }

    req.session.usuario = {
      id: String(usuario._id),
      nome: usuario.nome,
      usuario: usuario.usuario,
      perfil: usuario.perfil,
    };

    return res.redirect("/app");
  }

  // 2) Bootstrap (temporário)
  const bootstrapOk = login === "admin" && senha === "admin123";
  if (bootstrapOk) {
    req.session.usuario = {
      id: "admin-bootstrap",
      nome: "Administrador (Bootstrap)",
      usuario: "admin",
      perfil: "admin",
    };
    return res.redirect("/app");
  }

 return res.render("autenticacao/login", {
  layout: "layout-public",
  titulo: "GLPI",
  bodyClass: "login-layout",
  cssExtra: "/styles/auth.css",
  mensagemErro: "",
});

}

export function logoutPost(req, res) {
  req.session.destroy(() => res.redirect("/auth"));
}

export function appGet(req, res) {
  const perfil = req.session.usuario.perfil;

  if (perfil === "admin") return res.redirect("/admin");
  if (perfil === "tecnico") return res.redirect("/tecnico/fila");
  return res.redirect("/usuario");
}
