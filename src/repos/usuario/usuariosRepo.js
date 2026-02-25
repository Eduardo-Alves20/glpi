import { ObjectId } from "mongodb";
import { pegarDb } from "../../compartilhado/db/mongo.js";
import { compararSenha, gerarHashSenha } from "../../compartilhado/seguranca/senha.js";
import {
  nomePessoa,
  email as emailVal,
  senha as senhaVal,
} from "../../compartilhado/validacao/campos.js";

const COL_USUARIOS = "usuarios";

function toObjectId(usuarioId) {
  const raw = String(usuarioId || "").trim();
  if (!ObjectId.isValid(raw)) return null;
  return new ObjectId(raw);
}

async function carregarUsuario(db, _id) {
  return db.collection(COL_USUARIOS).findOne(
    { _id },
    {
      projection: {
        nome: 1,
        email: 1,
        usuario: 1,
        perfil: 1,
        status: 1,
        senhaHash: 1,
      },
    },
  );
}

function validarUsuarioAtivo(usuario) {
  if (!usuario) throw new Error("Usuario nao encontrado.");
  if (usuario.status === "bloqueado") throw new Error("Usuario bloqueado.");
}

async function carregarUsuarioSeguro(db, _id) {
  return db.collection(COL_USUARIOS).findOne(
    { _id },
    {
      projection: {
        nome: 1,
        email: 1,
        usuario: 1,
        perfil: 1,
        status: 1,
      },
    },
  );
}

export async function acharUsuarioPorId(usuarioId) {
  const db = pegarDb();
  const _id = toObjectId(usuarioId);
  if (!_id) return null;
  return carregarUsuarioSeguro(db, _id);
}

export async function atualizarPerfilUsuario(usuarioId, { nome, email } = {}) {
  const db = pegarDb();
  const _id = toObjectId(usuarioId);
  if (!_id) throw new Error("Usuario invalido.");

  const usuario = await carregarUsuario(db, _id);
  validarUsuarioAtivo(usuario);

  const $set = {};
  if (typeof nome !== "undefined") $set.nome = nomePessoa(nome);
  if (typeof email !== "undefined") $set.email = emailVal(email);
  if (!Object.keys($set).length) throw new Error("Nada para atualizar.");

  $set.updatedAt = new Date();

  try {
    await db.collection(COL_USUARIOS).updateOne({ _id }, { $set });
  } catch (err) {
    if (err?.code === 11000) throw new Error("E-mail ja esta em uso.");
    throw err;
  }

  return carregarUsuarioSeguro(db, _id);
}

export async function atualizarSenhaUsuario(
  usuarioId,
  { senhaAtual, senhaNova } = {},
) {
  const db = pegarDb();
  const _id = toObjectId(usuarioId);
  if (!_id) throw new Error("Usuario invalido.");

  const usuario = await carregarUsuario(db, _id);
  validarUsuarioAtivo(usuario);

  const senhaAtualSan = String(senhaAtual || "");
  const senhaNovaSan = senhaVal(senhaNova);

  if (!senhaAtualSan) throw new Error("Informe a senha atual.");

  const ok = await compararSenha(senhaAtualSan, usuario.senhaHash);
  if (!ok) throw new Error("Senha atual incorreta.");

  const senhaHash = await gerarHashSenha(senhaNovaSan);

  await db.collection(COL_USUARIOS).updateOne(
    { _id },
    {
      $set: {
        senhaHash,
        updatedAt: new Date(),
      },
    },
  );

  return carregarUsuarioSeguro(db, _id);
}