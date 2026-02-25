import {
  listarBaseConhecimento,
  obterArtigoBaseConhecimento,
  obterStatsBaseConhecimento,
} from "../../service/baseConhecimentoService.js";
import { normalizarPaginacao } from "../../service/paginacaoService.js";

function filtroQuery(query = {}) {
  return {
    q: String(query?.q || "").trim(),
  };
}

export async function baseConhecimentoIndexGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  const filtros = filtroQuery(req.query);
  const { page, limit } = normalizarPaginacao(req.query, {
    pageDefault: 1,
    limitDefault: 10,
    limitMin: 10,
    limitMax: 200,
  });

  try {
    const [dados, stats] = await Promise.all([
      listarBaseConhecimento({ q: filtros.q, page, limit }),
      obterStatsBaseConhecimento(),
    ]);

    return res.render("base-conhecimento/index", {
      layout: "layout-app",
      titulo: "Base de conhecimento",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/base-conhecimento.css",
      usuarioSessao,
      filtros: { ...filtros, limit: dados?.paginacao?.limit || limit },
      artigos: dados?.itens || [],
      paginacao: dados?.paginacao || { total: 0, page: 1, pages: 1, limit },
      paginacaoQuery: {
        q: filtros.q,
        limit: dados?.paginacao?.limit || limit,
      },
      totalFiltrados: Number(dados?.paginacao?.total || 0),
      totalBase: Number(dados?.totalBase || 0),
      stats,
      erroGeral: null,
    });
  } catch (err) {
    console.error("Erro ao carregar base de conhecimento:", err);
    return res.status(500).render("base-conhecimento/index", {
      layout: "layout-app",
      titulo: "Base de conhecimento",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/base-conhecimento.css",
      usuarioSessao,
      filtros: { ...filtros, limit },
      artigos: [],
      paginacao: { total: 0, page: 1, pages: 1, limit },
      paginacaoQuery: { q: filtros.q, limit },
      totalFiltrados: 0,
      totalBase: 0,
      stats: { total: 0, categorias: [] },
      erroGeral: "Nao foi possivel carregar a base de conhecimento.",
    });
  }
}

export async function baseConhecimentoShowGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  const slug = String(req.params?.slug || "").trim().toLowerCase();

  try {
    const artigo = await obterArtigoBaseConhecimento(slug);
    if (!artigo) {
      return res.status(404).render("erros/erro", {
        layout: "layout-app",
        titulo: "Artigo nao encontrado",
        mensagem: "O artigo solicitado nao foi encontrado na base de conhecimento.",
      });
    }

    return res.render("base-conhecimento/show", {
      layout: "layout-app",
      titulo: `${artigo.titulo} - Base de conhecimento`,
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/base-conhecimento.css",
      usuarioSessao,
      artigo,
    });
  } catch (err) {
    console.error("Erro ao carregar artigo da base de conhecimento:", err);
    return res.status(500).render("erros/erro", {
      layout: "layout-app",
      titulo: "Erro interno",
      mensagem: "Nao foi possivel carregar o artigo solicitado.",
    });
  }
}
