import {
  acharUsuarioPorId,
  atualizarPerfilUsuario,
  atualizarSenhaUsuario,
} from "../../repos/usuario/usuariosRepo.js";
import { pegarDb } from "../../compartilhado/db/mongo.js";
import { registrarEventoSistema } from "../../service/logsService.js";

const COL_SESSOES = "sessoes";

function montarValoresPerfil(usuario) {
  return {
    nome: usuario?.nome || "",
    email: usuario?.email || "",
    usuario: usuario?.usuario || "",
    perfil: usuario?.perfil || "",
  };
}

function abrirModalSenhaPorQuery(req) {
  const valor = String(req.query?.senha || "").trim().toLowerCase();
  return valor === "1" || valor === "true";
}

async function invalidarSessoesDoUsuario(usuarioId) {
  const db = pegarDb();
  await db.collection(COL_SESSOES).deleteMany({
    "session.usuario.id": String(usuarioId || "").trim(),
  });
}

export async function perfilGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  const flash = req.session?.flash || null;
  if (req.session) req.session.flash = null;

  const usuario = await acharUsuarioPorId(usuarioSessao.id);
  if (!usuario) return res.redirect("/logout");

  return res.render("usuario/perfil", {
    layout: "layout-app",
    titulo: "Meu perfil",
    cssPortal: "/styles/usuario.css",
    cssExtra: "/styles/usuario-perfil.css",
    usuarioSessao,
    flash,
    erroGeral: null,
    abrirModalSenha: abrirModalSenhaPorQuery(req),
    valores: montarValoresPerfil(usuario),
  });
}

export async function perfilPost(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  const valoresInput = {
    nome: String(req.body?.nome ?? "").trim(),
    email: String(req.body?.email ?? "").trim(),
  };

  try {
    const atualizado = await atualizarPerfilUsuario(usuarioSessao.id, valoresInput);

    await registrarEventoSistema({
      req,
      nivel: "security",
      modulo: "usuario",
      evento: "usuario.perfil.atualizado",
      acao: "atualizar_perfil",
      resultado: "sucesso",
      mensagem: `Perfil atualizado por ${usuarioSessao.usuario}.`,
      alvo: {
        tipo: "usuario",
        id: String(usuarioSessao.id),
        login: String(usuarioSessao.usuario || ""),
      },
      meta: {
        alterouSenha: false,
      },
    });

    req.session.usuario.nome = atualizado?.nome || req.session.usuario.nome;
    req.session.flash = { tipo: "success", mensagem: "Perfil atualizado com sucesso!" };
    return res.redirect("/usuario/perfil");
  } catch (e) {
    await registrarEventoSistema({
      req,
      nivel: "warn",
      modulo: "usuario",
      evento: "usuario.perfil.atualizado",
      acao: "atualizar_perfil",
      resultado: "erro",
      mensagem: e?.message || "Falha ao atualizar perfil.",
      alvo: {
        tipo: "usuario",
        id: String(usuarioSessao.id),
      },
      meta: {
        alterouSenha: false,
      },
    });

    console.error("Erro ao atualizar perfil:", e);
    return res.status(400).render("usuario/perfil", {
      layout: "layout-app",
      titulo: "Meu perfil",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/usuario-perfil.css",
      usuarioSessao,
      flash: { tipo: "error", mensagem: e?.message || "Nao foi possivel atualizar o perfil." },
      erroGeral: e?.message || "Nao foi possivel atualizar o perfil.",
      abrirModalSenha: false,
      valores: {
        ...montarValoresPerfil(usuarioSessao),
        nome: valoresInput.nome,
        email: valoresInput.email,
      },
    });
  }
}

export async function perfilSenhaPost(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  const senhaAtual = String(req.body?.senhaAtual ?? "");
  const senhaNova = String(req.body?.senhaNova ?? "");
  const senhaNovaConfirmacao = String(req.body?.senhaNovaConfirmacao ?? "");

  try {
    if (senhaNova !== senhaNovaConfirmacao) {
      throw new Error("A confirmacao da nova senha nao confere.");
    }

    await atualizarSenhaUsuario(usuarioSessao.id, {
      senhaAtual,
      senhaNova,
    });

    await registrarEventoSistema({
      req,
      nivel: "security",
      modulo: "usuario",
      evento: "usuario.senha.alterada",
      acao: "trocar_senha",
      resultado: "sucesso",
      mensagem: `Senha alterada por ${usuarioSessao.usuario}.`,
      alvo: {
        tipo: "usuario",
        id: String(usuarioSessao.id),
        login: String(usuarioSessao.usuario || ""),
      },
      meta: {
        revogarSessoes: true,
      },
    });

    try {
      await invalidarSessoesDoUsuario(usuarioSessao.id);
    } catch (errSessao) {
      console.error("Erro ao invalidar sessoes do usuario:", errSessao);
    }

    req.session?.destroy(() => {
      res.clearCookie("glpi.sid");
      res.redirect("/auth?reason=senha_alterada");
    });
  } catch (e) {
    await registrarEventoSistema({
      req,
      nivel: "warn",
      modulo: "usuario",
      evento: "usuario.senha.alterada",
      acao: "trocar_senha",
      resultado: "erro",
      mensagem: e?.message || "Falha ao trocar senha.",
      alvo: {
        tipo: "usuario",
        id: String(usuarioSessao.id),
      },
    });

    console.error("Erro ao alterar senha:", e);

    const usuarioAtual = await acharUsuarioPorId(usuarioSessao.id);
    return res.status(400).render("usuario/perfil", {
      layout: "layout-app",
      titulo: "Meu perfil",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/usuario-perfil.css",
      usuarioSessao,
      flash: { tipo: "error", mensagem: e?.message || "Nao foi possivel alterar a senha." },
      erroGeral: e?.message || "Nao foi possivel alterar a senha.",
      abrirModalSenha: true,
      valores: montarValoresPerfil(usuarioAtual || usuarioSessao),
    });
  }
}
