import { acharPorUsuarioOuEmail } from "../../repos/usuariosRepo.js";
import { compararSenha } from "../../compartilhado/seguranca/senha.js";

const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";

// ajuste conforme sua rota técnica real:
// - se você criou /tecnico/chamados, use isso
// - se você está usando /tecnico/fila, troque aqui
const TECNICO_HOME = "/tecnico/chamados";

function renderLogin(res, { mensagemErro = "" } = {}) {
  return res.status(mensagemErro ? 400 : 200).render("autenticacao/login", {
    layout: "layout-public",
    titulo: "GLPI",
    bodyClass: "login-layout",
    cssExtra: "/styles/auth.css",
    mensagemErro,
  });
}

// Regenera sessão para evitar session fixation (boa prática)
function regenerarSessao(req) {
  return new Promise((resolve, reject) => {
    if (!req.session) return resolve();
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

export function authGet(req, res) {
  if (req.session?.usuario) return res.redirect("/app");
  return renderLogin(res);
}

export async function authPost(req, res) {
  const login = String(req.body?.username ?? "").trim().toLowerCase();
  const senha = String(req.body?.password ?? "").trim();

  if (!login || !senha) {
    return renderLogin(res, { mensagemErro: "Informe usuário/e-mail e senha." });
  }

  try {
    // 1) Mongo
    const usuario = await acharPorUsuarioOuEmail(login);

    if (usuario) {
      if (usuario.status === "bloqueado") {
        return res.status(403).render("autenticacao/login", {
          layout: "layout-public",
          titulo: "GLPI",
          bodyClass: "login-layout",
          cssExtra: "/styles/auth.css",
          mensagemErro: "Usuário bloqueado. Contate a administração.",
        });
      }

      const ok = await compararSenha(senha, usuario.senhaHash);
      if (!ok) {
        // não diferenciar usuário inexistente x senha errada (evita enumeração)
        return res.status(401).render("autenticacao/login", {
          layout: "layout-public",
          titulo: "GLPI",
          bodyClass: "login-layout",
          cssExtra: "/styles/auth.css",
          mensagemErro: "Usuário ou senha inválidos.",
        });
      }

      // segurança: regenera sessão antes de setar autenticação
      await regenerarSessao(req);

      req.session.usuario = {
        id: String(usuario._id),
        nome: usuario.nome,
        usuario: usuario.usuario,
        perfil: usuario.perfil,
      };

      return res.redirect("/app");
    }

    // 2) Bootstrap (somente DEV)
    const bootstrapOk = login === "admin" && senha === "admin123";
    if (bootstrapOk) {
      if (isProd) {
        return res.status(403).render("autenticacao/login", {
          layout: "layout-public",
          titulo: "GLPI",
          bodyClass: "login-layout",
          cssExtra: "/styles/auth.css",
          mensagemErro: "Login temporário desabilitado em produção.",
        });
      }

      await regenerarSessao(req);

      req.session.usuario = {
        id: "admin-bootstrap",
        nome: "Administrador (Bootstrap)",
        usuario: "admin",
        perfil: "admin",
      };

      return res.redirect("/app");
    }

    // login não encontrado
    return res.status(401).render("autenticacao/login", {
      layout: "layout-public",
      titulo: "GLPI",
      bodyClass: "login-layout",
      cssExtra: "/styles/auth.css",
      mensagemErro: "Usuário ou senha inválidos.",
    });
  } catch (err) {
    console.error("[auth] erro:", err);
    return res.status(500).render("autenticacao/login", {
      layout: "layout-public",
      titulo: "GLPI",
      bodyClass: "login-layout",
      cssExtra: "/styles/auth.css",
      mensagemErro: "Erro interno. Tente novamente.",
    });
  }
}

export function logoutPost(req, res) {
  // boa prática: destruir sessão e limpar cookie
  req.session?.destroy(() => {
    res.clearCookie("glpi.sid");
    res.redirect("/auth");
  });
}

export function appGet(req, res) {
  const perfil = req.session?.usuario?.perfil;
  if (!perfil) return res.redirect("/auth");

  if (perfil === "admin") return res.redirect("/admin");
  if (perfil === "tecnico") return res.redirect(TECNICO_HOME);
  return res.redirect("/usuario");
}