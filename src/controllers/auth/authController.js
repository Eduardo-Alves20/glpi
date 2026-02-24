import { acharPorUsuarioOuEmail } from "../../repos/usuariosRepo.js";
import { compararSenha } from "../../compartilhado/seguranca/senha.js";
import { registrarEventoSistema } from "../../service/logsService.js";

const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";
const TECNICO_HOME = "/tecnico/home";

function renderLogin(
  res,
  {
    status = 200,
    flash = null,
  } = {},
) {
  return res.status(status).render("autenticacao/login", {
    layout: "layout-public",
    titulo: "GLPI",
    bodyClass: "login-layout",
    cssExtra: "/styles/auth.css",
    flash,
  });
}

function regenerarSessao(req) {
  return new Promise((resolve, reject) => {
    if (!req.session) return resolve();
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function usuarioLogPayload(usuario) {
  if (!usuario) return null;
  return {
    id: String(usuario._id || usuario.id || ""),
    login: String(usuario.usuario || ""),
    nome: String(usuario.nome || ""),
    perfil: String(usuario.perfil || ""),
  };
}

export function authGet(req, res) {
  if (req.session?.usuario) return res.redirect("/app");
  return renderLogin(res);
}

export async function authPost(req, res) {
  const login = String(req.body?.username ?? "").trim().toLowerCase();
  const senha = String(req.body?.password ?? "").trim();

  if (!login || !senha) {
    await registrarEventoSistema({
      req,
      nivel: "warn",
      modulo: "auth",
      evento: "auth.login.input_invalido",
      acao: "login",
      resultado: "erro",
      mensagem: "Tentativa de login sem usuario/senha.",
      meta: { loginInformado: Boolean(login) },
    });
    return renderLogin(res, {
      status: 400,
      flash: { tipo: "error", mensagem: "Informe usuario/e-mail e senha." },
    });
  }

  try {
    const usuario = await acharPorUsuarioOuEmail(login);

    if (usuario) {
      if (usuario.status === "bloqueado") {
        await registrarEventoSistema({
          req,
          nivel: "security",
          modulo: "auth",
          evento: "auth.login.usuario_bloqueado",
          acao: "login",
          resultado: "negado",
          mensagem: "Tentativa de login de usuario bloqueado.",
          usuario: usuarioLogPayload(usuario),
        });
        return renderLogin(res, {
          status: 403,
          flash: {
            tipo: "error",
            mensagem: "Usuario bloqueado. Contate a administracao.",
          },
        });
      }

      const ok = await compararSenha(senha, usuario.senhaHash);
      if (!ok) {
        await registrarEventoSistema({
          req,
          nivel: "warn",
          modulo: "auth",
          evento: "auth.login.credencial_invalida",
          acao: "login",
          resultado: "erro",
          mensagem: "Senha invalida para usuario existente.",
          usuario: usuarioLogPayload(usuario),
        });
        return renderLogin(res, {
          status: 401,
          flash: { tipo: "error", mensagem: "Usuario ou senha invalidos." },
        });
      }

      await regenerarSessao(req);

      req.session.usuario = {
        id: String(usuario._id),
        nome: usuario.nome,
        usuario: usuario.usuario,
        perfil: usuario.perfil,
      };
      req.session.flash = {
        tipo: "success",
        mensagem: "Login realizado com sucesso.",
      };

      await registrarEventoSistema({
        req,
        nivel: "info",
        modulo: "auth",
        evento: "auth.login.sucesso",
        acao: "login",
        resultado: "sucesso",
        mensagem: "Usuario autenticado com sucesso.",
        usuario: usuarioLogPayload(usuario),
      });

      return res.redirect("/app");
    }

    const bootstrapOk = login === "admin" && senha === "admin123";
    if (bootstrapOk) {
      if (isProd) {
        await registrarEventoSistema({
          req,
          nivel: "security",
          modulo: "auth",
          evento: "auth.login.bootstrap_bloqueado",
          acao: "login",
          resultado: "negado",
          mensagem: "Tentativa de login bootstrap em producao.",
        });
        return renderLogin(res, {
          status: 403,
          flash: {
            tipo: "error",
            mensagem: "Login temporario desabilitado em producao.",
          },
        });
      }

      await regenerarSessao(req);

      req.session.usuario = {
        id: "admin-bootstrap",
        nome: "Administrador (Bootstrap)",
        usuario: "admin",
        perfil: "admin",
      };
      req.session.flash = {
        tipo: "success",
        mensagem: "Login realizado com sucesso.",
      };

      await registrarEventoSistema({
        req,
        nivel: "warn",
        modulo: "auth",
        evento: "auth.login.bootstrap_sucesso",
        acao: "login",
        resultado: "sucesso",
        mensagem: "Login bootstrap executado em ambiente de desenvolvimento.",
        usuario: {
          id: "admin-bootstrap",
          login: "admin",
          nome: "Administrador (Bootstrap)",
          perfil: "admin",
        },
      });

      return res.redirect("/app");
    }

    await registrarEventoSistema({
      req,
      nivel: "warn",
      modulo: "auth",
      evento: "auth.login.usuario_nao_encontrado",
      acao: "login",
      resultado: "erro",
      mensagem: "Tentativa de login com usuario/email inexistente.",
      meta: { login: login.slice(0, 80) },
    });
    return renderLogin(res, {
      status: 401,
      flash: { tipo: "error", mensagem: "Usuario ou senha invalidos." },
    });
  } catch (err) {
    console.error("[auth] erro:", err);
    await registrarEventoSistema({
      req,
      nivel: "error",
      modulo: "auth",
      evento: "auth.login.excecao",
      acao: "login",
      resultado: "erro",
      mensagem: "Falha interna durante autenticacao.",
      meta: { erro: String(err?.message || err || "").slice(0, 300) },
    });
    return renderLogin(res, {
      status: 500,
      flash: { tipo: "error", mensagem: "Erro interno. Tente novamente." },
    });
  }
}

export function logoutPost(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  registrarEventoSistema({
    req,
    nivel: "info",
    modulo: "auth",
    evento: "auth.logout",
    acao: "logout",
    resultado: "sucesso",
    mensagem: "Usuario encerrou sessao.",
    usuario: usuarioSessao
      ? {
          id: String(usuarioSessao.id || ""),
          login: String(usuarioSessao.usuario || ""),
          nome: String(usuarioSessao.nome || ""),
          perfil: String(usuarioSessao.perfil || ""),
        }
      : null,
  });

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

