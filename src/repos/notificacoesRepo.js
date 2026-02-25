import { ObjectId } from "mongodb";
import { pegarDb } from "../compartilhado/db/mongo.js";
import { publicarAtualizacaoNotificacoes } from "../service/notificacoesRealtimeService.js";

function oid(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function isDestinoWildcard(destinatario = {}) {
  return String(destinatario?.tipo || "").trim().toLowerCase() === "admin"
    && String(destinatario?.id || "").trim() === "*";
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
  publicarAtualizacaoNotificacoes(doc.destinatario);
  return { ...doc, _id: out.insertedId };
}

function montarFiltroNotificacoes({
  destinatario,
  since,
  unread,
  readState = "all",
  tipo = null,
  tiposIgnorados = [],
} = {}) {
  const filtro = isDestinoWildcard(destinatario)
    ? { "destinatario.tipo": destinatario.tipo }
    : {
        "destinatario.tipo": destinatario.tipo,
        "destinatario.id": destinatario.id,
      };

  if (since) {
    const dataSince = new Date(since);
    if (!Number.isNaN(dataSince.getTime())) {
      filtro.criadoEm = { $gt: dataSince };
    }
  }

  const estadoLida = texto(readState, { max: 20 }).toLowerCase();
  if (estadoLida === "unread" || unread) {
    filtro.lidoEm = null;
  } else if (estadoLida === "read") {
    filtro.lidoEm = { $ne: null };
  }

  const tipoFiltro = texto(tipo, { max: 40 }).toLowerCase();
  const ignorados = Array.isArray(tiposIgnorados)
    ? tiposIgnorados.map((t) => String(t || "").trim().toLowerCase()).filter(Boolean)
    : [];

  if (tipoFiltro) {
    if (ignorados.includes(tipoFiltro)) return { filtro, retornarVazio: true };
    filtro.tipo = tipoFiltro;
  } else if (ignorados.length) {
    filtro.tipo = { $nin: ignorados };
  }

  return { filtro, retornarVazio: false };
}

function normalizarPagina(valor, fallback = 1) {
  const n = Number.parseInt(valor, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function normalizarLimite(valor, fallback = 10) {
  const n = Number.parseInt(valor, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(n, 100));
}

export async function listarNotificacoes({
  destinatario,
  since,
  unread,
  readState = "all",
  tipo = null,
  limit = 20,
  tiposIgnorados = [],
}) {
  const db = await pegarDb();
  const { filtro, retornarVazio } = montarFiltroNotificacoes({
    destinatario,
    since,
    unread,
    readState,
    tipo,
    tiposIgnorados,
  });
  if (retornarVazio) return [];

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

export async function contarNotificacoes({
  destinatario,
  readState = "all",
  tipo = null,
  tiposIgnorados = [],
} = {}) {
  const db = await pegarDb();
  const { filtro, retornarVazio } = montarFiltroNotificacoes({
    destinatario,
    readState,
    tipo,
    tiposIgnorados,
  });
  if (retornarVazio) return 0;

  return db.collection("notificacoes").countDocuments(filtro);
}

export async function listarNotificacoesPaginado({
  destinatario,
  readState = "all",
  tipo = null,
  page = 1,
  limit = 10,
  tiposIgnorados = [],
} = {}) {
  const db = await pegarDb();
  const limitSafe = normalizarLimite(limit, 10);
  const pageSolicitada = normalizarPagina(page, 1);
  const { filtro, retornarVazio } = montarFiltroNotificacoes({
    destinatario,
    readState,
    tipo,
    tiposIgnorados,
  });

  if (retornarVazio) {
    return {
      itens: [],
      total: 0,
      page: 1,
      pages: 1,
      limit: limitSafe,
    };
  }

  const total = await db.collection("notificacoes").countDocuments(filtro);
  const pages = Math.max(1, Math.ceil(total / limitSafe));
  const pageSafe = Math.min(pageSolicitada, pages);
  const skip = (pageSafe - 1) * limitSafe;

  const itens = await db.collection("notificacoes")
    .find(filtro, {
      projection: {
        destinatario: 1, chamadoId: 1, tipo: 1, titulo: 1, mensagem: 1, url: 1,
        criadoEm: 1, lidoEm: 1, meta: 1,
      },
    })
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

export async function contarNaoLidas(destinatario, { tiposIgnorados = [] } = {}) {
  const db = await pegarDb();
  const filtro = isDestinoWildcard(destinatario)
    ? {
        "destinatario.tipo": destinatario.tipo,
        lidoEm: null,
      }
    : {
        "destinatario.tipo": destinatario.tipo,
        "destinatario.id": destinatario.id,
        lidoEm: null,
      };
  if (Array.isArray(tiposIgnorados) && tiposIgnorados.length) {
    filtro.tipo = {
      $nin: tiposIgnorados
        .map((t) => String(t || "").trim().toLowerCase())
        .filter(Boolean),
    };
  }
  return db.collection("notificacoes").countDocuments(filtro);
}

export async function marcarComoLida({ notifId, destinatario }) {
  const db = await pegarDb();
  const _id = oid(notifId);
  if (!_id) return { ok: false, motivo: "id_invalido" };

  const filtroDestino = isDestinoWildcard(destinatario)
    ? { "destinatario.tipo": destinatario.tipo }
    : {
        "destinatario.tipo": destinatario.tipo,
        "destinatario.id": destinatario.id,
      };

  const res = await db.collection("notificacoes").updateOne(
    {
      _id,
      ...filtroDestino,
      lidoEm: null,
    },
    { $set: { lidoEm: new Date() } }
  );

  const ok = res.modifiedCount === 1;
  if (ok) publicarAtualizacaoNotificacoes(destinatario);
  return { ok };
}

export async function marcarTodasComoLidas(destinatario) {
  const db = await pegarDb();
  const filtroDestino = isDestinoWildcard(destinatario)
    ? { "destinatario.tipo": destinatario.tipo }
    : {
        "destinatario.tipo": destinatario.tipo,
        "destinatario.id": destinatario.id,
      };

  const res = await db.collection("notificacoes").updateMany(
    {
      ...filtroDestino,
      lidoEm: null,
    },
    { $set: { lidoEm: new Date() } }
  );
  if (res.modifiedCount > 0) publicarAtualizacaoNotificacoes(destinatario);
  return { ok: true, modified: res.modifiedCount };
}

export async function excluirNotificacoesPorChamadoId(chamadoId) {
  const db = await pegarDb();
  const chamadoIdSan = textoOuNulo(chamadoId, { max: 80 });
  if (!chamadoIdSan) return { ok: false, deleted: 0 };

  const docsDestinatarios = await db.collection("notificacoes")
    .find(
      { chamadoId: chamadoIdSan },
      {
        projection: {
          _id: 0,
          destinatario: 1,
        },
      },
    )
    .toArray();

  const destinatarios = new Map();
  (docsDestinatarios || []).forEach((doc) => {
    const tipo = texto(doc?.destinatario?.tipo, { max: 20 }).toLowerCase();
    const id = texto(doc?.destinatario?.id, { max: 80 });
    if (!tipo || !id) return;
    destinatarios.set(`${tipo}:${id}`, { tipo, id });
  });

  const res = await db.collection("notificacoes").deleteMany({
    chamadoId: chamadoIdSan,
  });

  if (res.deletedCount > 0) {
    for (const destino of destinatarios.values()) {
      publicarAtualizacaoNotificacoes(destino);
    }
  }

  return { ok: true, deleted: Number(res.deletedCount || 0) };
}
