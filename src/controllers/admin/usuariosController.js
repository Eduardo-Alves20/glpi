import { validarNovoUsuario } from "../../compartilhado/validacao/usuario.js";
import { gerarHashSenha } from "../../compartilhado/seguranca/senha.js";
import {
  criarUsuario,
  acharPorUsuarioOuEmail,
  listarRecentes,
} from "../../repos/usuariosRepo.js";

export async function usuariosIndexGet(req, res) {
  const usuarios = await listarRecentes(50);

  return res.render("admin/usuarios/index", {
    layout: "layout-admin",
    titulo: "GLPI - Usuários",
    ambiente: process.env.AMBIENTE || "LOCAL",
    cssExtra: null,
    req,
    usuarios,
  });
}

export function usuariosNovoGet(req, res) {
  return res.render("admin/usuarios/novo", {
    layout: "layout-admin",
    titulo: "GLPI - Novo Usuário",
    ambiente: process.env.AMBIENTE || "LOCAL",
    cssExtra: null,
    req,
    erros: [],
    valores: {},
  });
}

export async function usuariosCreatePost(req, res) {
  const v = validarNovoUsuario(req.body);

  if (!v.ok) {
    return res.status(400).render("admin/usuarios/novo", {
      layout: "layout-admin",
      titulo: "GLPI - Novo Usuário",
      ambiente: process.env.AMBIENTE || "LOCAL",
      cssExtra: null,
      req,
      erros: v.erros,
      valores: v.valores,
    });
  }

  const senhaTemporaria = String(req.body.senhaTemporaria || "").trim();
  if (!senhaTemporaria || senhaTemporaria.length < 8) {
    return res.status(400).render("admin/usuarios/novo", {
      layout: "layout-admin",
      titulo: "GLPI - Novo Usuário",
      ambiente: process.env.AMBIENTE || "LOCAL",
      cssExtra: null,
      req,
      erros: ["Senha temporária inválida (mínimo 8 caracteres)."],
      valores: v.valores,
    });
  }

  const jaExiste =
    (await acharPorUsuarioOuEmail(v.valores.usuario)) ||
    (await acharPorUsuarioOuEmail(v.valores.email));

  if (jaExiste) {
    return res.status(409).render("admin/usuarios/novo", {
      layout: "layout-admin",
      titulo: "GLPI - Novo Usuário",
      ambiente: process.env.AMBIENTE || "LOCAL",
      cssExtra: null,
      req,
      erros: ["Já existe usuário com esse login ou e-mail."],
      valores: v.valores,
    });
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
