import { acharUsuarioPorId, atualizarPerfilUsuario } from "../../repos/usuario/usuariosRepo.js";

export async function perfilGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  const flash = req.session?.flash || null;
  if (req.session) req.session.flash = null;

  const usuario = await acharUsuarioPorId(usuarioSessao.id);
  if (!usuario) return res.redirect("/logout"); // ou /auth

  return res.render("usuario/perfil", {
    layout: "layout-app",
    titulo: "Meu perfil",
    cssPortal: "/styles/usuario.css",
    cssExtra: "/styles/usuario-perfil.css",
    usuarioSessao,
    flash,
    erroGeral: null,
    valores: {
      nome: usuario.nome || "",
      email: usuario.email || "",
      usuario: usuario.usuario || "",
      perfil: usuario.perfil || "",
    },
  });
}

export async function perfilPost(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  const valores = {
  nome: String(req.body?.nome ?? "").trim(),
  email: String(req.body?.email ?? "").trim(),
  senhaAtual: String(req.body?.senhaAtual ?? ""),
  senhaNova: String(req.body?.senhaNova ?? ""),
  senhaNovaConfirmacao: String(req.body?.senhaNovaConfirmacao ?? ""),
};

  try {
    // validação de troca de senha (confirmação)
const querTrocarSenha = valores.senhaNova && valores.senhaNova.length > 0;

if (querTrocarSenha) {
  if (!valores.senhaAtual) throw new Error("Informe a senha atual.");
  if (valores.senhaNova.length < 8) throw new Error("Nova senha deve ter no mínimo 8 caracteres.");
  if (valores.senhaNova !== valores.senhaNovaConfirmacao) {
    throw new Error("A confirmação da nova senha não confere.");
  }
}

// chama o repo somente com o que ele precisa
const atualizado = await atualizarPerfilUsuario(usuarioSessao.id, {
  nome: valores.nome,
  email: valores.email,
  senhaAtual: valores.senhaAtual,
  senhaNova: querTrocarSenha ? valores.senhaNova : "",
});

    // manter sessão coerente (nome pode mudar)
    req.session.usuario.nome = atualizado.nome;

    req.session.flash = { tipo: "success", mensagem: "Perfil atualizado com sucesso!" };
    return res.redirect("/usuario/perfil");
  } catch (e) {
    console.error("Erro ao atualizar perfil:", e);

    return res.status(400).render("usuario/perfil", {
      layout: "layout-app",
      titulo: "Meu perfil",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/usuario-perfil.css",
      usuarioSessao,
      flash: { tipo: "error", mensagem: e?.message || "Não foi possível atualizar o perfil." },
      erroGeral: e?.message || "Não foi possível atualizar o perfil.",
      valores: {
        nome: valores.nome,
        email: valores.email,
        usuario: usuarioSessao.usuario,
        perfil: usuarioSessao.perfil,
      },
    });
  }
}