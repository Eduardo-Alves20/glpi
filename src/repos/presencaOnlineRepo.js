import { pegarDb } from "../compartilhado/db/mongo.js";

const COL = "presenca_online";

function intEnv(name, fallback, { min = 1, max = 864000 } = {}) {
  const raw = Number.parseInt(String(process.env[name] || "").trim(), 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(raw, max));
}

function perfilNormalizado(perfil = "") {
  const p = String(perfil || "").trim().toLowerCase();
  if (p === "usuario" || p === "tecnico" || p === "admin") return p;
  return "";
}

function janelaOnlineNormalizada(janelaSegundos = null) {
  if (janelaSegundos && Number.isFinite(Number(janelaSegundos))) {
    return Math.max(10, Math.min(Number(janelaSegundos), 600));
  }
  return intEnv("ONLINE_WINDOW_SECONDS", 90, { min: 10, max: 600 });
}

export async function tocarPresencaOnline({
  usuarioId,
  perfil,
  nome = "",
  login = "",
} = {}) {
  const id = String(usuarioId || "").trim();
  const perfilSan = perfilNormalizado(perfil);
  if (!id || !perfilSan) return false;

  const db = pegarDb();
  const now = new Date();

  await db.collection(COL).updateOne(
    { usuarioId: id, perfil: perfilSan },
    {
      $set: {
        nome: String(nome || "").trim(),
        login: String(login || "").trim().toLowerCase(),
        lastSeenAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true },
  );

  return true;
}

export async function removerPresencaOnline({ usuarioId, perfil } = {}) {
  const id = String(usuarioId || "").trim();
  const perfilSan = perfilNormalizado(perfil);
  if (!id || !perfilSan) return false;

  const db = pegarDb();
  await db.collection(COL).deleteOne({ usuarioId: id, perfil: perfilSan });
  return true;
}

export async function obterResumoPresencaOnline({ janelaSegundos = null } = {}) {
  const db = pegarDb();
  const janela = janelaOnlineNormalizada(janelaSegundos);
  const corte = new Date(Date.now() - (janela * 1000));

  const rows = await db.collection(COL).aggregate([
    { $match: { lastSeenAt: { $gte: corte } } },
    { $group: { _id: "$perfil", total: { $sum: 1 } } },
  ]).toArray();

  const porPerfil = {
    usuario: 0,
    tecnico: 0,
    admin: 0,
  };

  for (const row of rows || []) {
    const p = perfilNormalizado(row?._id);
    if (!p) continue;
    porPerfil[p] = Number(row?.total || 0);
  }

  return {
    janelaSegundos: janela,
    serverNow: new Date().toISOString(),
    usuariosOnline: porPerfil.usuario,
    tecnicosOnline: porPerfil.tecnico + porPerfil.admin,
    adminsOnline: porPerfil.admin,
    totalOnline: porPerfil.usuario + porPerfil.tecnico + porPerfil.admin,
  };
}

function grupoNormalizado(grupo = "") {
  const g = String(grupo || "").trim().toLowerCase();
  if (g === "usuario" || g === "usuarios") return "usuario";
  if (g === "tecnico" || g === "tecnicos" || g === "tecnico_admin") return "tecnico";
  if (g === "todos" || g === "all") return "todos";
  return "";
}

export async function listarPresencaOnline({
  grupo = "usuario",
  janelaSegundos = null,
  limit = 200,
} = {}) {
  const grupoSan = grupoNormalizado(grupo) || "usuario";
  const perfis = grupoSan === "tecnico"
    ? ["tecnico", "admin"]
    : (grupoSan === "todos" ? ["usuario", "tecnico", "admin"] : ["usuario"]);
  const janela = janelaOnlineNormalizada(janelaSegundos);
  const nowMs = Date.now();
  const corte = new Date(nowMs - (janela * 1000));
  const limitSan = Math.max(1, Math.min(Number(limit) || 200, 500));
  const db = pegarDb();

  const rows = await db.collection(COL)
    .find({
      perfil: { $in: perfis },
      lastSeenAt: { $gte: corte },
    })
    .project({
      _id: 0,
      usuarioId: 1,
      perfil: 1,
      nome: 1,
      login: 1,
      createdAt: 1,
      lastSeenAt: 1,
    })
    .sort({ lastSeenAt: -1, createdAt: 1 })
    .limit(limitSan)
    .toArray();

  const itens = (rows || []).map((row) => {
    const createdAtMs = Date.parse(String(row?.createdAt || ""));
    const lastSeenAtMs = Date.parse(String(row?.lastSeenAt || ""));
    const tempoSessaoSegundos = Number.isFinite(createdAtMs)
      ? Math.max(0, Math.floor((nowMs - createdAtMs) / 1000))
      : null;
    const tempoInativoSegundos = Number.isFinite(lastSeenAtMs)
      ? Math.max(0, Math.floor((nowMs - lastSeenAtMs) / 1000))
      : null;

    return {
      usuarioId: String(row?.usuarioId || ""),
      perfil: perfilNormalizado(row?.perfil),
      nome: String(row?.nome || "").trim(),
      login: String(row?.login || "").trim().toLowerCase(),
      sessaoIniciadaEm: Number.isFinite(createdAtMs) ? new Date(createdAtMs).toISOString() : null,
      ultimaAtividadeEm: Number.isFinite(lastSeenAtMs) ? new Date(lastSeenAtMs).toISOString() : null,
      tempoSessaoSegundos,
      tempoInativoSegundos,
    };
  });

  return {
    grupo: grupoSan,
    janelaSegundos: janela,
    serverNow: new Date(nowMs).toISOString(),
    total: itens.length,
    itens,
  };
}

export async function garantirIndicesPresencaOnline() {
  const db = pegarDb();
  const ttlSegundos = intEnv("ONLINE_TTL_SECONDS", 7200, { min: 60, max: 864000 });

  await db.collection(COL).createIndex({ usuarioId: 1, perfil: 1 }, { unique: true });
  await db.collection(COL).createIndex({ lastSeenAt: -1 });
  await db.collection(COL).createIndex({ perfil: 1, lastSeenAt: -1 });
  await db.collection(COL).createIndex({ lastSeenAt: 1 }, { expireAfterSeconds: ttlSegundos });
}
