import {
  listarChamados,
  listarMeusAtendimentos,
  listarHistoricoTecnicoChamados,
} from "../../repos/chamados/core/chamadosCoreRepo.js";
import { obterClassificacoesAtivasChamados } from "../../repos/chamados/classificacoesChamadosRepo.js";
import { assumirChamado } from "../../repos/chamados/tecnico/chamadosTecnicoRepo.js";
import { criarNotificacao } from "../../repos/notificacoesRepo.js";
import { registrarEventoSistema } from "../../service/logsService.js";
import {
  aplicarFiltrosListaChamados,
  lerFiltrosListaChamados,
  obterOpcoesFiltrosChamados,
  ordenarChamadosAbertosPrimeiroAntigosPrimeiro,
  rotuloCategoriaChamado,
  rotuloPrioridadeChamado,
  rotuloStatusChamado,
} from "../../service/chamadosListaFiltrosService.js";
import { STATUS_ALLOWED } from "../../repos/chamados/core/chamadosCoreRepo.js";
import { listarPresencaOnline } from "../../repos/presencaOnlineRepo.js";
import { paginarLista } from "../../service/paginacaoService.js";

import { obterHomeTecnicoData } from "../../repos/tecnico/tecnicoDashboardRepo.js";
import {
  lerFiltrosAdminTecnicos,
  obterDashboardTecnicosAdmin,
  opcoesAdminTecnicos,
} from "../../repos/admin/adminTecnicosDashboardRepo.js";
import { avaliarSlaChamado } from "../../service/chamadosSlaService.js";

