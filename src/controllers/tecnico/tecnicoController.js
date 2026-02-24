import {
  listarChamados,
  listarMeusAtendimentos,
} from "../../repos/chamados/core/chamadosCoreRepo.js";
import { assumirChamado } from "../../repos/chamados/tecnico/chamadosTecnicoRepo.js";
import { criarNotificacao } from "../../repos/notificacoesRepo.js";
import { registrarEventoSistema } from "../../service/logsService.js";
import {
  aplicarFiltrosListaChamados,
  lerFiltrosListaChamados,
  obterOpcoesFiltrosChamados,
  rotuloCategoriaChamado,
  rotuloPrioridadeChamado,
  rotuloStatusChamado,
} from "../../service/chamadosListaFiltrosService.js";

import { obterHomeTecnicoData } from "../../repos/tecnico/tecnicoDashboardRepo.js";

function mapearChamadoLista(c, usuarioSessao) {
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
  };
}

export async function tecnicoFilaGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

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
      usuarioLogin: usuarioSessao.usuario,
    });

    const chamados = (resultado.itens || []).map((c) => mapearChamadoLista(c, usuarioSessao));

    return res.render("tecnico/fila", {
      layout: "layout-app",
      titulo: "Fila de chamados",
      cssPortal: "/styles/usuario.css",
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
    console.error("Erro ao carregar fila tecnico:", e);
    return res.status(500).render("tecnico/fila", {
      layout: "layout-app",
      titulo: "Fila de chamados",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamados.css",
      jsExtra: "/js/chamados-filters.js",
      usuarioSessao,
      chamados: [],
      filtros,
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

  const { kpis, logs, ultimosChamados } = await obterHomeTecnicoData(usuarioSessao.id);

  return res.render("tecnico/home", {
    layout: "layout-app",
    titulo: "Home Tecnico",
    ambiente: process.env.AMBIENTE || "LOCAL",
    usuarioSessao,
    flash,
    kpis,
    logs,
    ultimosChamados,
    ultimosUsuarios: [],
  });
}

export async function tecnicoMeusChamadosGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  const flash = req.session?.flash || null;
  if (req.session) req.session.flash = null;

  const filtros = lerFiltrosListaChamados(req.query, {
    limitDefault: 80,
    allowResponsavelLogin: false,
  });
  const opcoes = obterOpcoesFiltrosChamados({ incluirAlocacao: false });

  try {
    const lista = await listarMeusAtendimentos(usuarioSessao.id, { limit: 200 });
    const resultado = aplicarFiltrosListaChamados(lista, filtros, {
      usuarioLogin: usuarioSessao.usuario,
    });

    const chamados = (resultado.itens || []).map((c) => ({
      ...mapearChamadoLista(c, usuarioSessao),
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
