import { ObjectId } from "mongodb";
import { pegarDb } from "../compartilhado/db/mongo.js";

function oid(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

const DESTINATARIOS_VALIDOS = new Set(["usuario", "tecnico", "admin"]);
const TIPOS_VALIDOS = new Set([
  "nova_mensagem",
  "nova_solucao",
  "mudou_status",
  "novo_chamado_fila",
  "atribuido",
]);

function texto(v, { max = 200, fallback = "" } = {}) {
  const s = String(v ?? "").trim();
  return (s || fallback).slice(0, max);
}

function textoOuNulo(v, { max = 200 } = {}) {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
}

function metaSegura(input, depth = 0) {
  if (!input || typeof input !== "object") return null;
  if (depth > 2) return null;

  if (Array.isArray(input)) {
    return input
      .slice(0, 20)
      .map((item) => {
        if (item === null || typeof item === "undefined") return null;
        if (typeof item === "string") return item.slice(0, 200);
        if (typeof item === "number" || typeof item === "boolean") return item;
        if (typeof item === "object") return metaSegura(item, depth + 1);
        return null;
      })
      .filter((item) => item !== null);
  }

  const out = {};
  for (const [k, v] of Object.entries(input).slice(0, 40)) {
    const chave = texto(k, { max: 80 });
    if (!chave) continue;

    if (v === null || typeof v === "undefined") {
      out[chave] = null;
      continue;
    }

    if (typeof v === "string") {
      out[chave] = v.slice(0, 500);
      continue;
    }

    if (typeof v === "number" || typeof v === "boolean") {
      out[chave] = v;
      continue;
    }

    if (typeof v === "object") {
      const nested = metaSegura(v, depth + 1);
      if (nested !== null) out[chave] = nested;
    }
  }

  return Object.keys(out).length ? out : null;
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

  const tipoDestino = texto(destinatario?.tipo || destinatarioTipo, { max: 20 }).toLowerCase();
  const idDestino = texto(destinatario?.id || destinatarioId, { max: 80 });
  const tipoSan = texto(tipo, { max: 40 }).toLowerCase();

  if (!DESTINATARIOS_VALIDOS.has(tipoDestino)) {
    throw new Error("Destinatario de notificacao invalido.");
  }
  if (!idDestino) {
    throw new Error("Destinatario de notificacao sem id.");
  }
  if (!TIPOS_VALIDOS.has(tipoSan)) {
    throw new Error(`Tipo de notificacao invalido: ${tipoSan || "(vazio)"}`);
  }

  const doc = {
    destinatario: { tipo: tipoDestino, id: idDestino },
    chamadoId: textoOuNulo(chamadoId, { max: 80 }),
    tipo: tipoSan,
    titulo: texto(titulo, { max: 140, fallback: "Notificacao" }),
    mensagem: textoOuNulo(mensagem, { max: 1000 }),
    url: texto(url, { max: 300, fallback: "/app" }),
    criadoEm: now,
    lidoEm: null,
    meta: metaSegura(meta),
  };

  const out = await db.collection(COL).insertOne(doc);
  return { ...doc, _id: out.insertedId };
}

export async function listarNotificacoes({
  destinatario,
  since,
  unread,
  limit = 20,
  tiposIgnorados = [],
}) {
  const db = await pegarDb();

  const filtro = {
    "destinatario.tipo": destinatario.tipo,
    "destinatario.id": destinatario.id,
  };

  if (since) filtro.criadoEm = { $gt: new Date(since) };
  if (unread) filtro.lidoEm = null;
  if (Array.isArray(tiposIgnorados) && tiposIgnorados.length) {
    filtro.tipo = { $nin: tiposIgnorados.map((t) => String(t || "").trim()).filter(Boolean) };
  }

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

export async function contarNaoLidas(destinatario, { tiposIgnorados = [] } = {}) {
  const db = await pegarDb();
  const filtro = {
    "destinatario.tipo": destinatario.tipo,
    "destinatario.id": destinatario.id,
    lidoEm: null,
  };
  if (Array.isArray(tiposIgnorados) && tiposIgnorados.length) {
    filtro.tipo = { $nin: tiposIgnorados.map((t) => String(t || "").trim()).filter(Boolean) };
  }
  return db.collection("notificacoes").countDocuments(filtro);
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
