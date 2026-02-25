import { obterAdminDashboardData } from "../../repos/admin/adminDashboardRepo.js";
import {
  lerFiltrosAdminTecnicos,
  obterDashboardTecnicosAdmin,
  opcoesAdminTecnicos,
} from "../../repos/admin/adminTecnicosDashboardRepo.js";
import { listarChamados } from "../../repos/chamados/core/chamadosCoreRepo.js";
import { obterClassificacoesAtivasChamados } from "../../repos/chamados/classificacoesChamadosRepo.js";
import {
  aplicarFiltrosListaChamados,
  lerFiltrosListaChamados,
  obterOpcoesFiltrosChamados,
  rotuloCategoriaChamado,
  rotuloPrioridadeChamado,
  rotuloStatusChamado,
} from "../../service/chamadosListaFiltrosService.js";

async function carregarClassificacoesChamados() {
  try {
    return await obterClassificacoesAtivasChamados();
  } catch (err) {
    console.error("Erro ao carregar classificacoes de chamados (admin):", err);
    return {
      categorias: [],
      prioridades: [],
      categoriasValores: [],
      prioridadesValores: [],
      categoriasLabels: {},
      prioridadesLabels: {},
    };
  }
}

function mapearChamadoAdmin(c, classificacoes) {
  return {
    id: String(c._id),
    numero: c.numero,
    titulo: c.titulo,
    categoria: c.categoria || "-",
    categoriaLabel: rotuloCategoriaChamado(c.categoria, classificacoes?.categoriasLabels),
    prioridade: c.prioridade || "-",
    prioridadeLabel: rotuloPrioridadeChamado(c.prioridade, classificacoes?.prioridadesLabels),
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
  const classificacoes = await carregarClassificacoesChamados();

  const filtros = lerFiltrosListaChamados(req.query, {
    limitDefault: 10,
    allowAlocacao: true,
    allowResponsavelLogin: true,
    categoriasPermitidas: classificacoes.categoriasValores,
    prioridadesPermitidas: classificacoes.prioridadesValores,
  });
  const opcoes = obterOpcoesFiltrosChamados({
    incluirAlocacao: true,
    categorias: classificacoes.categorias,
    prioridades: classificacoes.prioridades,
    categoriasLabels: classificacoes.categoriasLabels,
    prioridadesLabels: classificacoes.prioridadesLabels,
  });

  try {
    const statusConsulta = filtros.status
      ? [filtros.status]
      : ["aberto", "em_atendimento", "aguardando_usuario"];

    const lista = await listarChamados({ status: statusConsulta, limit: 200 });
    const resultado = aplicarFiltrosListaChamados(lista, filtros, {
      usuarioLogin: usuarioSessao?.usuario,
    });

    const chamados = (resultado.itens || []).map((c) => mapearChamadoAdmin(c, classificacoes));

    return res.render("admin/chamados", {
      layout: "layout-app",
      titulo: "Chamados - Admin",
      cssPortal: "/styles/admin.css",
      cssExtra: "/styles/chamados.css",
      jsExtra: "/js/chamados-filters.js",
      usuarioSessao,
      chamados,
      filtros,
      paginacao: {
        total: resultado.total,
        page: resultado.page,
        pages: resultado.pages,
        limit: resultado.limit,
      },
      paginacaoQuery: { ...filtros },
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
      paginacao: {
        total: 0,
        page: filtros.page || 1,
        pages: 1,
        limit: filtros.limit || 10,
      },
      paginacaoQuery: { ...filtros },
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

export async function adminTecnicosGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;

  const flash = req.session?.flash || null;
  if (req.session) req.session.flash = null;

  const filtros = lerFiltrosAdminTecnicos(req.query);
  const painel = await obterDashboardTecnicosAdmin(filtros);
  const opcoes = opcoesAdminTecnicos();

  return res.render("admin/tecnicos", {
    layout: "layout-app",
    titulo: "Tecnicos - Admin",
    cssPortal: "/styles/admin.css",
    cssExtra: "/styles/admin-tecnicos.css",
    usuarioSessao,
    flash,
    filtros,
    opcoes,
    kpis: painel.kpis,
    insights: painel.insights,
    tecnicos: painel.tecnicos,
    paginacao: painel.paginacao,
    paginacaoQuery: {
      q: filtros.q,
      status: filtros.status,
      desempenho: filtros.desempenho,
      periodoDias: filtros.periodoDias,
      ordenacao: filtros.ordenacao,
      limit: painel.paginacao?.limit || filtros.limit,
    },
  });
}
