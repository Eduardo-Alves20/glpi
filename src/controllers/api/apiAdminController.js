import { obterAdminDashboardData } from "../../repos/admin/adminDashboardRepo.js";

function parseSince(req) {
  const raw = String(req.query?.since || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function apiAdminHomeGet(req, res) {
  try {
    const since = parseSince(req);
    const data = await obterAdminDashboardData();
    const marker = data.lastChangeAt ? new Date(data.lastChangeAt) : null;
    const changed = !since || !marker || marker > since;

    return res.json({
      changed,
      serverTime: new Date(data.serverTime || new Date()).toISOString(),
      lastChangeAt: marker ? marker.toISOString() : null,
      kpis: data.kpis || {},
      logs: data.logs || [],
      ultimosChamados: data.ultimosChamados || [],
      ultimosUsuarios: data.ultimosUsuarios || [],
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ changed: false });
  }
}

