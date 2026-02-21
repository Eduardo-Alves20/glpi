import { validarNovoUsuario } from "../../compartilhado/validacao/usuario.js";
import { gerarHashSenha } from "../../compartilhado/seguranca/senha.js";
import {
  criarUsuario,
  acharPorUsuarioOuEmail,
  listarRecentes,
} from "../../repos/usuariosRepo.js";
import { sugerirLoginsDisponiveis } from "../../compartilhado/usuario/sugestaoLogin.js";

/**
 * Base de view para telas de admin (mantém seu layout atual)
 * OBS: estou mantendo exatamente seus CSS atuais pra não quebrar nada.
 */
function viewBaseAdmin(req, extra = {}) {
  return {
    layout: "layout-app.ejs",
    ambiente: process.env.AMBIENTE || "LOCAL",
    cssPortal: "/styles/usuario.css",
    cssExtra: "/styles/usuario-perfil.css",
    req,
    ...extra,
  };
}

/**
 * Base de view específica da tela "Novo Usuário"
 * (garante jsExtra sempre)
 */
function viewBaseNovoUsuario(req, extra = {}) {
  return viewBaseAdmin(req, {
    titulo: "GLPI - Novo Usuário",
    jsExtra: ["/js/usuarios-novo.js"],
    ...extra,
  });
}

export async function usuariosIndexGet(req, res) {
  const usuarios = await listarRecentes(50);

  return res.render(
    "admin/usuarios/index",
    viewBaseAdmin(req, {
      titulo: "GLPI - Usuários",
      usuarios,
      // jsExtra removido aqui pra não carregar script desnecessário
    })
  );
}

export function usuariosNovoGet(req, res) {
  return res.render(
    "admin/usuarios/novo",
    viewBaseNovoUsuario(req, {
      erros: [],
      valores: {},
    })
  );
}

export async function usuariosCreatePost(req, res) {
  const v = validarNovoUsuario(req.body);

  if (!v.ok) {
    return res.status(400).render(
      "admin/usuarios/novo",
      viewBaseNovoUsuario(req, {
        erros: v.erros,
        valores: v.valores,
      })
    );
  }

  const senhaTemporaria = String(req.body.senhaTemporaria || "").trim();
  if (!senhaTemporaria || senhaTemporaria.length < 8) {
    return res.status(400).render(
      "admin/usuarios/novo",
      viewBaseNovoUsuario(req, {
        erros: ["Senha temporária inválida (mínimo 8 caracteres)."],
        valores: v.valores,
      })
    );
  }

  const jaExiste =
    (await acharPorUsuarioOuEmail(v.valores.usuario)) ||
    (await acharPorUsuarioOuEmail(v.valores.email));

  if (jaExiste) {
    return res.status(409).render(
      "admin/usuarios/novo",
      viewBaseNovoUsuario(req, {
        erros: ["Já existe usuário com esse login ou e-mail."],
        valores: v.valores,
      })
    );
  }

  const senhaHash = await gerarHashSenha(senhaTemporaria);

  const doc = {
    nome: v.valores.nome,
    usuario: v.valores.usuario,
    email: v.valores.email,
    perfil: v.valores.perfil,
    status: v.valores.status,
    senhaHash,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  };

  await criarUsuario(doc);

  return res.redirect("/admin/usuarios");
}

export async function usuariosSugerirLoginGet(req, res) {
  const nome = String(req.query.nome || "").trim();
  if (!nome) return res.json({ ok: false, sugestoes: [] });

  const sugestoes = await sugerirLoginsDisponiveis(nome, 5);
  return res.json({ ok: true, sugestoes });
}