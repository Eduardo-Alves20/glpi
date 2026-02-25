import { pegarDb } from "../compartilhado/db/mongo.js";

const COL_BASE_TOPICOS = "base_conhecimento_topicos";

let indicesPromise = null;

function col() {
  return pegarDb().collection(COL_BASE_TOPICOS);
}

async function garantirIndices() {
  if (!indicesPromise) {
    indicesPromise = Promise.all([
      col().createIndex({ slug: 1 }, { unique: true }),
      col().createIndex({ ativo: 1, updatedAt: -1 }),
      col().createIndex({ titulo: "text", resumo: "text", conteudo: "text", tags: "text" }),
      col().createIndex({ "autor.id": 1, createdAt: -1 }),
    ]).catch((err) => {
      indicesPromise = null;
      throw err;
    });
  }
  return indicesPromise;
}

function limparTexto(valor = "", { min = 0, max = 2000, fallback = "" } = {}) {
  const s = String(valor ?? "").replace(/\s+/g, " ").trim();
  const final = s || fallback;
  if (final.length < min) throw new Error(`Campo invalido (min ${min}): ${final.slice(0, 30) || "texto"}`);
  return final.slice(0, max);
}

function limparTextoLivre(valor = "", { min = 0, max = 12000, fallback = "" } = {}) {
  const s = String(valor ?? "").trim();
  const final = s || fallback;
  if (final.length < min) throw new Error(`Campo invalido (min ${min}): conteudo`);
  return final.slice(0, max);
}

function toSlugBase(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 90);
}

function parseTags(raw = "") {
  return Array.from(new Set(
    String(raw || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => t.slice(0, 40))
      .slice(0, 20),
  ));
}

function extrairPassosDeConteudo(conteudo = "") {
  const linhas = String(conteudo || "").split(/\r?\n/g);
  const passos = [];
  for (const linha of linhas) {
    if (passos.length >= 8) break;
    const m = linha.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+?)\s*$/);
    if (!m?.[1]) continue;
    const passo = String(m[1] || "").replace(/\s+/g, " ").trim().slice(0, 220);
    if (passo) passos.push(passo);
  }
  return passos;
}

async function gerarSlugUnico(titulo = "") {
  await garantirIndices();
  const base = `topico-${toSlugBase(titulo) || "base-conhecimento"}`.slice(0, 110);
  let slug = base;
  let idx = 2;
  while (true) {
    const existe = await col().findOne({ slug }, { projection: { _id: 1 } });
    if (!existe) return slug;
    slug = `${base}-${idx}`.slice(0, 118);
    idx += 1;
    if (idx > 500) {
      throw new Error("Nao foi possivel gerar slug unico para o topico.");
    }
  }
}

export async function criarTopicoBaseConhecimento({
  titulo = "",
  categoria = "",
  resumo = "",
  conteudo = "",
  tags = "",
  autor = {},
} = {}) {
  await garantirIndices();

  const tituloSan = limparTexto(titulo, { min: 6, max: 180 });
  const categoriaSan = limparTexto(categoria, { min: 2, max: 60, fallback: "Geral" });
  const resumoSan = limparTexto(resumo, { min: 20, max: 400 });
  const conteudoSan = limparTextoLivre(conteudo, { min: 30, max: 12000 });
  const tagsSan = parseTags(tags);
  const passos = extrairPassosDeConteudo(conteudoSan);
  const slug = await gerarSlugUnico(tituloSan);
  const now = new Date();

  const doc = {
    slug,
    origem: "interna",
    ativo: true,
    titulo: tituloSan,
    categoria: categoriaSan,
    resumo: resumoSan,
    conteudo: conteudoSan,
    passos,
    tags: tagsSan,
    autor: {
      id: String(autor?.id || "").trim().slice(0, 120),
      nome: String(autor?.nome || "").trim().slice(0, 140),
      login: String(autor?.usuario || autor?.login || "").trim().slice(0, 120),
      perfil: String(autor?.perfil || "").trim().toLowerCase().slice(0, 40),
    },
    createdAt: now,
    updatedAt: now,
  };

  const out = await col().insertOne(doc);
  return { ...doc, _id: out.insertedId };
}

export async function listarTopicosBaseConhecimentoAtivos({ limit = 2000 } = {}) {
  await garantirIndices();
  const lim = Math.max(1, Math.min(Number(limit) || 2000, 5000));
  return col()
    .find({ ativo: true })
    .project({
      slug: 1,
      origem: 1,
      titulo: 1,
      categoria: 1,
      resumo: 1,
      conteudo: 1,
      passos: 1,
      tags: 1,
      autor: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(lim)
    .toArray();
}

export async function obterTopicoBaseConhecimentoPorSlug(slug = "") {
  await garantirIndices();
  const slugSan = String(slug || "").trim().toLowerCase().slice(0, 120);
  if (!slugSan) return null;
  return col().findOne({ slug: slugSan, ativo: true });
}
