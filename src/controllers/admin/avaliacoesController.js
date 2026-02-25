import { listarAvaliacoesAdmin, obterResumoAvaliacoesGeral } from "../../repos/avaliacoesAtendimentoRepo.js";

function intOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function filtrosFromQuery(query = {}) {
  return {
    q: String(query?.q || "").trim(),
    notaMin: String(query?.notaMin || "").trim(),
    tecnicoLogin: String(query?.tecnicoLogin || "").trim().toLowerCase(),
    avaliadorLogin: String(query?.avaliadorLogin || "").trim().toLowerCase(),
  };
}

export async function adminAvaliacoesGet(req, res) {
  const filtros = filtrosFromQuery(req.query);
  const page = Math.max(1, intOr(req.query?.page, 1));
  const limit = Math.max(10, Math.min(intOr(req.query?.limit, 10), 200));

  const [dados, resumo] = await Promise.all([
    listarAvaliacoesAdmin({ page, limit, filtros }),
    obterResumoAvaliacoesGeral({ limit: 1 }),
  ]);

  return res.render("admin/avaliacoes/index", {
    layout: "layout-app",
    titulo: "Avaliacoes de atendimento",
    cssPortal: "/styles/admin.css",
    cssExtra: "/styles/admin-avaliacoes.css",
    usuarioSessao: req.session?.usuario || null,
    filtros: {
      ...filtros,
      limit,
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
