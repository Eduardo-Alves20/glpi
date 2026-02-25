import { promises as fs } from "fs";
import path from "path";
import { paginarLista } from "./paginacaoService.js";
import { listarTopicosBaseConhecimentoAtivos } from "../repos/baseConhecimentoTopicosRepo.js";

const CACHE_TTL_MS = 60 * 1000;
const MAX_DOCS = 2000;
const MAX_CONTENT_LENGTH = 30000;
const MAX_QUERY_LENGTH = 600;

const STOPWORDS = new Set([
  "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos", "e",
  "em", "na", "nas", "no", "nos", "o", "os", "ou", "para", "por", "se", "sem",
  "um", "uma", "uns", "umas",
]);

const TOKENS_BAIXO_SINAL = new Set([
  "pdf",
  "arquivo",
  "anexo",
  "sistema",
  "problema",
  "erro",
  "ajuda",
  "chamado",
  "usuario",
  "tecnico",
  "tela",
  "pagina",
]);

const TOKENS_INTENCAO_AUTH = new Set([
  "senha",
  "login",
  "credencial",
  "credenciais",
  "autentica",
  "autenticacao",
  "autenticar",
  "invalida",
  "invalido",
  "incorreta",
  "incorreto",
  "bloqueada",
  "bloqueado",
  "esqueci",
  "expirada",
  "expirado",
]);

const TOKENS_SISTEMA = new Set([
  "zimbra",
  "vpn",
  "nuvem",
  "nuvemcge",
  "impressora",
  "wifi",
  "sei",
  "redmine",
  "atena",
  "qlik",
  "sislog",
  "helpdesk",
]);

const TOKENS_AUTH_GENERICO_DOC = [
  "senha",
  "login",
  "acesso",
  "credencial",
  "autentic",
  "helpdesk",
  "suporte",
];

let cache = {
  loadedAt: 0,
  sourceDir: "",
  docs: [],
  bySlug: new Map(),
};

export function invalidarCacheBaseConhecimento() {
  cache = {
    loadedAt: 0,
    sourceDir: "",
    docs: [],
    bySlug: new Map(),
  };
}

function normalizarTexto(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function limparEspacos(valor = "") {
  return String(valor || "").replace(/\s+/g, " ").trim();
}

function tokenizarBusca(valor = "") {
  const tokens = normalizarTexto(valor)
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));

  return Array.from(new Set(tokens)).slice(0, 24);
}

