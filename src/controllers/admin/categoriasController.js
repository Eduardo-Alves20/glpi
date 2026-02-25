import { validarClassificacaoChamado } from "../../compartilhado/validacao/classificacaoChamado.js";
import { normalizarPaginacao } from "../../service/paginacaoService.js";
import { registrarEventoSistema } from "../../service/logsService.js";
import {
  acharClassificacaoPorIdSeguro,
  atualizarClassificacaoChamado,
  criarClassificacaoChamado,
  excluirClassificacaoChamado,
  listarClassificacoesPaginadoFiltrado,
  listarTiposClassificacao,
} from "../../repos/chamados/classificacoesChamadosRepo.js";

function viewBaseAdmin(req, extra = {}) {
  return {
    layout: "layout-app.ejs",
    ambiente: process.env.AMBIENTE || "LOCAL",
    cssPortal: "/styles/usuario.css",
    cssExtra: "/styles/usuario-perfil.css",
    req,
    ...extra,
  };
}

function viewBaseClassificacoes(req, extra = {}) {
  return viewBaseAdmin(req, {
    titulo: "GLPI - Categorias",
    tiposClassificacao: listarTiposClassificacao(),
    ...extra,
  });
}

function lerFiltrosClassificacoes(query = {}) {
  const tipoRaw = String(query.tipo || "").trim().toLowerCase();
  const statusRaw = String(query.status || "").trim().toLowerCase();

  return {
    q: String(query.q || "").trim().slice(0, 120),
    tipo: ["categoria", "prioridade"].includes(tipoRaw) ? tipoRaw : "",
    status: ["ativo", "inativo"].includes(statusRaw) ? statusRaw : "",
  };
}

function montarValoresClassificacao(item = {}) {
  return {
    tipo: String(item.tipo || "categoria").trim().toLowerCase(),
    nome: String(item.nome || "").trim(),
    chave: String(item.chave || "").trim().toLowerCase(),
    ordem: Number.isFinite(Number(item.ordem)) ? Number(item.ordem) : 100,
    status: String(item.status || (item.ativo ? "ativo" : "inativo") || "ativo")
      .trim()
      .toLowerCase(),
  };
}

function labelTipo(tipo) {
  return String(tipo || "").trim().toLowerCase() === "prioridade"
    ? "Prioridade"
    : "Categoria";
}

export async function categoriasIndexGet(req, res) {
  const filtros = lerFiltrosClassificacoes(req.query);
  const { page, limit } = normalizarPaginacao(
    { page: req.query?.page, limit: req.query?.limit },
    { pageDefault: 1, limitDefault: 10, limitMin: 10, limitMax: 200 },
  );

  const dados = await listarClassificacoesPaginadoFiltrado({
    page,
    limit,
    filtros,
  });

  return res.render(
    "admin/categorias/index",
    viewBaseClassificacoes(req, {
      itens: dados.itens || [],
      filtros,
      paginacao: {
        total: dados.total || 0,
        page: dados.page || 1,
        pages: dados.pages || 1,
        limit: dados.limit || limit,
      },
      paginacaoQuery: {
        ...filtros,
        limit: dados.limit || limit,
      },
    }),
  );
}

export function categoriasNovoGet(req, res) {
  return res.render(
    "admin/categorias/novo",
    viewBaseClassificacoes(req, {
      erros: [],
      valores: {
        tipo: "categoria",
        nome: "",
        chave: "",
        ordem: 100,
        status: "ativo",
      },
    }),
  );
}

export async function categoriasCreatePost(req, res) {
  const v = validarClassificacaoChamado(req.body);

  if (!v.ok) {
    return res.status(400).render(
      "admin/categorias/novo",
      viewBaseClassificacoes(req, {
        erros: v.erros,
        valores: v.valores,
      }),
    );
  }

  try {
    const criada = await criarClassificacaoChamado(v.valores);

    await registrarEventoSistema({
      req,
      nivel: "info",
      modulo: "admin",
      evento: "admin.classificacao.criada",
      acao: "criar_classificacao",
      resultado: "sucesso",
      mensagem: `${labelTipo(criada.tipo)} ${criada.nome} criada por administrador.`,
      alvo: {
        tipo: "classificacao_chamado",
        id: criada.id,
      },
      meta: {
        tipoClassificacao: criada.tipo,
        chave: criada.chave,
        status: criada.status,
      },
    });

    if (req.session) {
      req.session.flash = {
        tipo: "success",
        mensagem: `${labelTipo(criada.tipo)} criada com sucesso.`,
      };
    }
    return res.redirect("/admin/categorias");
  } catch (e) {
    console.error("Erro ao criar classificacao:", e);
    return res.status(400).render(
      "admin/categorias/novo",
      viewBaseClassificacoes(req, {
        erros: [e?.message || "Nao foi possivel criar a classificacao."],
        valores: v.valores,
      }),
    );
  }
}

