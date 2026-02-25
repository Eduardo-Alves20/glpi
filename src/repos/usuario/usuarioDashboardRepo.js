import {
  contarChamados,
  listarChamados,
} from "../chamados/core/chamadosCoreRepo.js";

const STATUS_LABELS = {
  aberto: "Aberto",
  em_atendimento: "Em andamento",
  aguardando_usuario: "Aguardando usuario",
  fechado: "Fechado",
};

function fmtQuando(data) {
  if (!data) return "-";
  try {
    return new Date(data).toLocaleString("pt-BR");
  } catch {
    return "-";
  }
}

function fmtIso(data) {
  if (!data) return null;
  try {
    return new Date(data).toISOString();
  } catch {
    return null;
  }
}

function toDateSafe(data) {
  const d = data ? new Date(data) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d;
}

function rotuloStatus(status) {
  return STATUS_LABELS[String(status || "").trim()] || String(status || "-");
}

export async function obterUsuarioDashboardData(usuarioId, { limit = 10 } = {}) {
  const solicitanteId = String(usuarioId || "").trim();
  if (!solicitanteId) {
    return {
      kpis: {
        total: 0,
        abertos: 0,
        emAndamento: 0,
        aguardando: 0,
        fechados: 0,
      },
      ultimosMeusChamados: [],
      lastChangeAt: null,
      serverTime: new Date(),
    };
  }

  const lim = Math.max(1, Math.min(Number(limit) || 10, 25));

  const [
    total,
    abertos,
    emAndamento,
    aguardando,
    fechados,
    ultimosRaw,
  ] = await Promise.all([
    contarChamados({ solicitanteId }),
    contarChamados({ solicitanteId, status: "aberto" }),
    contarChamados({ solicitanteId, status: "em_atendimento" }),
    contarChamados({ solicitanteId, status: "aguardando_usuario" }),
    contarChamados({ solicitanteId, status: "fechado" }),
    listarChamados({ solicitanteId, limit: 50 }),
  ]);

  const ordenados = (ultimosRaw || []).slice().sort((a, b) => {
    const da = toDateSafe(a?.updatedAt || a?.createdAt);
    const db = toDateSafe(b?.updatedAt || b?.createdAt);
    const ta = da ? da.getTime() : 0;
    const tb = db ? db.getTime() : 0;
    return tb - ta;
  });

  const ultimosMeusChamados = ordenados.slice(0, lim).map((c) => ({
    id: String(c._id),
    numero: c.numero ?? "-",
    titulo: c.titulo || "(sem titulo)",
    status: String(c.status || "-"),
    statusLabel: rotuloStatus(c.status),
    quando: fmtQuando(c.updatedAt || c.createdAt),
    updatedAt: fmtIso(c.updatedAt || c.createdAt),
  }));

  const lastChangeAt = ultimosMeusChamados[0]?.updatedAt || null;

  return {
    kpis: {
      total,
      abertos,
      emAndamento,
      aguardando,
      fechados,
    },
    ultimosMeusChamados,
    lastChangeAt,
    serverTime: new Date(),
  };
}
