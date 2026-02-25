import { ObjectId } from "mongodb";
import { pegarDb } from "../../compartilhado/db/mongo.js";
import { normalizarPaginacao, paginarLista } from "../../service/paginacaoService.js";
import {
  CATEGORIAS_PADRAO,
  PRIORIDADES_PADRAO,
} from "./classificacoesDefaults.js";

const COL_CLASSIFICACOES = "chamados_classificacoes";
const COL_CHAMADOS = "chamados";

export const TIPOS_CLASSIFICACAO_CHAMADO = Object.freeze([
  "categoria",
  "prioridade",
]);

const CLASSIFICACOES_PADRAO = Object.freeze({
  categoria: CATEGORIAS_PADRAO,
  prioridade: PRIORIDADES_PADRAO,
});
let baseInitPromise = null;

function col() {
  return pegarDb().collection(COL_CLASSIFICACOES);
}

function limparTexto(valor) {
  return String(valor ?? "").trim();
}

function removerAcentos(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizarParaComparacao(valor) {
  return removerAcentos(limparTexto(valor)).toLowerCase();
}

function compararTexto(a, b) {
  return String(a || "").localeCompare(String(b || ""), "pt-BR", {
    sensitivity: "base",
  });
}

function escaparRegex(texto = "") {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizarTipo(tipo, { aceitarVazio = false } = {}) {
  const valor = limparTexto(tipo).toLowerCase();
  if (!valor && aceitarVazio) return "";
  if (!TIPOS_CLASSIFICACAO_CHAMADO.includes(valor)) {
    throw new Error("Tipo de classificacao invalido.");
  }
  return valor;
}

function normalizarNome(nome) {
  const valor = limparTexto(nome);
  if (valor.length < 2 || valor.length > 60) {
    throw new Error("Nome deve ter entre 2 e 60 caracteres.");
  }
  return valor;
}

function normalizarChave(chave, nomeFallback = "") {
  const base = limparTexto(chave) || limparTexto(nomeFallback);
  const slug = removerAcentos(base)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

  if (slug.length < 2 || !/^[a-z0-9_]+$/.test(slug)) {
    throw new Error("Chave invalida. Use letras, numeros e underscore.");
  }

  return slug;
}

function normalizarChaveSeguro(chave, nomeFallback = "") {
  try {
    return normalizarChave(chave, nomeFallback);
  } catch (_err) {
    return "";
  }
}

function normalizarOrdem(ordem) {
  if (ordem === null || typeof ordem === "undefined" || ordem === "") return 100;
  const valor = Number(ordem);
  if (!Number.isFinite(valor)) {
    throw new Error("Ordem invalida.");
  }

  return Math.max(0, Math.min(9999, Math.trunc(valor)));
}

function normalizarAtivo(valor) {
  if (typeof valor === "boolean") return valor;

  const texto = limparTexto(valor).toLowerCase();
  if (!texto || texto === "ativo" || texto === "true" || texto === "1") return true;
  if (texto === "inativo" || texto === "false" || texto === "0") return false;

  throw new Error("Status invalido.");
}

function normalizarFiltroStatus(status) {
  const valor = limparTexto(status).toLowerCase();
  if (valor === "ativo" || valor === "inativo") return valor;
  return "";
}

function toStatus(ativo) {
  return ativo ? "ativo" : "inativo";
}

function ehOutrosItem(item = {}) {
  const chave = normalizarParaComparacao(item.value || item.chave);
  const nome = normalizarParaComparacao(item.label || item.nome);
  return chave === "outros" || nome === "outros";
}

function ordenarItensClassificacao(lista = [], { incluirTipo = false } = {}) {
  const itens = Array.isArray(lista) ? [...lista] : [];

  itens.sort((a, b) => {
    const tipoA = String(a?.tipo || "").trim().toLowerCase();
    const tipoB = String(b?.tipo || "").trim().toLowerCase();

    if (incluirTipo && tipoA !== tipoB) {
      return compararTexto(tipoA, tipoB);
    }

    if (tipoA === "categoria" || tipoB === "categoria") {
      const aOutros = tipoA === "categoria" && ehOutrosItem(a || {});
      const bOutros = tipoB === "categoria" && ehOutrosItem(b || {});
      if (aOutros !== bOutros) return aOutros ? 1 : -1;
    }

    const nomeA = limparTexto(a?.nome || a?.label || a?.chave || a?.value);
    const nomeB = limparTexto(b?.nome || b?.label || b?.chave || b?.value);
    const cmpNome = compararTexto(nomeA, nomeB);
    if (cmpNome !== 0) return cmpNome;

    const chaveA = limparTexto(a?.chave || a?.value);
    const chaveB = limparTexto(b?.chave || b?.value);
    return compararTexto(chaveA, chaveB);
  });

  return itens;
}

function mapearDocAdmin(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id || ""),
    tipo: limparTexto(doc.tipo).toLowerCase(),
    chave: limparTexto(doc.chave).toLowerCase(),
    nome: limparTexto(doc.nome),
    ordem: Number(doc.ordem || 0),
    ativo: Boolean(doc.ativo),
    status: toStatus(Boolean(doc.ativo)),
    sistema: Boolean(doc.sistema),
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

function mapearDocOpcao(doc) {
  const item = mapearDocAdmin(doc);
  if (!item) return null;

  return {
    id: item.id,
    value: item.chave,
    label: item.nome,
    ordem: item.ordem,
    tipo: item.tipo,
  };
}

async function contarAtivasPorTipo(tipo, { excluirId = null } = {}) {
  const query = { tipo, ativo: true };
  if (excluirId && ObjectId.isValid(excluirId)) {
    query._id = { $ne: new ObjectId(excluirId) };
  }
  return col().countDocuments(query);
}

async function acharClassificacaoPorId(id) {
  if (!ObjectId.isValid(id)) return null;
  return col().findOne({ _id: new ObjectId(id) });
}

export async function garantirClassificacoesChamadosBase() {
  if (!baseInitPromise) {
    baseInitPromise = (async () => {
      const now = new Date();

      await col().createIndex({ tipo: 1, chave: 1 }, { unique: true });
      await col().createIndex({ tipo: 1, ativo: 1, ordem: 1, nome: 1 });
      await col().createIndex({ tipo: 1, nome: 1 });

      const operacoes = [];
      Object.entries(CLASSIFICACOES_PADRAO).forEach(([tipo, lista]) => {
        (lista || []).forEach((item) => {
          const chave = normalizarChave(item?.chave, item?.nome);
          const nome = normalizarNome(item?.nome || "");
          const ordem = normalizarOrdem(item?.ordem);

          operacoes.push(
            col().updateOne(
              { tipo, chave },
              {
                $setOnInsert: {
                  tipo,
                  chave,
                  nome,
                  ordem,
                  ativo: true,
                  sistema: true,
                  createdAt: now,
                  updatedAt: now,
                },
              },
              { upsert: true },
            ),
          );
        });
      });

      if (operacoes.length) await Promise.all(operacoes);
    })().catch((err) => {
      baseInitPromise = null;
      throw err;
    });
  }

  await baseInitPromise;
}

export async function listarClassificacoesAtivasPorTipo(tipo) {
  const tipoSan = normalizarTipo(tipo);
  await garantirClassificacoesChamadosBase();

  const docs = await col()
    .find(
      { tipo: tipoSan, ativo: true },
      {
        projection: {
          tipo: 1,
          chave: 1,
          nome: 1,
          ordem: 1,
          ativo: 1,
        },
      },
    )
    .sort({ nome: 1, chave: 1 })
    .toArray();

  const itens = docs.map((doc) => mapearDocOpcao(doc)).filter(Boolean);
  return ordenarItensClassificacao(itens);
}

export async function obterClassificacoesAtivasChamados() {
  const [categorias, prioridades, todas] = await Promise.all([
    listarClassificacoesAtivasPorTipo("categoria"),
    listarClassificacoesAtivasPorTipo("prioridade"),
    col()
      .find(
        { tipo: { $in: TIPOS_CLASSIFICACAO_CHAMADO } },
        { projection: { tipo: 1, chave: 1, nome: 1 } },
      )
      .toArray(),
  ]);

  const categoriasValores = categorias.map((item) => item.value);
  const prioridadesValores = prioridades.map((item) => item.value);

  const categoriasLabels = Object.fromEntries(
    (todas || [])
      .filter((doc) => String(doc?.tipo || "").toLowerCase() === "categoria")
      .map((doc) => {
        const chave = normalizarChaveSeguro(doc?.chave);
        if (!chave) return null;
        const nome = limparTexto(doc?.nome) || chave;
        return [chave, nome];
      })
      .filter(Boolean),
  );

  const prioridadesLabels = Object.fromEntries(
    (todas || [])
      .filter((doc) => String(doc?.tipo || "").toLowerCase() === "prioridade")
      .map((doc) => {
        const chave = normalizarChaveSeguro(doc?.chave);
        if (!chave) return null;
        const nome = limparTexto(doc?.nome) || chave;
        return [chave, nome];
      })
      .filter(Boolean),
  );

  return {
    categorias,
    prioridades,
    categoriasValores,
    prioridadesValores,
    categoriasLabels,
    prioridadesLabels,
  };
}

export async function validarClassificacaoAtiva(tipo, chave) {
  const tipoSan = normalizarTipo(tipo);
  const chaveSan = normalizarChave(chave);
  await garantirClassificacoesChamadosBase();

  const existe = await col().findOne(
    { tipo: tipoSan, chave: chaveSan, ativo: true },
    { projection: { _id: 1 } },
  );

  if (!existe) {
    throw new Error(`Selecione uma ${tipoSan} valida.`);
  }

  return chaveSan;
}

export async function listarClassificacoesPaginadoFiltrado(
  { page = 1, limit = 10, filtros = {} } = {},
) {
  await garantirClassificacoesChamadosBase();

  const { page: pageReq, limit: limitReq } = normalizarPaginacao(
    { page, limit },
    { pageDefault: 1, limitDefault: 10, limitMin: 10, limitMax: 200 },
  );

  const tipo = normalizarTipo(filtros?.tipo, { aceitarVazio: true });
  const status = normalizarFiltroStatus(filtros?.status);
  const q = limparTexto(filtros?.q).slice(0, 120);

  const query = {};
  if (tipo) query.tipo = tipo;
  if (status === "ativo") query.ativo = true;
  if (status === "inativo") query.ativo = false;

  if (q) {
    const regex = new RegExp(escaparRegex(q), "i");
    query.$or = [{ nome: regex }, { chave: regex }];
  }

  const docs = await col()
    .find(query)
    .project({
      tipo: 1,
      chave: 1,
      nome: 1,
      ordem: 1,
      ativo: 1,
      sistema: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .toArray();

  const itensOrdenados = ordenarItensClassificacao(
    docs.map((doc) => mapearDocAdmin(doc)).filter(Boolean),
    { incluirTipo: true },
  );

  const pagina = paginarLista(itensOrdenados, {
    page: pageReq,
    limit: limitReq,
  });

  return {
    itens: pagina.itens,
    total: pagina.total,
    page: pagina.page,
    pages: pagina.pages,
    limit: pagina.limit,
  };
}

export async function acharClassificacaoPorIdSeguro(id) {
  await garantirClassificacoesChamadosBase();
  const doc = await acharClassificacaoPorId(id);
  return mapearDocAdmin(doc);
}

export async function criarClassificacaoChamado(dados = {}) {
  await garantirClassificacoesChamadosBase();

  const tipo = normalizarTipo(dados?.tipo);
  const nome = normalizarNome(dados?.nome);
  const chave = normalizarChave(dados?.chave, nome);
  const ordem = normalizarOrdem(dados?.ordem);
  const ativo = normalizarAtivo(dados?.ativo);
  const now = new Date();

  const doc = {
    tipo,
    chave,
    nome,
    ordem,
    ativo,
    sistema: false,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const res = await col().insertOne(doc);
    return mapearDocAdmin({ ...doc, _id: res.insertedId });
  } catch (err) {
    if (err?.code === 11000) {
      throw new Error("Ja existe classificacao com essa chave no mesmo tipo.");
    }
    throw err;
  }
}

export async function atualizarClassificacaoChamado(id, dados = {}) {
  await garantirClassificacoesChamadosBase();
  if (!ObjectId.isValid(id)) throw new Error("Classificacao invalida.");

  const atual = await acharClassificacaoPorId(id);
  if (!atual) throw new Error("Classificacao nao encontrada.");

  const tipo = normalizarTipo(
    typeof dados?.tipo === "undefined" ? atual.tipo : dados.tipo,
  );
  const nome = normalizarNome(
    typeof dados?.nome === "undefined" ? atual.nome : dados.nome,
  );
  const chave = normalizarChave(
    typeof dados?.chave === "undefined" ? atual.chave : dados.chave,
    nome,
  );
  const ordem = normalizarOrdem(
    typeof dados?.ordem === "undefined" ? atual.ordem : dados.ordem,
  );
  const ativo = normalizarAtivo(
    typeof dados?.ativo === "undefined" ? atual.ativo : dados.ativo,
  );

  const atualAtivo = Boolean(atual.ativo);
  const atualTipo = String(atual.tipo || "").trim().toLowerCase();
  const atualChave = normalizarChave(atual.chave);
  const mudouTipo = atualTipo !== tipo;
  const mudouChave = atualChave !== chave;

  if (mudouTipo || mudouChave) {
    const emUso = await pegarDb().collection(COL_CHAMADOS).findOne(
      { [atualTipo]: atualChave },
      { projection: { _id: 1 } },
    );

    if (emUso) {
      throw new Error(
        "Nao e possivel alterar tipo ou chave de classificacao em uso. Crie uma nova e inative a atual.",
      );
    }
  }

  if (atualAtivo && (!ativo || atualTipo !== tipo)) {
    const restantesNoTipoAtual = await contarAtivasPorTipo(atualTipo, {
      excluirId: id,
    });
    if (restantesNoTipoAtual === 0) {
      throw new Error("Mantenha pelo menos uma classificacao ativa por tipo.");
    }
  }

  if (!ativo) {
    const restantesNoNovoTipo = await contarAtivasPorTipo(tipo, {
      excluirId: id,
    });
    if (restantesNoNovoTipo === 0) {
      throw new Error("Mantenha pelo menos uma classificacao ativa por tipo.");
    }
  }

  const now = new Date();
  const _id = new ObjectId(id);

  try {
    await col().updateOne(
      { _id },
      {
        $set: {
          tipo,
          nome,
          chave,
          ordem,
          ativo,
          updatedAt: now,
        },
      },
    );
  } catch (err) {
    if (err?.code === 11000) {
      throw new Error("Ja existe classificacao com essa chave no mesmo tipo.");
    }
    throw err;
  }

  return acharClassificacaoPorIdSeguro(id);
}

export async function excluirClassificacaoChamado(id) {
  await garantirClassificacoesChamadosBase();
  if (!ObjectId.isValid(id)) throw new Error("Classificacao invalida.");

  const _id = new ObjectId(id);
  const atual = await col().findOne({ _id });
  if (!atual) throw new Error("Classificacao nao encontrada.");

  if (Boolean(atual.ativo)) {
    const restantes = await contarAtivasPorTipo(atual.tipo, { excluirId: id });
    if (restantes === 0) {
      throw new Error("Mantenha pelo menos uma classificacao ativa por tipo.");
    }
  }

  const chamadoEmUso = await pegarDb().collection(COL_CHAMADOS).findOne(
    { [atual.tipo]: atual.chave },
    { projection: { _id: 1 } },
  );

  if (chamadoEmUso) {
    throw new Error(
      "Nao foi possivel excluir. Existem chamados usando esta classificacao.",
    );
  }

  await col().deleteOne({ _id });
  return true;
}

export function listarTiposClassificacao() {
  return [
    { value: "categoria", label: "Categoria" },
    { value: "prioridade", label: "Prioridade" },
  ];
}
