import { promises as fs } from "fs";
import path from "path";
import { paginarLista } from "./paginacaoService.js";

const CACHE_TTL_MS = 60 * 1000;
const MAX_DOCS = 2000;
const MAX_CONTENT_LENGTH = 30000;

const STOPWORDS = new Set([
  "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos", "e",
  "em", "na", "nas", "no", "nos", "o", "os", "ou", "para", "por", "se", "sem",
  "um", "uma", "uns", "umas",
]);

let cache = {
  loadedAt: 0,
  sourceDir: "",
  docs: [],
  bySlug: new Map(),
};

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
  return normalizarTexto(valor)
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
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
    url: `/base-conhecimento/${encodeURIComponent(slug)}`,
    normalizadoTitulo: normalizarTexto(titulo),
    normalizadoNomeArquivo: normalizarTexto(nomeArquivo),
    normalizadoConteudo: normalizarTexto(`${titulo} ${conteudoPlano}`),
  };
}

function scoreDoc(doc, consulta = "", tokens = []) {
  const frase = normalizarTexto(consulta);
  if (!frase || !tokens.length) return 0;

  let score = 0;
  if (doc.normalizadoTitulo.includes(frase)) score += 30;
  if (doc.normalizadoNomeArquivo.includes(frase)) score += 20;
  if (doc.normalizadoConteudo.includes(frase)) score += 8;

  tokens.forEach((token) => {
    if (doc.normalizadoTitulo.includes(token)) score += 10;
    if (doc.normalizadoNomeArquivo.includes(token)) score += 8;

    const rx = new RegExp(`\\b${escaparRegex(token)}\\b`, "g");
    const hits = (doc.normalizadoConteudo.match(rx) || []).length;
    score += Math.min(6, hits);
  });

  if (doc.passos.length) score += 2;
  return score;
}

async function carregarBaseConhecimento(force = false) {
  const now = Date.now();
  if (!force && cache.loadedAt && (now - cache.loadedAt) < CACHE_TTL_MS) return cache;

  const sourceDir = await resolverDiretorioDocsFaq();
  if (!sourceDir) {
    cache = { loadedAt: now, sourceDir: "", docs: [], bySlug: new Map() };
    return cache;
  }

  const arquivos = await listarArquivosMarkdown(sourceDir, []);
  const docs = [];

  for (const arquivo of arquivos) {
    const markdown = await fs.readFile(arquivo, "utf8");
    const doc = mapearDocFaq({ arquivo, baseDir: sourceDir, markdown });
    if (!doc.slug) continue;
    docs.push(doc);
  }

  docs.sort((a, b) =>
    String(a.titulo || "").localeCompare(String(b.titulo || ""), "pt-BR", { sensitivity: "base" }));

  const bySlug = new Map(docs.map((d) => [d.slug, d]));
  cache = { loadedAt: now, sourceDir, docs, bySlug };
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
  const consulta = limparEspacos(q);
  const lim = Math.max(1, Math.min(Number(limit) || 5, 20));
  if (consulta.length < 6) return [];

  const base = await carregarBaseConhecimento(false);
  const tokens = tokenizarBusca(consulta);
  if (!tokens.length) return [];

  return (base.docs || [])
    .map((doc) => ({ doc, score: scoreDoc(doc, consulta, tokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, lim)
    .map(({ doc, score }) => ({
      slug: doc.slug,
      titulo: doc.titulo,
      categoria: doc.categoria,
      resumo: doc.resumo,
      passos: doc.passos,
      url: doc.url,
      score,
    }));
}

export async function listarBaseConhecimento({
  q = "",
  page = 1,
  limit = 10,
} = {}) {
  const consulta = limparEspacos(q);
  const lim = Math.max(5, Math.min(Number(limit) || 10, 200));
  const pg = Math.max(1, Number(page) || 1);
  const base = await carregarBaseConhecimento(false);
  const tokens = tokenizarBusca(consulta);

  let lista = [...(base.docs || [])];
  if (consulta && tokens.length) {
    lista = lista
      .map((doc) => ({ ...doc, _score: scoreDoc(doc, consulta, tokens) }))
      .filter((doc) => doc._score > 0)
      .sort((a, b) => b._score - a._score);
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
    url: doc.url,
    relPath: doc.relPath,
  };
}
