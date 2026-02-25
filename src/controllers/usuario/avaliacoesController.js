import {
  listarAvaliacoesAdmin,
  listarAvaliacoesDoUsuario,
  listarAvaliacoesTecnico,
  obterResumoAvaliacoesDoUsuario,
  obterResumoAvaliacoesGeral,
  obterResumoAvaliacoesTecnico,
} from "../../repos/avaliacoesAtendimentoRepo.js";
import { normalizarPaginacao } from "../../service/paginacaoService.js";

function filtrosBaseDaQuery(query = {}) {
  return {
    q: String(query?.q || "").trim(),
    notaMin: String(query?.notaMin || "").trim(),
    periodo: String(query?.periodo || "").trim() || "todos",
  };
}

function filtrosAdminDaQuery(query = {}) {
  return {
    tecnicoLogin: String(query?.tecnicoLogin || "").trim().toLowerCase(),
    avaliadorLogin: String(query?.avaliadorLogin || "").trim().toLowerCase(),
  };
}

function perfilVisualizacao(perfil) {
  if (perfil === "admin") return "admin";
  if (perfil === "tecnico") return "tecnico";
  return "usuario";
}

function montarTituloSubtitulo(modo) {
  if (modo === "admin") {
    return {
      titulo: "Avaliacoes",
      subtitulo: "Visao completa de avaliacoes com tecnicos, usuarios e chamados.",
    };
  }
  if (modo === "tecnico") {
    return {
      titulo: "Minhas avaliacoes",
      subtitulo: "Feedback anonimo dos usuarios sobre seus atendimentos.",
    };
  }
  return {
    titulo: "Minhas avaliacoes enviadas",
    subtitulo: "Historico das notas e feedbacks que voce enviou nos chamados.",
  };
}

export async function usuarioAvaliacoesGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  const modo = perfilVisualizacao(String(usuarioSessao?.perfil || "").toLowerCase());
  const base = filtrosBaseDaQuery(req.query);
  const extraAdmin = modo === "admin" ? filtrosAdminDaQuery(req.query) : {};
  const filtros = { ...base, ...extraAdmin };

  const { page, limit } = normalizarPaginacao(req.query, {
    pageDefault: 1,
    limitDefault: 10,
    limitMin: 10,
    limitMax: 200,
  });

  let dados = { itens: [], total: 0, page, limit, pages: 1 };
  let resumo = { media: 0, total: 0 };

  if (modo === "admin") {
    [dados, resumo] = await Promise.all([
      listarAvaliacoesAdmin({ page, limit, filtros }),
      obterResumoAvaliacoesGeral({ limit: 1 }),
    ]);
  } else if (modo === "tecnico") {
    [dados, resumo] = await Promise.all([
      listarAvaliacoesTecnico({
        tecnicoId: String(usuarioSessao?.id || ""),
        page,
        limit,
        filtros,
      }),
      obterResumoAvaliacoesTecnico(String(usuarioSessao?.id || ""), { limit: 1 }),
    ]);
  } else {
    [dados, resumo] = await Promise.all([
      listarAvaliacoesDoUsuario({
        avaliadorId: String(usuarioSessao?.id || ""),
        page,
        limit,
        filtros,
      }),
      obterResumoAvaliacoesDoUsuario(String(usuarioSessao?.id || ""), { limit: 1 }),
    ]);
  }

  const head = montarTituloSubtitulo(modo);
  return res.render("usuario/avaliacoes", {
    layout: "layout-app",
    titulo: head.titulo,
    cssPortal: "/styles/usuario.css",
    cssExtra: "/styles/usuario-avaliacoes.css",
    usuarioSessao,
    modo,
    head,
    filtros: {
      ...filtros,
      limit: Number(dados?.limit || limit),
    },
    dados,
    resumo: {
      media: Number(resumo?.media || 0),
      total: Number(resumo?.total || 0),
    },
    paginacao: {
      total: Number(dados?.total || 0),
      page: Number(dados?.page || 1),
      pages: Number(dados?.pages || 1),
      limit: Number(dados?.limit || limit),
    },
    paginacaoQuery: {
      ...filtros,
      limit: Number(dados?.limit || limit),
    },
  });
}

