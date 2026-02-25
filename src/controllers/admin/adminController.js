import fs from "fs/promises";
import { obterAdminDashboardData } from "../../repos/admin/adminDashboardRepo.js";
import {
  lerFiltrosAdminTecnicos,
  obterDashboardTecnicosAdmin,
  opcoesAdminTecnicos,
} from "../../repos/admin/adminTecnicosDashboardRepo.js";
import {
  listarChamados,
  excluirChamadoPorIdAdmin,
} from "../../repos/chamados/core/chamadosCoreRepo.js";
import { obterClassificacoesAtivasChamados } from "../../repos/chamados/classificacoesChamadosRepo.js";
import { excluirNotificacoesPorChamadoId } from "../../repos/notificacoesRepo.js";
import {
  aplicarFiltrosListaChamados,
  lerFiltrosListaChamados,
  obterOpcoesFiltrosChamados,
  rotuloCategoriaChamado,
  rotuloPrioridadeChamado,
  rotuloStatusChamado,
} from "../../service/chamadosListaFiltrosService.js";
import { resolverCaminhoAnexo } from "../../service/anexosService.js";
import { registrarEventoSistema } from "../../service/logsService.js";
import { avaliarSlaChamado } from "../../service/chamadosSlaService.js";

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
  const sla = avaliarSlaChamado(c);

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
    slaClasse: String(sla?.classe || "sem_sla"),
    slaLabel: String(sla?.label || "SLA n/a"),
    slaTooltip: String(sla?.tooltip || ""),
  };
}

function extrairCaminhosAnexosChamado(chamado = {}) {
  const hist = Array.isArray(chamado?.historico) ? chamado.historico : [];
  const caminhos = new Set();

  hist.forEach((evento) => {
    const anexos = Array.isArray(evento?.meta?.anexos) ? evento.meta.anexos : [];
    anexos.forEach((anexo) => {
      const caminhoRelativo = String(anexo?.caminhoRelativo || "").trim();
      if (caminhoRelativo) caminhos.add(caminhoRelativo);
    });
  });

  return [...caminhos];
}

async function apagarAnexosChamado(chamado = {}) {
  const caminhos = extrairCaminhosAnexosChamado(chamado);
  if (!caminhos.length) return 0;

  await Promise.all(
    caminhos.map(async (rel) => {
      const abs = resolverCaminhoAnexo(rel);
      if (!abs) return;
      try {
        await fs.unlink(abs);
      } catch {
        // best effort
      }
    }),
  );

  return caminhos.length;
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

export async function adminChamadoExcluirPost(req, res) {
  const chamadoId = String(req.params?.id || "").trim();
  if (!chamadoId) {
    req.session.flash = { tipo: "error", mensagem: "Chamado invalido para exclusao." };
    return res.redirect("/admin/chamados");
  }

  try {
    const chamado = await excluirChamadoPorIdAdmin(chamadoId);
    if (!chamado) {
      req.session.flash = { tipo: "info", mensagem: "Chamado nao encontrado ou ja excluido." };
      return res.redirect("/admin/chamados");
    }

    const chamadoIdReal = String(chamado?._id || chamadoId);
    const [anexosRemovidos, notifOut] = await Promise.all([
      apagarAnexosChamado(chamado),
      excluirNotificacoesPorChamadoId(chamadoIdReal),
    ]);

    await registrarEventoSistema({
      req,
      nivel: "security",
      modulo: "admin",
      evento: "admin.chamado.excluido",
      acao: "excluir_chamado",
      resultado: "sucesso",
      mensagem: `Chamado #${chamado?.numero || ""} excluido pelo administrador.`,
      alvo: {
        tipo: "chamado",
        id: chamadoIdReal,
        numero: String(chamado?.numero || ""),
      },
      meta: {
        statusAnterior: String(chamado?.status || ""),
        anexosRemovidos: Number(anexosRemovidos || 0),
        notificacoesRemovidas: Number(notifOut?.deleted || 0),
        responsavelLogin: String(chamado?.responsavelLogin || ""),
      },
    });

    req.session.flash = { tipo: "success", mensagem: "Chamado excluido com sucesso." };
    return res.redirect("/admin/chamados");
  } catch (err) {
    console.error("Erro ao excluir chamado (admin):", err);

    await registrarEventoSistema({
      req,
      nivel: "warn",
      modulo: "admin",
      evento: "admin.chamado.excluido",
      acao: "excluir_chamado",
      resultado: "erro",
      mensagem: err?.message || "Falha ao excluir chamado.",
      alvo: {
        tipo: "chamado",
        id: chamadoId,
      },
    });

    req.session.flash = { tipo: "error", mensagem: "Nao foi possivel excluir o chamado." };
    return res.redirect("/admin/chamados");
  }
}
