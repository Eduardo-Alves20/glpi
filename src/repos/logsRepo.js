import { pegarDb } from "../compartilhado/db/mongo.js";

const COL_LOGS = "logs_sistema";

const NIVEIS_ALLOWED = ["info", "warn", "error", "security"];
const RESULTADOS_ALLOWED = ["sucesso", "erro", "negado", "parcial", "info"];

function normString(v, { max = 300, fallback = "" } = {}) {
  const s = String(v ?? "").trim();
  if (!s) return fallback;
  return s.slice(0, max);
}

function normNivel(v) {
  const s = normString(v, { max: 20, fallback: "info" }).toLowerCase();
  return NIVEIS_ALLOWED.includes(s) ? s : "info";
}

function normResultado(v) {
  const s = normString(v, { max: 20, fallback: "info" }).toLowerCase();
  return RESULTADOS_ALLOWED.includes(s) ? s : "info";
}

function escapeRegex(input = "") {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sanitizeObject(input, depth = 0) {
  if (!input || typeof input !== "object") return null;
  if (depth > 2) return null;
  if (Array.isArray(input)) {
    return input.slice(0, 30).map((x) => sanitizeObject(x, depth + 1)).filter(Boolean);
  }

  const out = {};
  const entries = Object.entries(input).slice(0, 40);
  for (const [k, v] of entries) {
    const key = normString(k, { max: 80 });
    if (!key) continue;

    if (v === null || typeof v === "undefined") {
      out[key] = null;
      continue;
    }

    if (typeof v === "string") {
      out[key] = v.slice(0, 500);
      continue;
    }
    if (typeof v === "number" || typeof v === "boolean") {
      out[key] = v;
      continue;
    }
    if (v instanceof Date) {
      out[key] = v;
      continue;
    }
    if (typeof v === "object") {
      const nested = sanitizeObject(v, depth + 1);
      if (nested && Object.keys(nested).length) out[key] = nested;
    }
  }
  return out;
}

export async function registrarLog({
  nivel = "info",
  modulo = "sistema",
  evento = "sistema.evento",
  acao = "",
  resultado = "info",
  mensagem = "",
  usuario = null,
  alvo = null,
  req = null,
  tags = [],
  meta = null,
} = {}) {
  const db = pegarDb();
  const now = new Date();

  const doc = {
    nivel: normNivel(nivel),
    modulo: normString(modulo, { max: 60, fallback: "sistema" }).toLowerCase(),
    evento: normString(evento, { max: 120, fallback: "sistema.evento" }).toLowerCase(),
    acao: normString(acao, { max: 100 }),
    resultado: normResultado(resultado),
    mensagem: normString(mensagem, { max: 500 }),
    usuario: sanitizeObject(usuario) || null,
    alvo: sanitizeObject(alvo) || null,
    req: sanitizeObject(req) || null,
    tags: Array.isArray(tags)
      ? tags.map((t) => normString(t, { max: 40 })).filter(Boolean).slice(0, 20)
      : [],
    meta: sanitizeObject(meta),
    criadoEm: now,
  };

  const out = await db.collection(COL_LOGS).insertOne(doc);
  return { ...doc, _id: out.insertedId };
}

export async function listarLogs({
  q = "",
  nivel = "",
  modulo = "",
  evento = "",
  resultado = "",
  usuarioId = "",
  usuarioLogin = "",
  chamadoId = "",
  dataInicio = "",
  dataFim = "",
  page = 1,
  limit = 50,
} = {}) {
  const db = pegarDb();
  const filtro = {};

  const qSan = normString(q, { max: 120 });
  const nivelSan = normString(nivel, { max: 20 }).toLowerCase();
  const moduloSan = normString(modulo, { max: 60 }).toLowerCase();
  const eventoSan = normString(evento, { max: 120 }).toLowerCase();
  const resultadoSan = normString(resultado, { max: 20 }).toLowerCase();
  const usuarioIdSan = normString(usuarioId, { max: 80 });
  const usuarioLoginSan = normString(usuarioLogin, { max: 80 });
  const chamadoIdSan = normString(chamadoId, { max: 80 });

  if (NIVEIS_ALLOWED.includes(nivelSan)) filtro.nivel = nivelSan;
  if (moduloSan) filtro.modulo = moduloSan;
  if (eventoSan) filtro.evento = eventoSan;
  if (RESULTADOS_ALLOWED.includes(resultadoSan)) filtro.resultado = resultadoSan;
  if (usuarioIdSan) filtro["usuario.id"] = usuarioIdSan;
  if (usuarioLoginSan) filtro["usuario.login"] = usuarioLoginSan;
  if (chamadoIdSan) filtro["alvo.id"] = chamadoIdSan;

  const dtIni = toDateOrNull(dataInicio);
  const dtFim = toDateOrNull(dataFim);
  if (dtIni || dtFim) {
    filtro.criadoEm = {};
    if (dtIni) filtro.criadoEm.$gte = dtIni;
    if (dtFim) {
      const fim = new Date(dtFim);
      fim.setHours(23, 59, 59, 999);
      filtro.criadoEm.$lte = fim;
    }
  }

  if (qSan) {
    const rx = new RegExp(escapeRegex(qSan), "i");
    filtro.$or = [
      { evento: rx },
      { mensagem: rx },
      { "usuario.login": rx },
      { "usuario.nome": rx },
      { "alvo.id": rx },
      { "alvo.numero": rx },
    ];
  }

  const lim = Math.max(1, Math.min(Number(limit) || 50, 200));
  const pg = Math.max(1, Number(page) || 1);
  const skip = (pg - 1) * lim;

  const [itens, total] = await Promise.all([
    db
      .collection(COL_LOGS)
      .find(filtro)
      .project({
        nivel: 1,
        modulo: 1,
        evento: 1,
        acao: 1,
        resultado: 1,
        mensagem: 1,
        usuario: 1,
        alvo: 1,
        req: 1,
        tags: 1,
        criadoEm: 1,
      })
      .sort({ criadoEm: -1 })
      .skip(skip)
      .limit(lim)
      .toArray(),
    db.collection(COL_LOGS).countDocuments(filtro),
  ]);

  return {
    itens,
    total,
    page: pg,
    limit: lim,
    pages: Math.max(1, Math.ceil(total / lim)),
  };
}

export async function listarLogsRecentes(limit = 10) {
  const db = pegarDb();
  const lim = Math.max(1, Math.min(Number(limit) || 10, 100));

  return db
    .collection(COL_LOGS)
    .find({})
    .project({
      nivel: 1,
      evento: 1,
      mensagem: 1,
      usuario: 1,
      criadoEm: 1,
      resultado: 1,
    })
    .sort({ criadoEm: -1 })
    .limit(lim)
    .toArray();
}

export async function obterUltimoLogEm() {
  const db = pegarDb();
  const [doc] = await db
    .collection(COL_LOGS)
    .find({}, { projection: { criadoEm: 1 } })
    .sort({ criadoEm: -1 })
    .limit(1)
    .toArray();
  return doc?.criadoEm ? new Date(doc.criadoEm) : null;
}

export async function contarLogs({ since = null, nivel = "", resultado = "" } = {}) {
  const db = pegarDb();
  const filtro = {};

  const dt = toDateOrNull(since);
  if (dt) filtro.criadoEm = { $gte: dt };

  const nivelSan = normString(nivel, { max: 20 }).toLowerCase();
  if (NIVEIS_ALLOWED.includes(nivelSan)) filtro.nivel = nivelSan;

  const resultadoSan = normString(resultado, { max: 20 }).toLowerCase();
  if (RESULTADOS_ALLOWED.includes(resultadoSan)) filtro.resultado = resultadoSan;

  return db.collection(COL_LOGS).countDocuments(filtro);
}

export async function listarOpcoesFiltrosLogs() {
  const db = pegarDb();
  const [eventos, modulos] = await Promise.all([
    db.collection(COL_LOGS).distinct("evento"),
    db.collection(COL_LOGS).distinct("modulo"),
  ]);

  return {
    eventos: (eventos || []).map((e) => String(e || "")).filter(Boolean).sort(),
    modulos: (modulos || []).map((m) => String(m || "")).filter(Boolean).sort(),
    niveis: [...NIVEIS_ALLOWED],
    resultados: [...RESULTADOS_ALLOWED],
  };
}

export async function garantirIndicesLogs() {
  const db = pegarDb();
  await db.collection(COL_LOGS).createIndex({ criadoEm: -1 });
  await db.collection(COL_LOGS).createIndex({ evento: 1, criadoEm: -1 });
  await db.collection(COL_LOGS).createIndex({ modulo: 1, criadoEm: -1 });
  await db.collection(COL_LOGS).createIndex({ "usuario.id": 1, criadoEm: -1 });
  await db.collection(COL_LOGS).createIndex({ "usuario.login": 1, criadoEm: -1 });
  await db.collection(COL_LOGS).createIndex({ "alvo.id": 1, criadoEm: -1 });
  await db.collection(COL_LOGS).createIndex({ nivel: 1, resultado: 1, criadoEm: -1 });
}

