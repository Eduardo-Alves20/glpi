import { pegarDb } from "../compartilhado/db/mongo.js";
import { ObjectId } from "mongodb";




function col() {
  return pegarDb().collection("usuarios");
}

function escaparRegex(texto = "") {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizarFiltrosUsuarios(filtros = {}) {
  const q = String(filtros.q || "").trim();
  const perfil = String(filtros.perfil || "").trim().toLowerCase();
  const status = String(filtros.status || "").trim().toLowerCase();

  const query = {};

  if (q) {
    const regex = new RegExp(escaparRegex(q), "i");
    query.$or = [
      { nome: regex },
      { usuario: regex },
      { email: regex },
    ];
  }

  if (["admin", "tecnico", "usuario"].includes(perfil)) {
    query.perfil = perfil;
  }

  if (["ativo", "bloqueado"].includes(status)) {
    query.status = status;
  }

  return query;
}

export async function criarUsuario(doc) {
  const res = await col().insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

export async function acharPorUsuarioOuEmail(loginOuEmail) {
  const q = {
    $or: [
      { usuario: loginOuEmail.toLowerCase() },
      { email: loginOuEmail.toLowerCase() },
    ],
  };
  return col().findOne(q);
}

export async function acharConflitoUsuarioEmail(
  { usuario, email, excluirId } = {},
) {
  const filtros = [];
  const usuarioNorm = String(usuario || "").trim().toLowerCase();
  const emailNorm = String(email || "").trim().toLowerCase();

  if (usuarioNorm) filtros.push({ usuario: usuarioNorm });
  if (emailNorm) filtros.push({ email: emailNorm });
  if (!filtros.length) return null;

  const query = { $or: filtros };
  if (ObjectId.isValid(excluirId)) {
    query._id = { $ne: new ObjectId(excluirId) };
  }

  return col().findOne(query, {
    projection: { _id: 1, usuario: 1, email: 1 },
  });
}

export async function contarPorPerfil(perfil) {
  return col().countDocuments({ perfil });
}

export async function totalUsuarios() {
  return col().countDocuments({});
}

export async function contarUsuariosBloqueados() {
  return col().countDocuments({ status: "bloqueado" });
}

export async function listarRecentes(limit = 5) {
  return col()
    .find({}, { projection: { senhaHash: 0 } })
    .sort({ criadoEm: -1 })
    .limit(limit)
    .toArray();
}

export async function listarUsuariosPaginado({ page = 1, limit = 10 } = {}) {
  return listarUsuariosPaginadoFiltrado({ page, limit, filtros: {} });
}

export async function listarUsuariosPaginadoFiltrado(
  { page = 1, limit = 10, filtros = {} } = {},
) {
  const limitSafe = Math.max(5, Math.min(Number(limit) || 10, 200));
  const pageSolicitada = Math.max(1, Number(page) || 1);
  const query = normalizarFiltrosUsuarios(filtros);

  const total = await col().countDocuments(query);
  const pages = Math.max(1, Math.ceil(total / limitSafe));
  const pageSafe = Math.min(pageSolicitada, pages);
  const skip = (pageSafe - 1) * limitSafe;

  const itens = await col()
    .find(query, { projection: { senhaHash: 0 } })
    .sort({ criadoEm: -1 })
    .skip(skip)
    .limit(limitSafe)
    .toArray();

  return {
    itens,
    total,
    page: pageSafe,
    pages,
    limit: limitSafe,
  };
}

export async function obterUltimoUsuarioCriadoEm() {
  const [doc] = await col()
    .find({}, { projection: { criadoEm: 1, updatedAt: 1, atualizadoEm: 1 } })
    .sort({ criadoEm: -1 })
    .limit(1)
    .toArray();

  const d = doc?.criadoEm || doc?.updatedAt || doc?.atualizadoEm || null;
  return d ? new Date(d) : null;
}

export async function acharPorId(id) {
  if (!ObjectId.isValid(id)) return null;
  return col().findOne({ _id: new ObjectId(id) });
}

export async function acharUsuarioPorIdSeguro(id) {
  if (!ObjectId.isValid(id)) return null;
  return col().findOne(
    { _id: new ObjectId(id) },
    {
      projection: {
        senhaHash: 0,
      },
    },
  );
}

export async function atualizarUsuarioAdmin(usuarioId, dados = {}) {
  if (!ObjectId.isValid(usuarioId)) throw new Error("Usuario invalido.");

  const _id = new ObjectId(usuarioId);
  const usuarioAtual = await acharUsuarioPorIdSeguro(usuarioId);
  if (!usuarioAtual) throw new Error("Usuario nao encontrado.");

  const $set = {};
  if (typeof dados.nome !== "undefined") $set.nome = String(dados.nome || "").trim();
  if (typeof dados.usuario !== "undefined") $set.usuario = String(dados.usuario || "").trim().toLowerCase();
  if (typeof dados.email !== "undefined") $set.email = String(dados.email || "").trim().toLowerCase();
  if (typeof dados.perfil !== "undefined") $set.perfil = String(dados.perfil || "").trim().toLowerCase();
  if (typeof dados.status !== "undefined") $set.status = String(dados.status || "").trim().toLowerCase();
  if (typeof dados.senhaHash !== "undefined" && dados.senhaHash) $set.senhaHash = dados.senhaHash;

  if (!Object.keys($set).length) throw new Error("Nada para atualizar.");

  $set.updatedAt = new Date();
  $set.atualizadoEm = new Date();

  try {
    await col().updateOne({ _id }, { $set });
  } catch (err) {
    if (err?.code === 11000) throw new Error("Ja existe usuario com esse login ou e-mail.");
    throw err;
  }

  return acharUsuarioPorIdSeguro(usuarioId);
}

export async function listarUsuariosPorPerfis(perfis = []) {
  const listaPerfis = Array.isArray(perfis)
    ? perfis.map((p) => String(p || "").trim()).filter(Boolean)
    : [];
  if (!listaPerfis.length) return [];

  return col()
    .find(
      {
        perfil: { $in: listaPerfis },
        status: { $ne: "bloqueado" },
      },
      {
        projection: {
          _id: 1,
          perfil: 1,
          nome: 1,
          usuario: 1,
        },
      },
    )
    .toArray();
}