async function carregarClassificacoesChamados() {
  try {
    return await obterClassificacoesAtivasChamados();
  } catch (err) {
    console.error("Erro ao carregar classificacoes de chamados (tecnico):", err);
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

function mapearChamadoLista(c, usuarioSessao, classificacoes) {
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
    atualizadoEm: c.updatedAt ? new Date(c.updatedAt).toLocaleString("pt-BR") : null,
    solicitante: c?.criadoPor?.login
      ? `${c.criadoPor.nome || ""} (${c.criadoPor.login})`
      : (c?.criadoPor?.nome || "-"),
    responsavel: c.responsavelLogin
      ? `${c.responsavelNome || ""} (${c.responsavelLogin})`
      : "-",
    temResponsavel: Boolean(c.responsavelId),
    isMeu: Boolean(
      c.responsavelLogin &&
      String(c.responsavelLogin).toLowerCase() === String(usuarioSessao?.usuario || "").toLowerCase(),
    ),
    slaClasse: String(sla?.classe || "sem_sla"),
    slaLabel: String(sla?.label || "SLA n/a"),
    slaTooltip: String(sla?.tooltip || ""),
  };
}

function ordenarFilaChamados(lista = []) {
  return ordenarChamadosAbertosPrimeiroAntigosPrimeiro(lista);
}

function montarPontosMelhoriaTecnico(tecnico) {
  if (!tecnico) return [];

  const pontos = [];
  const ativos = Number(tecnico.ativos || 0);
  const criticos = Number(tecnico.criticosAtivos || 0);
  const aguardandoUsuario = Number(tecnico.aguardandoUsuario || 0);
  const interacoes = Number(tecnico.interacoesPeriodo || 0);
  const tempoPrimeiro = Number(tecnico.tempoPrimeiroAtendimentoHoras || 0);
  const amostrasTempo = Number(tecnico.tempoPrimeiroAtendimentoAmostras || 0);

  if (criticos > 0) {
    pontos.push(`Voce tem ${criticos} chamado(s) critico(s) ativo(s). Priorize esses atendimentos primeiro.`);
  }
  if (ativos >= 8) {
    pontos.push(`Carga alta (${ativos} chamados ativos). Reorganize a fila e redistribua quando necessario.`);
  }
  if (aguardandoUsuario >= 4) {
    pontos.push(`${aguardandoUsuario} chamado(s) aguardando usuario. Reforce retornos objetivos para acelerar fechamento.`);
  }
  if (ativos > 0 && interacoes === 0) {
    pontos.push("Sem interacoes recentes no periodo. Atualize os chamados para manter rastreabilidade do atendimento.");
  }
  if (amostrasTempo > 0 && tempoPrimeiro > 6) {
    pontos.push(`Tempo medio do primeiro atendimento em ${tempoPrimeiro.toFixed(1)}h. Tente reduzir para menos de 6h.`);
  }

  if (!pontos.length) {
    pontos.push("Indicadores estaveis no periodo. Mantenha o ritmo e registre interacoes curtas e frequentes.");
  }

  return pontos;
}

export async function tecnicoFilaGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

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
      : [...STATUS_ALLOWED];

    const lista = await listarChamados({ status: statusConsulta, limit: 1000 });
    const resultado = aplicarFiltrosListaChamados(lista, filtros, {
      usuarioLogin: usuarioSessao.usuario,
      ordenarItensFn: ordenarFilaChamados,
    });

    const chamados = (resultado.itens || []).map((c) => mapearChamadoLista(c, usuarioSessao, classificacoes));

    return res.render("tecnico/fila", {
      layout: "layout-app",
      titulo: "Chamados",
      cssPortal: "/styles/usuario.css",
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
    console.error("Erro ao carregar fila tecnico:", e);
    return res.status(500).render("tecnico/fila", {
      layout: "layout-app",
      titulo: "Chamados",
      cssPortal: "/styles/usuario.css",
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
      erroGeral: "Nao foi possivel carregar a fila.",
      flash: flash || { tipo: "error", mensagem: "Nao foi possivel carregar a fila." },
    });
  }
}

export async function tecnicoAssumirPost(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  let chamado = null;
  try {
    chamado = await assumirChamado(
      req.params.id,
      { id: usuarioSessao.id, nome: usuarioSessao.nome, usuario: usuarioSessao.usuario },
      { porLogin: usuarioSessao.usuario },
    );
  } catch (e) {
    console.error("Erro ao assumir chamado:", e);
    req.session.flash = {
      tipo: "error",
      mensagem: e?.message || "Nao foi possivel assumir o chamado.",
    };
    return res.redirect(`/tecnico/chamados/${req.params.id}`);
  }

  const usuarioDestinoId = chamado?.criadoPor?.usuarioId
    ? String(chamado.criadoPor.usuarioId)
    : "";
  const autorId = String(usuarioSessao.id);

  if (usuarioDestinoId && usuarioDestinoId !== autorId) {
    try {
      await criarNotificacao({
        destinatarioTipo: "usuario",
        destinatarioId: usuarioDestinoId,
        chamadoId: String(chamado._id),
        tipo: "atribuido",
        titulo: `Chamado #${chamado.numero}: ${chamado.titulo}`,
        mensagem: `Seu chamado foi assumido por ${usuarioSessao.nome}.`,
        url: `/chamados/${String(chamado._id)}`,
        meta: {
          autor: {
            tipo: "tecnico",
            id: autorId,
            nome: usuarioSessao.nome,
            login: usuarioSessao.usuario,
          },
        },
      });
    } catch (errNotif) {
      console.error("[notificacao] falha ao notificar usuario sobre assuncao:", errNotif);
    }
  }

  await registrarEventoSistema({
    req,
    nivel: "info",
    modulo: "tecnico",
    evento: "chamado.assumido",
    acao: "assumir",
    resultado: "sucesso",
    mensagem: `Chamado #${chamado?.numero || ""} assumido por tecnico.`,
    alvo: {
      tipo: "chamado",
      id: String(chamado?._id || req.params.id),
      numero: String(chamado?.numero || ""),
    },
    meta: {
      responsavelId: String(usuarioSessao.id),
      responsavelLogin: String(usuarioSessao.usuario || ""),
    },
  });

  req.session.flash = { tipo: "success", mensagem: "Chamado assumido." };
  return res.redirect("/tecnico/chamados");
}

export async function tecnicoHomeGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  const flash = req.session?.flash || null;
  if (req.session) req.session.flash = null;

  const {
    kpis,
    logs,
    ultimosChamados,
    ultimosUsuarios,
  } = await obterHomeTecnicoData(usuarioSessao.id);

  return res.render("tecnico/home", {
    layout: "layout-app",
    titulo: "Home Tecnico",
    ambiente: process.env.AMBIENTE || "LOCAL",
    usuarioSessao,
    flash,
    kpis,
    logs,
    ultimosChamados,
    ultimosUsuarios,
  });
}