function escaparRegex(texto = "") {
  return String(texto || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function arquivoExiste(caminho) {
  return fs.access(caminho).then(() => true).catch(() => false);
}

async function resolverDiretorioDocsFaq() {
  const override = String(process.env.FAQ_WIKI_DOCS_DIR || "").trim();
  const candidatos = [
    override,
    path.resolve(process.cwd(), "..", "faq_wiki2024", "docs"),
    path.resolve(process.cwd(), "faq_wiki2024", "docs"),
    path.resolve(process.cwd(), "..", "faq-wiki", "docs"),
    path.resolve(process.cwd(), "faq-wiki", "docs"),
  ].filter(Boolean);

  for (const candidato of candidatos) {
    if (await arquivoExiste(candidato)) return candidato;
  }

  return "";
}

async function listarArquivosMarkdown(diretorio, acumulado = []) {
  if (acumulado.length >= MAX_DOCS) return acumulado;
  const itens = await fs.readdir(diretorio, { withFileTypes: true });

  for (const item of itens) {
    if (acumulado.length >= MAX_DOCS) break;
    const caminhoCompleto = path.join(diretorio, item.name);
    if (item.isDirectory()) {
      await listarArquivosMarkdown(caminhoCompleto, acumulado);
      continue;
    }
    if (!item.isFile()) continue;
    if (!item.name.toLowerCase().endsWith(".md")) continue;
    acumulado.push(caminhoCompleto);
  }

  return acumulado;
}

function removerFrontmatter(markdown = "") {
  if (!String(markdown).startsWith("---")) return String(markdown || "");
  return String(markdown).replace(/^---[\s\S]*?---\s*/m, "");
}

function removerMarkdownParaTexto(markdown = "") {
  let txt = removerFrontmatter(markdown);

  txt = txt.replace(/```[\s\S]*?```/g, " ");
  txt = txt.replace(/`([^`]+)`/g, "$1");
  txt = txt.replace(/!\[[^\]]*]\([^)]*\)/g, " ");
  txt = txt.replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1");
  txt = txt.replace(/^\s*:::.*$/gm, " ");
  txt = txt.replace(/^\s*---+\s*$/gm, " ");
  txt = txt.replace(/<[^>]+>/g, " ");
  txt = txt.replace(/^\s*#{1,6}\s*/gm, "");
  txt = txt.replace(/^\s*[-*+]\s+/gm, "");
  txt = txt.replace(/^\s*\d+[.)]\s+/gm, "");
  txt = txt.replace(/\|/g, " ");

  return limparEspacos(txt).slice(0, MAX_CONTENT_LENGTH);
}

function extrairTitulo(markdown = "", fallback = "") {
  const match = String(markdown || "").match(/^\s*#\s+(.+?)\s*$/m);
  if (match?.[1]) return limparEspacos(match[1]).slice(0, 180);
  return limparEspacos(fallback || "Base de conhecimento").slice(0, 180);
}

function extrairResumo(textoPlano = "") {
  const texto = limparEspacos(textoPlano);
  if (!texto) return "Sem resumo disponivel.";
  return texto.slice(0, 320);
}

function extrairPassos(markdown = "") {
  const linhas = String(markdown || "").split(/\r?\n/g);
  const passos = [];

  for (const linha of linhas) {
    if (passos.length >= 6) break;
    const m = linha.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+?)\s*$/);
    if (!m?.[1]) continue;
    const passo = limparEspacos(m[1])
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
      .replace(/[*_`~]/g, "")
      .slice(0, 220);
    if (!passo) continue;
    passos.push(passo);
  }

  return passos;
}

