import { listarLogs, listarOpcoesFiltrosLogs } from "../../repos/logsRepo.js";

function intOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function adminLogsGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;

  const filtros = {
    q: String(req.query?.q || "").trim(),
    nivel: String(req.query?.nivel || "").trim().toLowerCase(),
    modulo: String(req.query?.modulo || "").trim().toLowerCase(),
    evento: String(req.query?.evento || "").trim().toLowerCase(),
    resultado: String(req.query?.resultado || "").trim().toLowerCase(),
    usuarioId: String(req.query?.usuarioId || "").trim(),
    usuarioLogin: String(req.query?.usuarioLogin || "").trim(),
    chamadoId: String(req.query?.chamadoId || "").trim(),
    dataInicio: String(req.query?.dataInicio || "").trim(),
    dataFim: String(req.query?.dataFim || "").trim(),
    page: Math.max(1, intOr(req.query?.page, 1)),
    limit: Math.max(10, Math.min(intOr(req.query?.limit, 50), 200)),
  };

  const [dados, opcoes] = await Promise.all([
    listarLogs(filtros),
    listarOpcoesFiltrosLogs(),
  ]);

  return res.render("admin/logs", {
    layout: "layout-app",
    titulo: "Logs do sistema",
    cssExtra: "/styles/admin-logs.css",
    cssPortal: "/styles/admin.css",
    jsExtra: "/js/admin-logs-filters.js",
    usuarioSessao,
    filtros,
    opcoes,
    dados,
  });
}
