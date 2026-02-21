import { ObjectId } from "mongodb";
import { pegarDb } from "../../compartilhado/db/mongo.js";

const COL_CHAMADOS = "chamados";
const COL_COUNTERS = "counters";

const STATUS_ALLOWED = ["aberto", "em_atendimento", "resolvido", "fechado"];
const CATEGORIAS_ALLOWED = ["acesso", "incidente", "solicitacao", "infra", "outros"];
const PRIORIDADES_ALLOWED = ["baixa", "media", "alta", "critica"];

/** helpers */
function assertString(v, field, { min = 1, max = 5000 } = {}) {
  const s = String(v ?? "").trim();
  if (s.length < min) throw new Error(`Campo inválido: ${field}`);
  if (s.length > max) throw new Error(`Campo muito grande: ${field}`);
  return s;
}

function sanitizeEnum(v, allowed, field) {
  const s = String(v ?? "").trim();
  if (!allowed.includes(s)) throw new Error(`Campo inválido: ${field}`);
  return s;
}

function toObjectId(id, field = "id") {
  const s = String(id ?? "").trim();
  if (!ObjectId.isValid(s)) throw new Error(`Campo inválido: ${field}`);
  return new ObjectId(s);
}

async function nextChamadoNumero(db) {
  const res = await db.collection(COL_COUNTERS).findOneAndUpdate(
    { _id: "chamado_numero" },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after", returnOriginal: false }
  );

  const doc = res?.value ?? res;
  const seq = doc?.seq;

  if (typeof seq !== "number" || !Number.isFinite(seq) || seq < 1) {
    throw new Error("Falha ao gerar número do chamado.");
  }
  return seq;
}

/**
 * Cria um chamado (status default: aberto)
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

  const userOid = toObjectId(usuarioId, "usuarioId");

  const tituloSan = assertString(titulo, "titulo", { min: 6, max: 120 });
  const descSan = assertString(descricao, "descricao", { min: 20, max: 5000 });

  const categoriaSan = sanitizeEnum(categoria, CATEGORIAS_ALLOWED, "categoria");
  const prioridadeSan = sanitizeEnum(prioridade, PRIORIDADES_ALLOWED, "prioridade");

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
      usuarioId: userOid,
      nome: String(usuarioNome || "").trim(),
      login: String(usuarioLogin || "").trim(),
    },

    // atribuição (técnico)
    responsavelId: null,
    responsavelNome: "",
    responsavelLogin: "",

    // datas de ciclo
    atendidoEm: null,
    resolvidoEm: null,
    fechadoEm: null,

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

  const r = await db.collection(COL_CHAMADOS).insertOne(doc);
  return { ...doc, _id: r.insertedId };
}

/**
 * Lista chamados do usuário logado (somente dele)
 * Projeção mínima e limite defensivo.
 */
export async function listarMeusChamados(usuarioId, { limit = 50 } = {}) {
  return listarChamados({ solicitanteId: usuarioId, limit });
}

/**
 * Buscar chamado por id (uso interno)
 */
export async function acharChamadoPorId(chamadoId) {
  const db = pegarDb();
  if (!ObjectId.isValid(String(chamadoId))) return null;

  return db.collection(COL_CHAMADOS).findOne({ _id: new ObjectId(String(chamadoId)) });
}

/**
 * Buscar chamado por id garantindo ownership do usuário
 */
export async function acharChamadoPorIdDoUsuario(chamadoId, usuarioId) {
  const db = pegarDb();
  if (!ObjectId.isValid(String(chamadoId)) || !ObjectId.isValid(String(usuarioId))) return null;

  return db.collection(COL_CHAMADOS).findOne({
    _id: new ObjectId(String(chamadoId)),
    "criadoPor.usuarioId": new ObjectId(String(usuarioId)),
  });
}

/**
 * Usuário pode editar somente se status=aberto (profissional)
 * Campos allowlist: titulo, descricao, categoria
 */
