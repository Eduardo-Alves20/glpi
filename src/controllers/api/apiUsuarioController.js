import { obterUsuarioDashboardData } from "../../repos/usuario/usuarioDashboardRepo.js";

function parseSince(req) {
  const raw = String(req.query?.since || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function apiUsuarioInboxGet(req, res) {
  try {
    const usuarioSessao = req.session?.usuario;
    if (!usuarioSessao?.id) {
      return res.status(401).json({ changed: false, error: "unauthorized" });
    }

    const since = parseSince(req);
    const data = await obterUsuarioDashboardData(usuarioSessao.id, { limit: 10 });

    const lastChange = data?.lastChangeAt ? new Date(data.lastChangeAt) : null;
    const changed = !since || (!!lastChange && lastChange.getTime() >= since.getTime());

    return res.json({
      changed,
      serverTime: new Date().toISOString(),
      lastChangeAt: data?.lastChangeAt || null,
      kpis: data?.kpis || {
        total: 0,
        abertos: 0,
        emAndamento: 0,
        aguardando: 0,
        fechados: 0,
      },
      meus: (data?.ultimosMeusChamados || []).map((c) => ({
        chamadoId: String(c.id || ""),
        numero: c.numero,
        titulo: c.titulo,
        status: c.status,
        statusLabel: c.statusLabel,
        quando: c.quando,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ changed: false });
  }
}
