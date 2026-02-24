import { ObjectId } from "mongodb";
import { pegarDb } from "../compartilhado/db/mongo.js";

function oid(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}
const COL = "notificacoes";
export async function criarNotificacao({
  destinatario,
  destinatarioTipo,
  destinatarioId, // string
  chamadoId,      // string
  tipo,
  titulo,
  mensagem,
  url,
  meta = {},
} = {}) {
  const db = pegarDb();
  const now = new Date();

  const tipoDestino = destinatario?.tipo || destinatarioTipo;
  const idDestino = destinatario?.id || destinatarioId;

  const doc = {
    destinatario: { tipo: tipoDestino, id: String(idDestino) },
    chamadoId: chamadoId ? String(chamadoId) : null,
    tipo,
    titulo,
    mensagem,
    url,
    criadoEm: now,
    lidoEm: null,
    meta,
  };

  await db.collection(COL).insertOne(doc);
  return doc;
}

export async function listarNotificacoes({ destinatario, since, unread, limit = 20 }) {
  const db = await pegarDb();

  const filtro = {
    "destinatario.tipo": destinatario.tipo,
    "destinatario.id": destinatario.id,
  };

  if (since) filtro.criadoEm = { $gt: new Date(since) };
  if (unread) filtro.lidoEm = null;

  return db.collection("notificacoes")
    .find(filtro, {
      projection: {
        destinatario: 1, chamadoId: 1, tipo: 1, titulo: 1, mensagem: 1, url: 1,
        criadoEm: 1, lidoEm: 1, meta: 1
      }
    })
    .sort({ criadoEm: -1 })
    .limit(Math.min(limit, 100))
    .toArray();
}

export async function contarNaoLidas(destinatario) {
  const db = await pegarDb();
  return db.collection("notificacoes").countDocuments({
    "destinatario.tipo": destinatario.tipo,
    "destinatario.id": destinatario.id,
    lidoEm: null,
  });
}

export async function marcarComoLida({ notifId, destinatario }) {
  const db = await pegarDb();
  const _id = oid(notifId);
  if (!_id) return { ok: false, motivo: "id_invalido" };

  const res = await db.collection("notificacoes").updateOne(
    {
      _id,
      "destinatario.tipo": destinatario.tipo,
      "destinatario.id": destinatario.id,
      lidoEm: null,
    },
    { $set: { lidoEm: new Date() } }
  );

  return { ok: res.modifiedCount === 1 };
}

export async function marcarTodasComoLidas(destinatario) {
  const db = await pegarDb();
  const res = await db.collection("notificacoes").updateMany(
    {
      "destinatario.tipo": destinatario.tipo,
      "destinatario.id": destinatario.id,
      lidoEm: null,
    },
    { $set: { lidoEm: new Date() } }
  );
  return { ok: true, modified: res.modifiedCount };
}