export async function atualizarChamadoDoUsuario(
  chamadoId,
  usuarioId,
  patch = {},
  { porLogin = "sistema" } = {}
) {
  const db = pegarDb();

  if (!ObjectId.isValid(String(chamadoId))) throw new Error("Chamado inválido.");
  if (!ObjectId.isValid(String(usuarioId))) throw new Error("Usuário inválido.");

  const _id = new ObjectId(String(chamadoId));
  const u = new ObjectId(String(usuarioId));

  // allowlist
  const allowed = {};
  if (typeof patch.titulo === "string") allowed.titulo = patch.titulo.trim();
  if (typeof patch.descricao === "string") allowed.descricao = patch.descricao.trim();
  if (typeof patch.categoria === "string") allowed.categoria = patch.categoria.trim();

  const campos = Object.keys(allowed);
  if (!campos.length) throw new Error("Nada para atualizar.");

  // validações (usa seus helpers)
  if (allowed.titulo) assertString(allowed.titulo, "titulo", { min: 6, max: 120 });
  if (allowed.descricao) assertString(allowed.descricao, "descricao", { min: 20, max: 5000 });
  if (allowed.categoria) sanitizeEnum(allowed.categoria, CATEGORIAS_ALLOWED, "categoria");

  const now = new Date();

  const filtro = {
    _id,
    "criadoPor.usuarioId": u,
    status: "aberto",
  };

  const update = {
    $set: { ...allowed, updatedAt: now },
    $push: {
      historico: {
        tipo: "edicao",
        em: now,
        por: String(porLogin || "sistema"),
        mensagem: "Usuário editou o chamado",
        meta: { campos },
      },
    },
  };

  const r = await db.collection(COL_CHAMADOS).updateOne(filtro, update);

  // ✅ se bateu no documento, não lança erro (mesmo se modifiedCount=0)
  // modifiedCount pode ser 0 se você salvou exatamente os mesmos valores.
  if (r.matchedCount === 1) {
    return db.collection(COL_CHAMADOS).findOne({ _id });
  }

  // Diagnóstico seguro (só dentro do ownership)
  const existeDoUsuario = await db.collection(COL_CHAMADOS).findOne(
    { _id, "criadoPor.usuarioId": u },
    { projection: { status: 1 } }
  );

  if (!existeDoUsuario) throw new Error("Chamado não encontrado.");
  if (existeDoUsuario.status !== "aberto") {
    throw new Error("Este chamado não pode mais ser editado (status diferente de aberto).");
  }

  throw new Error("Edição não permitida.");
}

/**
 * Fila (para técnico/admin): status aberto/em_atendimento
 */
export async function listarChamados({
  status = null,          // ex: ["aberto","em_atendimento"]
  solicitanteId = null,   // criadoPor.usuarioId
  responsavelId = null,   // responsavelId
  limit = 50,
} = {}) {
  const db = pegarDb();

  const filtro = {};

  // status (allowlist)
  if (Array.isArray(status) && status.length) {
    const st = status
      .map((s) => String(s).trim())
      .filter((s) => STATUS_ALLOWED.includes(s));

    if (st.length) filtro.status = { $in: st };
  }

  // solicitante (ownership)
  if (solicitanteId !== null && solicitanteId !== undefined) {
    const s = String(solicitanteId).trim();
    if (!ObjectId.isValid(s)) return [];
    filtro["criadoPor.usuarioId"] = new ObjectId(s);
  }

  // responsável (técnico)
  if (responsavelId !== null && responsavelId !== undefined) {
    const s = String(responsavelId).trim();
    if (!ObjectId.isValid(s)) return [];
    filtro.responsavelId = new ObjectId(s);
  }

  const lim = Math.max(1, Math.min(Number(limit) || 50, 200));

  return db
    .collection(COL_CHAMADOS)
    .find(filtro)
    .project({
      numero: 1,
      titulo: 1,
      status: 1,
      createdAt: 1,
      prioridade: 1,
      categoria: 1,

      // quem abriu
      "criadoPor.nome": 1,
      "criadoPor.login": 1,

      // atribuição
      responsavelId: 1,
      responsavelNome: 1,
      responsavelLogin: 1,
    })
    .sort({ createdAt: -1 })
    .limit(lim)
    .toArray();
}

/**
 * Wrapper: lista chamados atribuídos ao técnico (meus atendimentos)
 */
export async function listarMeusAtendimentos(tecnicoId, { limit = 50 } = {}) {
  return listarChamados({ responsavelId: tecnicoId, limit });
}

/**
 * Wrapper: fila (abertos + em atendimento)
 * Mantém seu caso de uso original.
 */
export async function listarFilaChamados({ status = ["aberto", "em_atendimento"], limit = 50 } = {}) {
  return listarChamados({ status, limit });
}

/**
 * Técnico assume o chamado: seta responsavel e status em_atendimento
 * Regra: pode assumir se estava sem responsável ou já era dele.
 */
