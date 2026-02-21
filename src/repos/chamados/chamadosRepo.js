import { ObjectId } from "mongodb";
import { pegarDb } from "../../compartilhado/db/mongo.js";

const COL_CHAMADOS = "chamados";
const COL_COUNTERS = "counters";

/**
 * Valida string obrigatória e limita tamanho.
 */
function assertString(v, field, { min = 1, max = 5000 } = {}) {
  const s = String(v ?? "").trim();
  if (s.length < min) throw new Error(`Campo inválido: ${field}`);
  if (s.length > max) throw new Error(`Campo muito grande: ${field}`);
  return s;
}

/**
 * Valida enum com allowlist.
 */
function sanitizeEnum(v, allowed, field) {
  const s = String(v ?? "").trim();
  if (!allowed.includes(s)) throw new Error(`Campo inválido: ${field}`);
  return s;
}

/**
 * Gera número sequencial do chamado 
 * Usa coleção "counters" com documento {_id:"chamado_numero", seq:<n>}.
 */
export async function meusChamadosGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;

  try {
    const lista = await listarMeusChamados(usuarioSessao?.id, { limit: 50 });

    const chamados = (lista || []).map((c) => ({
      id: String(c._id),
      numero: c.numero,
      titulo: c.titulo,
      categoria: c.categoria || "—",
      prioridade: c.prioridade || "—",
      status: c.status || "—",
      quando: c.createdAt ? new Date(c.createdAt).toLocaleString("pt-BR") : "—",
    }));

    return res.render("chamados/meus", {
      layout: "layout-app",
      titulo: "Meus chamados",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamados.css",
      usuarioSessao,
      chamados,
    });
  } catch (e) {
    console.error("Erro ao listar meus chamados:", e);
    return res.status(500).render("chamados/meus", {
      layout: "layout-app",
      titulo: "Meus chamados",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamados.css",
      usuarioSessao,
      chamados: [],
      erroGeral: "Não foi possível carregar seus chamados.",
    });
  }
}



/**
 * Cria um chamado.
 * - Segurança: validação + allowlist + ObjectId
 * - Consistência: numero sequencial + índice unique recomendado
 */
export async function criarChamado({
  usuarioId,
  usuarioNome,
  usuarioLogin,
  titulo,
  descricao,
  categoria,
  prioridade,
} = {}) {
  const db = pegarDb();

  if (!ObjectId.isValid(usuarioId)) throw new Error("Usuário inválido.");

  const tituloSan = assertString(titulo, "titulo", { min: 6, max: 120 });
  const descSan = assertString(descricao, "descricao", { min: 20, max: 5000 });

  const categoriaSan = sanitizeEnum(
    categoria,
    ["acesso", "incidente", "solicitacao", "infra", "outros"],
    "categoria"
  );

  const prioridadeSan = sanitizeEnum(
    prioridade,
    ["baixa", "media", "alta", "critica"],
    "prioridade"
  );

  const now = new Date();
  const numero = await nextChamadoNumero(db);

  const doc = {
    numero,
    titulo: tituloSan,
    descricao: descSan,
    categoria: categoriaSan,
    prioridade: prioridadeSan,

    status: "aberto",

    criadoPor: {
      usuarioId: new ObjectId(usuarioId),
      nome: String(usuarioNome || "").trim(),
      login: String(usuarioLogin || "").trim(),
    },

    responsavelId: null,

    historico: [
      {
        tipo: "criacao",
        em: now,
        por: String(usuarioLogin || "sistema"),
        mensagem: "Chamado criado",
      },
    ],

    createdAt: now,
    updatedAt: now,
  };

  try {
    const r = await db.collection(COL_CHAMADOS).insertOne(doc);
    return { ...doc, _id: r.insertedId };
  } catch (err) {
    throw err;
  }
}

/**
 * Lista chamados do usuário logado.
 */
export async function listarMeusChamados(usuarioId, { limit = 50 } = {}) {
  const db = pegarDb();
  if (!ObjectId.isValid(usuarioId)) return [];

  const lim = Math.max(1, Math.min(Number(limit) || 50, 200));

  return db
    .collection(COL_CHAMADOS)
    .find({ "criadoPor.usuarioId": new ObjectId(usuarioId) })
    .project({
      numero: 1,
      titulo: 1,
      status: 1,
      createdAt: 1,
      prioridade: 1,
      categoria: 1,
    })
    .sort({ createdAt: -1 })
    .limit(lim)
    .toArray();
}


export async function garantirIndicesChamados() {
  const db = pegarDb();

  // NÃO criar índice em _id — já existe e já é unique por padrão.

  // garante que "numero" nunca repete
  await db.collection(COL_CHAMADOS).createIndex({ numero: 1 }, { unique: true });

  // performance para listagem
  await db
    .collection(COL_CHAMADOS)
    .createIndex({ "criadoPor.usuarioId": 1, createdAt: -1 });
}





async function nextChamadoNumero(db) {
  const res = await db.collection(COL_COUNTERS).findOneAndUpdate(
    { _id: "chamado_numero" },
    { $inc: { seq: 1 } },
    {
      upsert: true,
      returnDocument: "after",
      returnOriginal: false, // compat
    }
  );

  const doc = res?.value ?? res;
  const seq = doc?.seq;

  if (typeof seq !== "number" || !Number.isFinite(seq) || seq < 1) {
    throw new Error("Falha ao gerar número do chamado.");
  }

  return seq;
}

