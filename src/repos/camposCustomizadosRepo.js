import { ObjectId } from "mongodb";
import { pegarDb } from "../compartilhado/db/mongo.js";

const COL_CAMPOS_CUSTOMIZADOS = "campos_customizados";

export const ENTIDADES_CAMPOS_CUSTOMIZADOS = Object.freeze(["usuario", "chamado"]);
export const TIPOS_CAMPOS_CUSTOMIZADOS = Object.freeze([
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "checkbox",
]);

function col() {
  return pegarDb().collection(COL_CAMPOS_CUSTOMIZADOS);
}

function texto(value, { min = 0, max = 120, fallback = "" } = {}) {
  const s = String(value ?? "").trim();
  if (!s) return fallback;
  if (s.length < min) throw new Error("Campo de texto invalido.");
  return s.slice(0, max);
}

function normalizarEntidade(value) {
  const entidade = texto(value, { max: 20 }).toLowerCase();
  if (!ENTIDADES_CAMPOS_CUSTOMIZADOS.includes(entidade)) {
    throw new Error("Entidade invalida para campo customizado.");
  }
  return entidade;
}

function normalizarTipo(value) {
  const tipo = texto(value, { max: 20 }).toLowerCase();
  if (!TIPOS_CAMPOS_CUSTOMIZADOS.includes(tipo)) {
    throw new Error("Tipo de campo customizado invalido.");
  }
  return tipo;
}

function normalizarChave(value) {
  const chave = texto(value, { min: 2, max: 40 }).toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(chave)) {
    throw new Error("Chave invalida. Use apenas letras, numeros e underscore.");
  }
  return chave;
}

function normalizarRotulo(value) {
  return texto(value, { min: 2, max: 80 });
}

function normalizarOpcaoValor(value) {
  const base = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\- ]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!base) return "";
  return base.slice(0, 40);
}

function normalizarOpcoes(raw = "", tipo = "text") {
  if (tipo !== "select") return [];

  const linhas = String(raw || "")
    .split(/\r?\n|,/)
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 80);

  const usadas = new Set();
  const opcoes = [];

  linhas.forEach((linha) => {
    const [valorRaw, rotuloRaw] = linha.includes(":")
      ? linha.split(":")
      : [linha, linha];

    const valor = normalizarOpcaoValor(valorRaw);
    const rotulo = texto(rotuloRaw, { min: 1, max: 80, fallback: valorRaw });
    if (!valor || usadas.has(valor)) return;

    usadas.add(valor);
    opcoes.push({ valor, rotulo });
  });

  if (!opcoes.length) {
    throw new Error("Campos do tipo selecao exigem pelo menos uma opcao valida.");
  }

  return opcoes;
}

function normalizarPayloadCadastro(payload = {}) {
  const tipo = normalizarTipo(payload.tipo);
  const ordem = Number(payload.ordem);

  const out = {
    entidade: normalizarEntidade(payload.entidade),
    chave: normalizarChave(payload.chave),
    rotulo: normalizarRotulo(payload.rotulo),
    tipo,
    obrigatorio: Boolean(payload.obrigatorio),
    ativo: payload.ativo !== false,
    ordem: Number.isFinite(ordem) ? Math.max(0, Math.min(Math.trunc(ordem), 9999)) : 100,
    placeholder: texto(payload.placeholder, { max: 120 }),
    ajuda: texto(payload.ajuda, { max: 220 }),
    opcoes: normalizarOpcoes(payload.opcoes, tipo),
  };

  return out;
}

function mapearCampo(doc = {}) {
  return {
    id: String(doc._id || ""),
    entidade: String(doc.entidade || ""),
    chave: String(doc.chave || ""),
    rotulo: String(doc.rotulo || ""),
    tipo: String(doc.tipo || "text"),
    obrigatorio: Boolean(doc.obrigatorio),
    ativo: Boolean(doc.ativo !== false),
    ordem: Number(doc.ordem || 100),
    placeholder: String(doc.placeholder || ""),
    ajuda: String(doc.ajuda || ""),
    opcoes: Array.isArray(doc.opcoes)
      ? doc.opcoes
          .map((item) => ({
            valor: String(item?.valor || "").trim(),
            rotulo: String(item?.rotulo || "").trim(),
          }))
          .filter((item) => item.valor && item.rotulo)
      : [],
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

export async function listarCamposCustomizados(
  entidade,
  { somenteAtivos = false } = {},
) {
  const filtro = { entidade: normalizarEntidade(entidade) };
  if (somenteAtivos) filtro.ativo = true;

  const docs = await col()
    .find(filtro)
    .sort({ ordem: 1, rotulo: 1, createdAt: 1 })
    .toArray();

  return docs.map(mapearCampo);
}

export async function listarTodosCamposCustomizados() {
  const docs = await col()
    .find({})
    .sort({ entidade: 1, ordem: 1, rotulo: 1 })
    .toArray();
  return docs.map(mapearCampo);
}

export async function criarCampoCustomizado(payload = {}, usuario = null) {
  const dados = normalizarPayloadCadastro(payload);
  const now = new Date();

  const doc = {
    ...dados,
    createdAt: now,
    updatedAt: now,
    criadoPor: {
      id: String(usuario?.id || ""),
      login: String(usuario?.usuario || ""),
      nome: String(usuario?.nome || ""),
    },
  };

  try {
    const out = await col().insertOne(doc);
    return mapearCampo({ ...doc, _id: out.insertedId });
  } catch (err) {
    if (err?.code === 11000) {
      throw new Error("Ja existe um campo com essa chave para essa entidade.");
    }
    throw err;
  }
}

export async function atualizarStatusCampoCustomizado(campoId, ativo) {
  const id = String(campoId || "").trim();
  if (!ObjectId.isValid(id)) throw new Error("Campo customizado invalido.");

  const now = new Date();
  const out = await col().findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ativo: Boolean(ativo), updatedAt: now } },
    { returnDocument: "after", returnOriginal: false },
  );

  const doc = out?.value ?? out ?? null;
  if (!doc?._id) throw new Error("Campo customizado nao encontrado.");
  return mapearCampo(doc);
}

export async function excluirCampoCustomizado(campoId) {
  const id = String(campoId || "").trim();
  if (!ObjectId.isValid(id)) throw new Error("Campo customizado invalido.");

  const out = await col().findOneAndDelete({ _id: new ObjectId(id) });
  const doc = out?.value ?? out ?? null;
  if (!doc?._id) throw new Error("Campo customizado nao encontrado.");
  return mapearCampo(doc);
}

export async function garantirIndicesCamposCustomizados() {
  await col().createIndex({ entidade: 1, chave: 1 }, { unique: true });
  await col().createIndex({ entidade: 1, ativo: 1, ordem: 1 });
}
