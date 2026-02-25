import {
  listarBaseConhecimento,
  obterArtigoBaseConhecimento,
  obterStatsBaseConhecimento,
  invalidarCacheBaseConhecimento,
} from "../../service/baseConhecimentoService.js";
import { normalizarPaginacao } from "../../service/paginacaoService.js";
import { criarTopicoBaseConhecimento } from "../../repos/baseConhecimentoTopicosRepo.js";
import { registrarEventoSistema } from "../../service/logsService.js";

function filtroQuery(query = {}) {
  return {
    q: String(query?.q || "").trim(),
  };
}

function podeGerirTopicos(usuarioSessao = null) {
  const perfil = String(usuarioSessao?.perfil || "").trim().toLowerCase();
  return perfil === "tecnico" || perfil === "admin";
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
      podeGerirTopicos: podeGerirTopicos(usuarioSessao),
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
      podeGerirTopicos: podeGerirTopicos(usuarioSessao),
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

export async function baseConhecimentoNovoGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!podeGerirTopicos(usuarioSessao)) {
    if (req.session) req.session.flash = { tipo: "error", mensagem: "Sem permissao para criar topicos." };
    return res.redirect("/base-conhecimento");
  }

  return res.render("base-conhecimento/novo", {
    layout: "layout-app",
    titulo: "Novo topico da base",
    cssPortal: "/styles/usuario.css",
    cssExtra: "/styles/base-conhecimento.css",
    usuarioSessao,
    erroGeral: null,
    valores: {
      titulo: "",
      categoria: "",
      resumo: "",
      tags: "",
      perguntas: "",
      sintomas: "",
      conteudo: "",
    },
  });
}

export async function baseConhecimentoNovoPost(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!podeGerirTopicos(usuarioSessao)) {
    if (req.session) req.session.flash = { tipo: "error", mensagem: "Sem permissao para criar topicos." };
    return res.redirect("/base-conhecimento");
  }

  const valores = {
    titulo: String(req.body?.titulo || "").trim(),
    categoria: String(req.body?.categoria || "").trim(),
    resumo: String(req.body?.resumo || "").trim(),
    tags: String(req.body?.tags || "").trim(),
    perguntas: String(req.body?.perguntas || "").trim(),
    sintomas: String(req.body?.sintomas || "").trim(),
    conteudo: String(req.body?.conteudo || "").trim(),
  };

  try {
    const topico = await criarTopicoBaseConhecimento({
      ...valores,
      autor: usuarioSessao,
    });
    invalidarCacheBaseConhecimento();

    await registrarEventoSistema({
      req,
      nivel: "info",
      modulo: "base_conhecimento",
      evento: "base_conhecimento.topico_criado",
      acao: "criar_topico",
      resultado: "sucesso",
      mensagem: `Topico interno criado: ${String(topico?.titulo || "").slice(0, 140)}.`,
      alvo: {
        tipo: "base_conhecimento",
        id: String(topico?._id || ""),
      },
      meta: {
        slug: topico?.slug,
        categoria: topico?.categoria,
      },
    });

    if (req.session) req.session.flash = { tipo: "success", mensagem: "Topico criado na base com sucesso." };
    return res.redirect(`/base-conhecimento/${encodeURIComponent(String(topico?.slug || ""))}`);
  } catch (err) {
    console.error("Erro ao criar topico da base de conhecimento:", err);
    return res.status(400).render("base-conhecimento/novo", {
      layout: "layout-app",
      titulo: "Novo topico da base",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/base-conhecimento.css",
      usuarioSessao,
      erroGeral: err?.message || "Nao foi possivel criar o topico.",
      valores,
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
