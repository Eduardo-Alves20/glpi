import { listarLogs, listarOpcoesFiltrosLogs } from "../../repos/logsRepo.js";

function intOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function basePathPorPerfil(perfil = "") {
  return String(perfil || "").toLowerCase() === "tecnico"
    ? "/tecnico/logs"
    : "/admin/logs";
}

function cssPortalPorPerfil(perfil = "") {
  return String(perfil || "").toLowerCase() === "tecnico"
    ? "/styles/usuario.css"
    : "/styles/admin.css";
}

function limpar(v, max = 500) {
  return String(v ?? "").trim().slice(0, max);
}

function serializarMeta(meta) {
  if (!meta || typeof meta !== "object") return "";
  try {
    return JSON.stringify(meta, null, 2).slice(0, 4000);
  } catch {
    return "";
  }
}

function idTexto(v) {
  if (!v) return "";
  try {
    if (typeof v?.toHexString === "function") return String(v.toHexString());
  } catch {}
  return limpar(v, 120);
}

function montarDetalhesLog(log = {}) {
  const alvoId = limpar(log?.alvo?.id, 120);
  const alvoTipo = limpar(log?.alvo?.tipo, 40).toLowerCase();
  const modulo = limpar(log?.modulo, 60).toLowerCase();
  const evento = limpar(log?.evento, 120).toLowerCase();
  const pareceChamado = Boolean(
    alvoId && (
      alvoTipo === "chamado"
      || modulo.includes("chamado")
      || evento.includes("chamado")
    ),
  );

  const loginTentativa = limpar(
    log?.meta?.login
      || log?.meta?.usuario
      || log?.meta?.loginInformado
      || log?.usuario?.login
      || "",
    120,
  );

  return {
    id: idTexto(log?._id),
    criadoEm: log?.criadoEm || null,
    nivel: limpar(log?.nivel, 20),
    modulo: limpar(log?.modulo, 80),
    evento: limpar(log?.evento, 120),
    acao: limpar(log?.acao, 80),
    resultado: limpar(log?.resultado, 20),
    mensagem: limpar(log?.mensagem, 1000),
    usuario: {
      id: limpar(log?.usuario?.id, 120),
      login: limpar(log?.usuario?.login, 120),
      nome: limpar(log?.usuario?.nome, 120),
      perfil: limpar(log?.usuario?.perfil, 40),
    },
    alvo: {
      id: alvoId,
      tipo: limpar(log?.alvo?.tipo, 80),
      numero: limpar(log?.alvo?.numero, 80),
      login: limpar(log?.alvo?.login, 120),
      perfil: limpar(log?.alvo?.perfil, 40),
    },
    req: {
      metodo: limpar(log?.req?.metodo, 20),
      rota: limpar(log?.req?.rota, 300),
      ip: limpar(log?.req?.ip, 120),
      userAgent: limpar(log?.req?.userAgent, 400),
    },
    tags: Array.isArray(log?.tags) ? log.tags.map((t) => limpar(t, 40)).filter(Boolean) : [],
    loginTentativa,
    chamadoUrl: pareceChamado ? `/tecnico/chamados/${encodeURIComponent(alvoId)}` : "",
    meta: serializarMeta(log?.meta),
  };
}

async function logsIndexGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  const perfil = String(usuarioSessao?.perfil || "").toLowerCase();
  const logsBasePath = basePathPorPerfil(perfil);

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
    limit: Math.max(10, Math.min(intOr(req.query?.limit, 10), 200)),
  };

  const [dados, opcoes] = await Promise.all([
    listarLogs(filtros),
    listarOpcoesFiltrosLogs(),
  ]);
  const logsDetalhes = (dados?.itens || []).map((l) => montarDetalhesLog(l));

  return res.render("admin/logs", {
    layout: "layout-app",
    titulo: "Logs do sistema",
    cssExtra: "/styles/admin-logs.css",
    cssPortal: cssPortalPorPerfil(perfil),
    jsExtra: ["/js/admin-logs-filters.js", "/js/admin-logs-details.js"],
    usuarioSessao,
    logsBasePath,
    logsContexto: perfil === "tecnico"
      ? { secaoLabel: "Tecnico", secaoHref: "/tecnico" }
      : { secaoLabel: "Admin", secaoHref: "/admin" },
    filtros,
    opcoes,
    dados,
    logsDetalhes,
  });
}

export async function adminLogsGet(req, res) {
  return logsIndexGet(req, res);
}

export async function tecnicoLogsGet(req, res) {
  return logsIndexGet(req, res);
}