export async function categoriasEditarGet(req, res) {
  const item = await acharClassificacaoPorIdSeguro(req.params.id);
  if (!item) {
    if (req.session) {
      req.session.flash = { tipo: "error", mensagem: "Classificacao nao encontrada." };
    }
    return res.redirect("/admin/categorias");
  }

  return res.render(
    "admin/categorias/editar",
    viewBaseClassificacoes(req, {
      classificacaoId: item.id,
      erros: [],
      valores: montarValoresClassificacao(item),
    }),
  );
}

export async function categoriasEditarPost(req, res) {
  const classificacaoId = String(req.params.id || "").trim();
  const atual = await acharClassificacaoPorIdSeguro(classificacaoId);

  if (!atual) {
    if (req.session) {
      req.session.flash = { tipo: "error", mensagem: "Classificacao nao encontrada." };
    }
    return res.redirect("/admin/categorias");
  }

  const v = validarClassificacaoChamado(req.body);
  if (!v.ok) {
    return res.status(400).render(
      "admin/categorias/editar",
      viewBaseClassificacoes(req, {
        classificacaoId,
        erros: v.erros,
        valores: {
          ...montarValoresClassificacao(atual),
          ...v.valores,
        },
      }),
    );
  }

  try {
    const atualizada = await atualizarClassificacaoChamado(classificacaoId, v.valores);

    await registrarEventoSistema({
      req,
      nivel: "info",
      modulo: "admin",
      evento: "admin.classificacao.editada",
      acao: "editar_classificacao",
      resultado: "sucesso",
      mensagem: `${labelTipo(atualizada.tipo)} ${atualizada.nome} atualizada por administrador.`,
      alvo: {
        tipo: "classificacao_chamado",
        id: atualizada.id,
      },
      meta: {
        tipoClassificacao: atualizada.tipo,
        chave: atualizada.chave,
        status: atualizada.status,
      },
    });

    if (req.session) {
      req.session.flash = {
        tipo: "success",
        mensagem: `${labelTipo(atualizada.tipo)} atualizada com sucesso.`,
      };
    }
    return res.redirect("/admin/categorias");
  } catch (e) {
    console.error("Erro ao atualizar classificacao:", e);
    return res.status(400).render(
      "admin/categorias/editar",
      viewBaseClassificacoes(req, {
        classificacaoId,
        erros: [e?.message || "Nao foi possivel atualizar a classificacao."],
        valores: {
          ...montarValoresClassificacao(atual),
          ...v.valores,
        },
      }),
    );
  }
}

export async function categoriasExcluirPost(req, res) {
  const classificacaoId = String(req.params.id || "").trim();
  const atual = await acharClassificacaoPorIdSeguro(classificacaoId);

  if (!atual) {
    if (req.session) {
      req.session.flash = { tipo: "error", mensagem: "Classificacao nao encontrada." };
    }
    return res.redirect("/admin/categorias");
  }

  try {
    await excluirClassificacaoChamado(classificacaoId);

    await registrarEventoSistema({
      req,
      nivel: "security",
      modulo: "admin",
      evento: "admin.classificacao.excluida",
      acao: "excluir_classificacao",
      resultado: "sucesso",
      mensagem: `${labelTipo(atual.tipo)} ${atual.nome} excluida por administrador.`,
      alvo: {
        tipo: "classificacao_chamado",
        id: classificacaoId,
      },
      meta: {
        tipoClassificacao: atual.tipo,
        chave: atual.chave,
      },
    });

    if (req.session) {
      req.session.flash = {
        tipo: "success",
        mensagem: `${labelTipo(atual.tipo)} excluida com sucesso.`,
      };
    }
  } catch (e) {
    console.error("Erro ao excluir classificacao:", e);
    if (req.session) {
      req.session.flash = {
        tipo: "error",
        mensagem: e?.message || "Nao foi possivel excluir a classificacao.",
      };
    }
  }

  return res.redirect("/admin/categorias");
}