function criarSlugRelativo(relPath = "") {
  return String(relPath || "")
    .replace(/\\/g, "/")
    .replace(/\.md$/i, "")
    .replace(/[^a-zA-Z0-9/_-]/g, "-")
    .replace(/\/+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function categoriaPorRelPath(relPath = "") {
  const normalizado = String(relPath || "").replace(/\\/g, "/");
  const partes = normalizado.split("/");
  if (partes.length <= 1) return "Geral";
  return limparEspacos(partes[0]).slice(0, 60) || "Geral";
}

function mapearDocFaq({ arquivo, baseDir, markdown }) {
  const relPath = path.relative(baseDir, arquivo);
  const nomeArquivo = path.basename(relPath, ".md");
  const slug = criarSlugRelativo(relPath);
  const titulo = extrairTitulo(markdown, nomeArquivo);
  const conteudoPlano = removerMarkdownParaTexto(markdown);
  const resumo = extrairResumo(conteudoPlano);
  const passos = extrairPassos(markdown);
  const categoria = categoriaPorRelPath(relPath);
  const trecho = conteudoPlano.slice(0, 2400);

  return {
    id: slug,
    slug,
    titulo,
    categoria,
    relPath: relPath.replace(/\\/g, "/"),
    resumo,
    passos,
    trecho,
    origem: "faq",
    tags: [],
    sintomas: [],
    perguntas: [],
    autor: null,
    createdAt: null,
    updatedAt: null,
    url: `/base-conhecimento/${encodeURIComponent(slug)}`,
    normalizadoTitulo: normalizarTexto(titulo),
    normalizadoNomeArquivo: normalizarTexto(nomeArquivo),
    normalizadoConteudo: normalizarTexto(`${titulo} ${conteudoPlano}`),
    normalizadoTags: "",
    normalizadoSintomas: "",
    normalizadoPerguntas: "",
  };
}

function tokensFortes(tokens = []) {
  return tokens.filter((t) => t.length >= 4 && !TOKENS_BAIXO_SINAL.has(t));
}

function diagnosticarConsulta(consulta = "", tokens = []) {
  const authIntent = tokens.some((t) => TOKENS_INTENCAO_AUTH.has(t));
  const sistemas = tokens.filter((t) => TOKENS_SISTEMA.has(t));
  return {
    authIntent,
    sistemas,
    ambiguoAuth: authIntent && sistemas.length === 0,
  };
}

function analisarMatchDoc(doc, consulta = "", tokens = [], diagnostico = null) {
  const frase = normalizarTexto(consulta);
  if (!frase || !tokens.length) {
    return {
      score: 0,
      fraseNoTitulo: false,
      fraseNoNome: false,
      hitsTotal: 0,
      hitsFortes: 0,
      forteNoTituloCount: 0,
      coberturaFortes: 0,
      coberturaTotal: 0,
      elegivel: false,
    };
  }

  const fortes = tokensFortes(tokens);
  const setFortes = new Set(fortes);
  let score = 0;
  const fraseNoTitulo = doc.normalizadoTitulo.includes(frase);
  const fraseNoNome = doc.normalizadoNomeArquivo.includes(frase);
  if (fraseNoTitulo) score += 42;
  if (fraseNoNome) score += 24;
  if (doc.normalizadoConteudo.includes(frase)) score += 8;

  let hitsTotal = 0;
  let hitsFortes = 0;
  let forteNoTituloCount = 0;

  tokens.forEach((token) => {
    let tokenEncontrado = false;

    if (doc.normalizadoTitulo.includes(token)) score += 12;
    if (doc.normalizadoNomeArquivo.includes(token)) score += 10;
    if (doc.normalizadoTags?.includes(token)) score += 12;
    if (doc.normalizadoSintomas?.includes(token)) score += 16;
    if (doc.normalizadoPerguntas?.includes(token)) score += 14;
    if (doc.normalizadoTitulo.includes(token) || doc.normalizadoNomeArquivo.includes(token)) {
      tokenEncontrado = true;
      if (setFortes.has(token) && doc.normalizadoTitulo.includes(token)) {
        forteNoTituloCount += 1;
      }
    }

    const rx = new RegExp(`\\b${escaparRegex(token)}\\b`, "g");
    const hits = (doc.normalizadoConteudo.match(rx) || []).length;
    if (hits > 0) tokenEncontrado = true;
    score += Math.min(6, hits) + (setFortes.has(token) && hits > 0 ? 2 : 0);

    if (tokenEncontrado) {
      hitsTotal += 1;
      if (setFortes.has(token)) hitsFortes += 1;
    }
  });

  if (doc.passos.length) score += 2;

  const coberturaFortes = fortes.length ? (hitsFortes / fortes.length) : 0;
  const coberturaTotal = tokens.length ? (hitsTotal / tokens.length) : 0;
  const authIntent = Boolean(diagnostico?.authIntent);
  const ambiguoAuth = Boolean(diagnostico?.ambiguoAuth);
  const sistemasConsulta = Array.isArray(diagnostico?.sistemas) ? diagnostico.sistemas : [];
  const hasAuthMatch = Array.from(TOKENS_INTENCAO_AUTH).some((tk) =>
    doc.normalizadoTitulo.includes(tk)
    || doc.normalizadoConteudo.includes(tk)
    || doc.normalizadoSintomas?.includes(tk)
    || doc.normalizadoPerguntas?.includes(tk));
  const hasSistemaMatch = !sistemasConsulta.length
    ? false
    : sistemasConsulta.some((tk) =>
      doc.normalizadoTitulo.includes(tk)
      || doc.normalizadoNomeArquivo.includes(tk)
      || doc.normalizadoTags?.includes(tk)
      || doc.normalizadoSintomas?.includes(tk)
      || doc.normalizadoPerguntas?.includes(tk));
  const docAuthGenerico = TOKENS_AUTH_GENERICO_DOC.some((tk) =>
    doc.normalizadoTitulo.includes(tk)
    || doc.normalizadoNomeArquivo.includes(tk)
    || doc.normalizadoTags?.includes(tk)
    || doc.normalizadoPerguntas?.includes(tk)
    || doc.normalizadoSintomas?.includes(tk));

  if (authIntent && hasAuthMatch) score += 4;
  if (sistemasConsulta.length) {
    if (hasSistemaMatch) score += 16;
    else score -= 8;
  }

  const elegivel =
    fraseNoTitulo
    || fraseNoNome
    || (forteNoTituloCount >= 1)
    || (hitsFortes >= 2)
    || (hitsFortes >= 1 && hitsTotal >= 2 && score >= 14)
    || (hitsFortes >= 1 && score >= 12)
    || (tokens.length <= 2 && hitsTotal >= 1 && score >= 10)
    || (coberturaFortes >= 0.6 && fortes.length >= 1)
    || (coberturaTotal >= 0.75 && tokens.length >= 3 && score >= 14);

  const elegivelFinal = ambiguoAuth
    ? (elegivel && docAuthGenerico && hasAuthMatch && (hitsFortes >= 1 || hitsTotal >= 2))
    : (sistemasConsulta.length
      ? (elegivel && (hasSistemaMatch || (docAuthGenerico && hasAuthMatch)))
      : elegivel);

  return {
    score,
    fraseNoTitulo,
    fraseNoNome,
    hitsTotal,
    hitsFortes,
    forteNoTituloCount,
    hasAuthMatch,
    hasSistemaMatch,
    docAuthGenerico,
    coberturaFortes,
    coberturaTotal,
    elegivel: elegivelFinal,
  };
}

function mapearTopicoInterno(topico = {}) {
  const slug = String(topico?.slug || "").trim().toLowerCase();
  if (!slug) return null;

  const titulo = limparEspacos(topico?.titulo || "Topico interno");
  const resumo = limparEspacos(topico?.resumo || "");
  const conteudo = limparEspacos(topico?.conteudo || "");
  const tags = Array.isArray(topico?.tags)
    ? topico.tags.map((t) => limparEspacos(t)).filter(Boolean).slice(0, 20)
    : [];
  const sintomas = Array.isArray(topico?.sintomas)
    ? topico.sintomas.map((t) => limparEspacos(t)).filter(Boolean).slice(0, 30)
    : [];
  const perguntas = Array.isArray(topico?.perguntas)
    ? topico.perguntas.map((p) => limparEspacos(p)).filter(Boolean).slice(0, 50)
    : [];
  const passos = Array.isArray(topico?.passos)
    ? topico.passos.map((p) => limparEspacos(p)).filter(Boolean).slice(0, 8)
    : [];

  const conteudoPlano = `${titulo} ${resumo} ${conteudo} ${tags.join(" ")} ${sintomas.join(" ")} ${perguntas.join(" ")}`.slice(0, MAX_CONTENT_LENGTH);
  const trecho = conteudoPlano.slice(0, 2400);
  const categoria = limparEspacos(topico?.categoria || "Geral").slice(0, 60) || "Geral";
  const nomeArquivo = slug;

  return {
    id: slug,
    slug,
    titulo,
    categoria,
    relPath: `interno/${slug}.md`,
    resumo: resumo || extrairResumo(conteudoPlano),
    passos,
    trecho,
    origem: "interna",
    tags,
    sintomas,
    perguntas,
    autor: topico?.autor || null,
    createdAt: topico?.createdAt || null,
    updatedAt: topico?.updatedAt || null,
    url: `/base-conhecimento/${encodeURIComponent(slug)}`,
    normalizadoTitulo: normalizarTexto(titulo),
    normalizadoNomeArquivo: normalizarTexto(nomeArquivo),
    normalizadoConteudo: normalizarTexto(`${titulo} ${conteudoPlano}`),
    normalizadoTags: normalizarTexto(tags.join(" ")),
    normalizadoSintomas: normalizarTexto(sintomas.join(" ")),
    normalizadoPerguntas: normalizarTexto(perguntas.join(" ")),
  };
}

async function carregarBaseConhecimento(force = false) {
  const now = Date.now();
  if (!force && cache.loadedAt && (now - cache.loadedAt) < CACHE_TTL_MS) return cache;

  const sourceDir = await resolverDiretorioDocsFaq();
  const docsFaq = [];
  if (sourceDir) {
    const arquivos = await listarArquivosMarkdown(sourceDir, []);
    for (const arquivo of arquivos) {
      const markdown = await fs.readFile(arquivo, "utf8");
      const doc = mapearDocFaq({ arquivo, baseDir: sourceDir, markdown });
      if (!doc.slug) continue;
      docsFaq.push(doc);
    }
  }

  const topicosInternosRaw = await listarTopicosBaseConhecimentoAtivos({ limit: 2000 })
    .catch(() => []);
  const docsInternos = (topicosInternosRaw || [])
    .map((topico) => mapearTopicoInterno(topico))
    .filter(Boolean);

  const docs = [...docsFaq, ...docsInternos];
  docs.sort((a, b) =>
    String(a.titulo || "").localeCompare(String(b.titulo || ""), "pt-BR", { sensitivity: "base" }));

  const bySlug = new Map(docs.map((d) => [d.slug, d]));
  cache = { loadedAt: now, sourceDir: sourceDir || "", docs, bySlug };
  return cache;
}

export async function obterStatsBaseConhecimento() {
  const base = await carregarBaseConhecimento(false);
  const porCategoria = new Map();
  (base.docs || []).forEach((d) => {
    const key = d.categoria || "Geral";
    porCategoria.set(key, Number(porCategoria.get(key) || 0) + 1);
  });

  return {
    total: base.docs.length,
    categorias: Array.from(porCategoria.entries())
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total),
  };
}

export async function buscarSugestoesBaseConhecimento({ q = "", limit = 5 } = {}) {
  const consulta = limparEspacos(q).slice(0, MAX_QUERY_LENGTH);
  const lim = Math.max(1, Math.min(Number(limit) || 5, 20));
  if (consulta.length < 6) return [];

  const base = await carregarBaseConhecimento(false);
  const tokens = tokenizarBusca(consulta);
  if (!tokens.length) return [];
  const diagnostico = diagnosticarConsulta(consulta, tokens);

  const ranqueados = (base.docs || [])
    .map((doc) => ({ doc, match: analisarMatchDoc(doc, consulta, tokens, diagnostico) }))
    .filter((item) => item.match && item.match.score > 0)
    .sort((a, b) => b.match.score - a.match.score);

  const elegiveis = ranqueados
    .filter((item) => item.match.elegivel)
    .slice(0, lim);

  const fallback = !elegiveis.length
    ? ranqueados
      .filter((item) =>
        item.match.score >= 10
        && (!diagnostico.ambiguoAuth || item.match.docAuthGenerico)
        && (
          item.match.hitsFortes >= 1
          || item.match.forteNoTituloCount >= 1
          || (item.match.hitsTotal >= 2 && !diagnostico.ambiguoAuth)
        ))
      .slice(0, lim)
    : [];

  const listaFinal = elegiveis.length ? elegiveis : fallback;

  return listaFinal
    .map(({ doc, match }) => ({
      slug: doc.slug,
      titulo: doc.titulo,
      categoria: doc.categoria,
      resumo: doc.resumo,
      passos: doc.passos,
      url: doc.url,
      origem: doc.origem || "faq",
      score: match.score,
    }));
}

export async function listarBaseConhecimento({
  q = "",
  page = 1,
  limit = 10,
} = {}) {
  const consulta = limparEspacos(q).slice(0, MAX_QUERY_LENGTH);
  const lim = Math.max(5, Math.min(Number(limit) || 10, 200));
  const pg = Math.max(1, Number(page) || 1);
  const base = await carregarBaseConhecimento(false);
  const tokens = tokenizarBusca(consulta);
  const diagnostico = diagnosticarConsulta(consulta, tokens);

  let lista = [...(base.docs || [])];
  if (consulta && tokens.length) {
    const ranqueados = lista
      .map((doc) => {
        const match = analisarMatchDoc(doc, consulta, tokens, diagnostico);
        return {
          ...doc,
          _score: Number(match?.score || 0),
          _elegivel: Boolean(match?.elegivel),
          _hitsFortes: Number(match?.hitsFortes || 0),
          _forteNoTitulo: Number(match?.forteNoTituloCount || 0),
          _hitsTotal: Number(match?.hitsTotal || 0),
          _docAuthGenerico: Boolean(match?.docAuthGenerico),
        };
      })
      .filter((doc) => doc._score > 0)
      .sort((a, b) => b._score - a._score);

    const elegiveis = ranqueados.filter((doc) => doc._elegivel);
    if (elegiveis.length) {
      lista = elegiveis;
    } else {
      lista = ranqueados.filter((doc) =>
        doc._score >= 10
        && (!diagnostico.ambiguoAuth || doc._docAuthGenerico)
        && (
          doc._hitsFortes >= 1
          || doc._forteNoTitulo >= 1
          || (doc._hitsTotal >= 2 && !diagnostico.ambiguoAuth)
        ));
    }
  }

  const pag = paginarLista(lista, { page: pg, limit: lim });
  return {
    itens: pag.itens.map((doc) => ({
      slug: doc.slug,
      titulo: doc.titulo,
      categoria: doc.categoria,
      resumo: doc.resumo,
      passos: doc.passos,
      url: doc.url,
      origem: doc.origem || "faq",
      tags: Array.isArray(doc.tags) ? doc.tags : [],
    })),
    paginacao: {
      total: pag.total,
      page: pag.page,
      pages: pag.pages,
      limit: pag.limit,
    },
    totalBase: base.docs.length,
  };
}

export function obterOrientacaoBuscaBaseConhecimento({ q = "", itens = [] } = {}) {
  const consulta = limparEspacos(q).slice(0, MAX_QUERY_LENGTH);
  const tokens = tokenizarBusca(consulta);
  const diagnostico = diagnosticarConsulta(consulta, tokens);
  const total = Array.isArray(itens) ? itens.length : 0;

  if (total > 0) return "";

  if (diagnostico.ambiguoAuth) {
    return "Identificamos falha de autenticacao. Informe o sistema (ex.: Zimbra, VPN, Nuvem, SEI) para direcionar melhor a solucao.";
  }
  if (tokens.length < 3) {
    return "Descreva mais detalhes: sistema, mensagem exata de erro e quando acontece.";
  }
  return "Sem sugestao precisa com esse texto. Tente incluir sistema afetado e erro exato.";
}

export async function obterArtigoBaseConhecimento(slug = "") {
  const id = String(slug || "").trim().toLowerCase();
  if (!id) return null;
  const base = await carregarBaseConhecimento(false);
  const doc = base.bySlug.get(id);
  if (!doc) return null;

  return {
    slug: doc.slug,
    titulo: doc.titulo,
    categoria: doc.categoria,
    resumo: doc.resumo,
    passos: doc.passos,
    trecho: doc.trecho,
    origem: doc.origem || "faq",
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    autor: doc.autor || null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
    url: doc.url,
    relPath: doc.relPath,
  };
}