export async function assumirChamado(chamadoId, tecnico, { porLogin = "sistema" } = {}) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  const tId = toObjectId(tecnico?.id, "tecnicoId");

  const now = new Date();

  const r = await db.collection(COL_CHAMADOS).findOneAndUpdate(
    {
      _id,
      status: { $in: ["aberto", "em_atendimento"] },
      $or: [{ responsavelId: null }, { responsavelId: tId }],
    },
    {
      $set: {
        status: "em_atendimento",
        responsavelId: tId,
        responsavelNome: String(tecnico?.nome || "").trim(),
        responsavelLogin: String(tecnico?.usuario || tecnico?.login || "").trim(),
        atendidoEm: now,
        updatedAt: now,
      },
      $push: {
        historico: {
          tipo: "atribuicao",
          em: now,
          por: String(porLogin || "sistema"),
          mensagem: "Chamado assumido",
          meta: { responsavelId: String(tId) },
        },
      },
    },
    { returnDocument: "after" }
  );

  if (!r.value) throw new Error("Não foi possível assumir este chamado.");
  return r.value;
}

/**
 * Técnico resolve: só se status em_atendimento e responsável = técnico
 */
export async function resolverChamado(chamadoId, tecnicoId, { porLogin = "sistema" } = {}) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  const tId = toObjectId(tecnicoId, "tecnicoId");

  const now = new Date();

  const r = await db.collection(COL_CHAMADOS).findOneAndUpdate(
    { _id, status: "em_atendimento", responsavelId: tId },
    {
      $set: { status: "resolvido", resolvidoEm: now, updatedAt: now },
      $push: {
        historico: {
          tipo: "status",
          em: now,
          por: String(porLogin || "sistema"),
          mensagem: "Chamado resolvido",
        },
      },
    },
    { returnDocument: "after" }
  );

  if (!r.value) throw new Error("Não foi possível resolver este chamado.");
  return r.value;
}
export async function contarChamados({
  status = null,          // string ou array
  responsavelId = null,   // tecnicoId
  somenteSemResponsavel = false,
  createdFrom = null,
  createdTo = null,
  updatedFrom = null,
  updatedTo = null,
} = {}) {
  const db = pegarDb();
  const filtro = {};

  // status allowlist
  if (typeof status === "string") {
    const s = status.trim();
    if (STATUS_ALLOWED.includes(s)) filtro.status = s;
  } else if (Array.isArray(status) && status.length) {
    const st = status.map((s) => String(s).trim()).filter((s) => STATUS_ALLOWED.includes(s));
    if (st.length) filtro.status = { $in: st };
  }

  // responsavel
  if (responsavelId !== null && responsavelId !== undefined) {
    const s = String(responsavelId).trim();
    if (!ObjectId.isValid(s)) return 0;
    filtro.responsavelId = new ObjectId(s);
  }

  // sem responsável (fila geral)
  if (somenteSemResponsavel) {
    filtro.$or = [{ responsavelId: null }, { responsavelId: { $exists: false } }];
  }

  // range createdAt
  if (createdFrom || createdTo) {
    filtro.createdAt = {};
    if (createdFrom) filtro.createdAt.$gte = new Date(createdFrom);
    if (createdTo) filtro.createdAt.$lt = new Date(createdTo);
  }

  // range updatedAt
  if (updatedFrom || updatedTo) {
    filtro.updatedAt = {};
    if (updatedFrom) filtro.updatedAt.$gte = new Date(updatedFrom);
    if (updatedTo) filtro.updatedAt.$lt = new Date(updatedTo);
  }

  return db.collection(COL_CHAMADOS).countDocuments(filtro);
}

/**
 * Índices (chamar no boot)
 */
export async function garantirIndicesChamados() {
  const db = pegarDb();

  await db.collection(COL_CHAMADOS).createIndex({ numero: 1 }, { unique: true });
  await db.collection(COL_CHAMADOS).createIndex({ "criadoPor.usuarioId": 1, createdAt: -1 });

  // fila e atribuição (escala)
  await db.collection(COL_CHAMADOS).createIndex({ status: 1, createdAt: -1 });
  await db.collection(COL_CHAMADOS).createIndex({ responsavelId: 1, createdAt: -1 });
  await db.collection(COL_CHAMADOS).createIndex({ responsavelId: 1, status: 1, updatedAt: -1 });
}