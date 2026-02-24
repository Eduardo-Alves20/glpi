import { obterAdminDashboardData } from "../../repos/admin/adminDashboardRepo.js";
import { listarChamados } from "../../repos/chamados/core/chamadosCoreRepo.js";
import {
  aplicarFiltrosListaChamados,
  lerFiltrosListaChamados,
  obterOpcoesFiltrosChamados,
  rotuloCategoriaChamado,
  rotuloPrioridadeChamado,
  rotuloStatusChamado,
} from "../../service/chamadosListaFiltrosService.js";

function mapearChamadoAdmin(c) {
  return {
    id: String(c._id),
    numero: c.numero,
    titulo: c.titulo,
    categoria: c.categoria || "-",
    categoriaLabel: rotuloCategoriaChamado(c.categoria),
    prioridade: c.prioridade || "-",
    prioridadeLabel: rotuloPrioridadeChamado(c.prioridade),
    status: c.status || "-",
    statusLabel: rotuloStatusChamado(c.status),
    quando: c.createdAt ? new Date(c.createdAt).toLocaleString("pt-BR") : "-",
    solicitante: c?.criadoPor?.login
      ? `${c.criadoPor.nome || ""} (${c.criadoPor.login})`
      : (c?.criadoPor?.nome || "-"),
    responsavel: c.responsavelLogin
      ? `${c.responsavelNome || ""} (${c.responsavelLogin})`
      : "-",
    temResponsavel: Boolean(c.responsavelId),
  };
}

export async function adminHomeGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;

  const { kpis, logs, ultimosChamados, ultimosUsuarios, serverTime } =
    await obterAdminDashboardData();

  return res.render("admin/home", {
    layout: "layout-app",
    titulo: "GLPI - Admin",
    cssPortal: "/styles/admin.css",
    cssExtra: "/styles/admin-home.css",
    usuarioSessao,
    kpis,
    logs,
    ultimosChamados,
    ultimosUsuarios,
    serverTime: new Date(serverTime).toISOString(),
  });
}

export async function adminChamadosGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;

  const flash = req.session?.flash || null;
  if (req.session) req.session.flash = null;

  const filtros = lerFiltrosListaChamados(req.query, {
    limitDefault: 80,
    allowAlocacao: true,
    allowResponsavelLogin: true,
  });
  const opcoes = obterOpcoesFiltrosChamados({ incluirAlocacao: true });

  try {
    const statusConsulta = filtros.status
      ? [filtros.status]
      : ["aberto", "em_atendimento", "aguardando_usuario"];

    const lista = await listarChamados({ status: statusConsulta, limit: 200 });
    const resultado = aplicarFiltrosListaChamados(lista, filtros, {
      usuarioLogin: usuarioSessao?.usuario,
    });

    const chamados = (resultado.itens || []).map((c) => mapearChamadoAdmin(c));

    return res.render("admin/chamados", {
      layout: "layout-app",
      titulo: "Chamados - Admin",
      cssPortal: "/styles/admin.css",
      cssExtra: "/styles/chamados.css",
      jsExtra: "/js/chamados-filters.js",
      usuarioSessao,
      chamados,
      filtros,
      opcoes,
      totalFiltrados: resultado.total,
      totalBase: Array.isArray(lista) ? lista.length : 0,
      erroGeral: null,
      flash,
    });
  } catch (e) {
    console.error("Erro ao carregar chamados do admin:", e);

    return res.status(500).render("admin/chamados", {
      layout: "layout-app",
      titulo: "Chamados - Admin",
      cssPortal: "/styles/admin.css",
      cssExtra: "/styles/chamados.css",
      jsExtra: "/js/chamados-filters.js",
      usuarioSessao,
      chamados: [],
      filtros,
      opcoes,
      totalFiltrados: 0,
      totalBase: 0,
      erroGeral: "Nao foi possivel carregar os chamados.",
      flash: flash || {
        tipo: "error",
        mensagem: "Nao foi possivel carregar os chamados.",
      },
    });
  }
}
