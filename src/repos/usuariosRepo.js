import { pegarDb } from "../compartilhado/db/mongo.js";
import { ObjectId } from "mongodb";




function col() {
  return pegarDb().collection("usuarios");
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

export async function contarPorPerfil(perfil) {
  return col().countDocuments({ perfil });
}

export async function totalUsuarios() {
  return col().countDocuments({});
}

export async function listarRecentes(limit = 5) {
  return col()
    .find({}, { projection: { senhaHash: 0 } })
    .sort({ criadoEm: -1 })
    .limit(limit)
    .toArray();
}

export async function acharPorId(id) {
  if (!ObjectId.isValid(id)) return null;
  return col().findOne({ _id: new ObjectId(id) });
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