export async function tecnicoMetricasGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  const flash = req.session?.flash || null;
  if (req.session) req.session.flash = null;

  const filtrosBase = lerFiltrosAdminTecnicos(req.query);
  const filtros = { periodoDias: filtrosBase.periodoDias };

  try {
    const painel = await obterDashboardTecnicosAdmin({
      ...filtrosBase,
      tecnicoId: usuarioSessao.id,
      q: "",
      status: "",
      desempenho: "",
      page: 1,
      limit: 10,
      ordenacao: "atividade_recente",
    });

    const tecnico = Array.isArray(painel?.tecnicos) ? (painel.tecnicos[0] || null) : null;
    const pontosMelhoria = montarPontosMelhoriaTecnico(tecnico);

    return res.render("tecnico/metricas", {
      layout: "layout-app",
      titulo: "Minhas metricas",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/admin-tecnicos.css",
      usuarioSessao,
      flash,
      filtros,
      opcoes: opcoesAdminTecnicos(),
      tecnico,
      pontosMelhoria,
    });
  } catch (e) {
    console.error("Erro ao carregar metricas do tecnico:", e);
    return res.status(500).render("tecnico/metricas", {
      layout: "layout-app",
      titulo: "Minhas metricas",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/admin-tecnicos.css",
      usuarioSessao,
      flash: flash || { tipo: "error", mensagem: "Nao foi possivel carregar suas metricas." },
      filtros,
      opcoes: opcoesAdminTecnicos(),
      tecnico: null,
      pontosMelhoria: [],
      erroGeral: "Nao foi possivel carregar suas metricas.",
    });
  }
}

export async function tecnicoMeusChamadosGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  const flash = req.session?.flash || null;
  if (req.session) req.session.flash = null;
  const classificacoes = await carregarClassificacoesChamados();

  const filtros = lerFiltrosListaChamados(req.query, {
    limitDefault: 10,
    allowResponsavelLogin: false,
    categoriasPermitidas: classificacoes.categoriasValores,
    prioridadesPermitidas: classificacoes.prioridadesValores,
  });
  const opcoes = obterOpcoesFiltrosChamados({
    incluirAlocacao: false,
    categorias: classificacoes.categorias,
    prioridades: classificacoes.prioridades,
    categoriasLabels: classificacoes.categoriasLabels,
    prioridadesLabels: classificacoes.prioridadesLabels,
  });

  try {
    const lista = await listarMeusAtendimentos(usuarioSessao.id, { limit: 200 });
    const resultado = aplicarFiltrosListaChamados(lista, filtros, {
      usuarioLogin: usuarioSessao.usuario,
      ordenarItensFn: ordenarChamadosAbertosPrimeiroAntigosPrimeiro,
    });

    const chamados = (resultado.itens || []).map((c) => ({
      ...mapearChamadoLista(c, usuarioSessao, classificacoes),
      quando: c.updatedAt
        ? new Date(c.updatedAt).toLocaleString("pt-BR")
        : (c.createdAt ? new Date(c.createdAt).toLocaleString("pt-BR") : "-"),
    }));

    return res.render("tecnico/meus-chamados", {
      layout: "layout-app",
      titulo: "Meus chamados",
      cssPortal: "/styles/usuario.css",
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
    console.error("Erro ao carregar chamados atribuidos:", e);
    return res.status(500).render("tecnico/meus-chamados", {
      layout: "layout-app",
      titulo: "Meus chamados",
      cssPortal: "/styles/usuario.css",
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
      erroGeral: "Nao foi possivel carregar seus chamados.",
      flash: flash || {
        tipo: "error",
        mensagem: "Nao foi possivel carregar seus chamados.",
      },
    });
  }
}

export async function tecnicoHistoricoChamadosGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

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
    const lista = await listarHistoricoTecnicoChamados(
      {
        tecnicoId: usuarioSessao.id,
        tecnicoLogin: usuarioSessao.usuario,
      },
      { limit: 500 },
    );

    const resultado = aplicarFiltrosListaChamados(lista, filtros, {
      usuarioLogin: usuarioSessao.usuario,
      ordenarItensFn: ordenarChamadosAbertosPrimeiroAntigosPrimeiro,
    });

    const chamados = (resultado.itens || []).map((c) => ({
      ...mapearChamadoLista(c, usuarioSessao, classificacoes),
      quando: c.updatedAt
        ? new Date(c.updatedAt).toLocaleString("pt-BR")
        : (c.createdAt ? new Date(c.createdAt).toLocaleString("pt-BR") : "-"),
    }));

    return res.render("tecnico/historico-chamados", {
      layout: "layout-app",
      titulo: "Historico de atendimentos",
      cssPortal: "/styles/usuario.css",
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
    console.error("Erro ao carregar historico de chamados do tecnico:", e);
    return res.status(500).render("tecnico/historico-chamados", {
      layout: "layout-app",
      titulo: "Historico de atendimentos",
      cssPortal: "/styles/usuario.css",
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
      erroGeral: "Nao foi possivel carregar seu historico de atendimentos.",
      flash: flash || {
        tipo: "error",
        mensagem: "Nao foi possivel carregar seu historico de atendimentos.",
      },
    });
  }
}

function normalizarGrupoOnline(grupo = "") {
  const g = String(grupo || "").trim().toLowerCase();
  if (g === "todos" || g === "all") return "todos";
  if (g === "tecnico" || g === "tecnicos") return "tecnico";
  return "usuario";
}

function normalizarPerfilOnline(perfil = "", grupo = "usuario") {
  const p = String(perfil || "").trim().toLowerCase();
  if (grupo === "todos") {
    return (p === "usuario" || p === "tecnico" || p === "admin") ? p : "";
  }
  if (grupo === "usuario") {
    return p === "usuario" ? "usuario" : "";
  }
  if (p === "tecnico" || p === "admin") return p;
  return "";
}

function formatarDuracaoCurta(segundos = 0) {
  const total = Math.max(0, Number(segundos) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatarDataBrSafe(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR");
}

function lerFiltrosOnline(query = {}) {
  const grupo = normalizarGrupoOnline(query?.grupo);
  const perfil = normalizarPerfilOnline(query?.perfil, grupo);
  const q = String(query?.q || "").trim();
  const pageRaw = Number.parseInt(String(query?.page || "1"), 10);
  const limitRaw = Number.parseInt(String(query?.limit || "25"), 10);
  const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1;
  const limit = Number.isFinite(limitRaw) ? Math.max(10, Math.min(limitRaw, 100)) : 25;

  return {
    grupo,
    perfil,
    q,
    page,
    limit,
  };
}

export async function tecnicoOnlineGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  const filtros = lerFiltrosOnline(req.query);
  const termo = String(filtros.q || "").trim().toLowerCase();
  const usuarioLogadoId = String(usuarioSessao.id || "").trim();

  try {
    const out = await listarPresencaOnline({
      grupo: filtros.grupo,
      limit: 500,
    });

    const listaBase = Array.isArray(out?.itens) ? out.itens : [];
    const filtrados = listaBase.filter((item) => {
      if (filtros.perfil && String(item?.perfil || "") !== filtros.perfil) return false;
      if (!termo) return true;

      const nome = String(item?.nome || "").toLowerCase();
      const login = String(item?.login || "").toLowerCase();
      return nome.includes(termo) || login.includes(termo);
    });

    filtrados.sort((a, b) => {
      const inativoA = Number(a?.tempoInativoSegundos ?? 999999);
      const inativoB = Number(b?.tempoInativoSegundos ?? 999999);
      if (inativoA !== inativoB) return inativoA - inativoB;
      const sessaoA = Number(a?.tempoSessaoSegundos ?? 0);
      const sessaoB = Number(b?.tempoSessaoSegundos ?? 0);
      return sessaoB - sessaoA;
    });

    const paginado = paginarLista(filtrados, { page: filtros.page, limit: filtros.limit });
    const itens = (paginado.itens || []).map((item) => ({
      nome: String(item?.nome || "").trim() || "-",
      login: String(item?.login || "").trim() || "-",
      perfil: String(item?.perfil || "").trim() || "-",
      sessao: formatarDuracaoCurta(item?.tempoSessaoSegundos),
      inativo: formatarDuracaoCurta(item?.tempoInativoSegundos),
      ultimaAtividade: formatarDataBrSafe(item?.ultimaAtividadeEm),
      logadoNoMomento: Boolean(usuarioLogadoId && String(item?.usuarioId || "") === usuarioLogadoId),
    }));

    return res.render("tecnico/online", {
      layout: "layout-app",
      titulo: "Pessoas online",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamados.css",
      usuarioSessao,
      filtros,
      itens,
      totalBase: listaBase.length,
      totalFiltrados: filtrados.length,
      paginacao: {
        total: paginado.total,
        page: paginado.page,
        pages: paginado.pages,
        limit: paginado.limit,
      },
      paginacaoQuery: { ...filtros },
      erroGeral: null,
    });
  } catch (err) {
    console.error("Erro ao carregar presenca online:", err);
    return res.status(500).render("tecnico/online", {
      layout: "layout-app",
      titulo: "Pessoas online",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamados.css",
      usuarioSessao,
      filtros,
      itens: [],
      totalBase: 0,
      totalFiltrados: 0,
      paginacao: {
        total: 0,
        page: filtros.page || 1,
        pages: 1,
        limit: filtros.limit || 25,
      },
      paginacaoQuery: { ...filtros },
      erroGeral: "Nao foi possivel carregar a lista de usuarios online.",
    });
  }
}
