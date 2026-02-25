import { ObjectId } from "mongodb";
import { pegarDb } from "../../../compartilhado/db/mongo.js";
import { sanitizarAnexosHistorico } from "../../../service/anexosService.js";
import { validarClassificacaoAtiva } from "../classificacoesChamadosRepo.js";
import {
  CATEGORIAS_PADRAO_VALUES,
  PRIORIDADES_PADRAO_VALUES,
} from "../classificacoesDefaults.js";

export const COL_CHAMADOS = "chamados";
export const COL_COUNTERS = "counters";

export const STATUS_ALLOWED = [
  "aberto",
  "em_atendimento",
  "aguardando_usuario",
  "fechado",
];
export const CATEGORIAS_ALLOWED = [...CATEGORIAS_PADRAO_VALUES];
export const PRIORIDADES_ALLOWED = [...PRIORIDADES_PADRAO_VALUES];

export function assertString(v, field, { min = 1, max = 5000 } = {}) {
  const s = String(v ?? "").trim();
  if (s.length < min) throw new Error(`Campo inválido: ${field}`);
  if (s.length > max) throw new Error(`Campo muito grande: ${field}`);
  return s;
}

export function sanitizeEnum(v, allowed, field) {
  const s = String(v ?? "").trim();
  if (!allowed.includes(s)) throw new Error(`Campo inválido: ${field}`);
  return s;
}

export function toObjectId(id, field = "id") {
  const s = String(id ?? "").trim();
  if (!ObjectId.isValid(s)) throw new Error(`Campo inválido: ${field}`);
  return new ObjectId(s);
}

async function nextChamadoNumero(db) {
  const res = await db.collection(COL_COUNTERS).findOneAndUpdate(
    { _id: "chamado_numero" },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after", returnOriginal: false },
  );

  const doc = res?.value ?? res;
  const seq = doc?.seq;

  if (typeof seq !== "number" || !Number.isFinite(seq) || seq < 1) {
    throw new Error("Falha ao gerar número do chamado.");
  }
  return seq;
}

export async function criarChamado({
  usuarioId,
  usuarioNome,
  usuarioLogin,
  titulo,
  descricao,
  categoria,
  prioridade,
  anexos = [],
  baseConhecimento = null,
} = {}) {
  const db = pegarDb();
  const userOid = toObjectId(usuarioId, "usuarioId");

  const tituloSan = assertString(titulo, "titulo", { min: 6, max: 120 });
  const descSan = assertString(descricao, "descricao", { min: 20, max: 5000 });
  const categoriaSan = await validarClassificacaoAtiva("categoria", categoria);
  const prioridadeSan = await validarClassificacaoAtiva("prioridade", prioridade);

  const now = new Date();
  const numero = await nextChamadoNumero(db);
  const anexosSan = sanitizarAnexosHistorico(anexos);
  const refsBaseConhecimento = Array.isArray(baseConhecimento?.referencias)
    ? Array.from(new Set(
      baseConhecimento.referencias
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean)
        .map((item) => item.slice(0, 120)),
    )).slice(0, 12)
    : [];

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
    responsavelId: null,
    responsavelNome: "",
    responsavelLogin: "",
    tecnicosApoio: [],
    inscritosNotificacao: [],
    atendidoEm: null,
    fechadoEm: null,
    solucao: "",
    solucaoEm: null,
    solucaoPor: null,
    aguardandoUsuarioDesde: null,
    fechadoAutomatico: false,
    fechadoMotivo: "",
    historico: [
      {
        tipo: "criacao",
        em: now,
        por: String(usuarioLogin || "usuario"),
        mensagem: "Chamado criado",
        meta: {
          ...(anexosSan.length ? { anexos: anexosSan } : {}),
          ...(refsBaseConhecimento.length ? { baseConhecimento: { referencias: refsBaseConhecimento } } : {}),
        },
      },
    ],
    baseConhecimento: refsBaseConhecimento.length
      ? {
          referencias: refsBaseConhecimento,
          sugeridoEm: now,
        }
      : {
          referencias: [],
          sugeridoEm: null,
        },
    createdAt: now,
    updatedAt: now,
  };

  const r = await db.collection(COL_CHAMADOS).insertOne(doc);
  return { ...doc, _id: r.insertedId };
}

export async function criarChamadoResolvidoBaseConhecimento({
  usuarioId,
  usuarioNome,
  usuarioLogin,
  titulo,
  descricao,
  categoria = "outros",
  prioridade = "baixa",
  slug = "",
  referencias = [],
  artigoTitulo = "",
} = {}) {
  const now = new Date();
  const slugSan = String(slug || "").trim().toLowerCase().slice(0, 120);
  const refs = Array.from(new Set(
    [
      ...((Array.isArray(referencias) ? referencias : [])
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean)
        .map((item) => item.slice(0, 120))),
      ...(slugSan ? [slugSan] : []),
    ],
  )).slice(0, 12);

  const tituloFallback = `Resolvido via base: ${String(artigoTitulo || slugSan || "guia").trim()}`.slice(0, 120);
  const tituloSan = String(titulo || "").trim().length >= 6
    ? String(titulo || "").trim().slice(0, 120)
    : tituloFallback;

  const descricaoBase = String(descricao || "").trim();
  const descricaoFallback = [
    "Solicitacao resolvida pelo proprio usuario com apoio da base de conhecimento.",
    slugSan ? `Artigo utilizado: ${slugSan}.` : "Artigo utilizado: nao informado.",
    "Chamado criado apenas para registro e auditoria de desempenho do suporte.",
  ].join(" ");
  const descricaoSan = descricaoBase.length >= 20
    ? descricaoBase.slice(0, 5000)
    : descricaoFallback;

  const chamadoCriado = await criarChamado({
    usuarioId,
    usuarioNome,
    usuarioLogin,
    titulo: tituloSan,
    descricao: descricaoSan,
    categoria,
    prioridade,
    baseConhecimento: {
      referencias: refs,
    },
  });

  const motivoFechamento = "Resolvido pela base de conhecimento";
  const mensagemHistorico = `Chamado registrado e fechado automaticamente apos confirmacao de resolucao pela base de conhecimento${slugSan ? ` (${slugSan})` : ""}.`;
  const resultado = await pegarDb().collection(COL_CHAMADOS).findOneAndUpdate(
    { _id: chamadoCriado._id },
    {
      $set: {
        status: "fechado",
        fechadoEm: now,
        fechadoAutomatico: true,
        fechadoMotivo: motivoFechamento,
        updatedAt: now,
        "baseConhecimento.artigoPrincipal": slugSan || "",
        "baseConhecimento.resolvidoSemAtendimento": true,
        "baseConhecimento.resolvidoEm": now,
      },
      $push: {
        historico: {
          tipo: "status",
          em: now,
          por: String(usuarioLogin || "usuario"),
          mensagem: mensagemHistorico,
          meta: {
            baseConhecimento: {
              referencias: refs,
              artigoTitulo: String(artigoTitulo || "").trim().slice(0, 200),
            },
          },
        },
      },
    },
    { returnDocument: "after", returnOriginal: false },
  );

  return (resultado?.value ?? resultado ?? chamadoCriado);
}

export async function acharChamadoPorId(chamadoId) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  return db.collection(COL_CHAMADOS).findOne({ _id });
}

export async function atribuirResponsavelTriagemAutomatica(
  chamadoId,
  {
    responsavelId,
    responsavelNome = "",
    responsavelLogin = "",
    responsavelPerfil = "tecnico",
  } = {},
  { porLogin = "triagem.auto" } = {},
) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  const respOid = toObjectId(responsavelId, "responsavelId");
  const now = new Date();

  const out = await db.collection(COL_CHAMADOS).findOneAndUpdate(
    {
      _id,
      status: "aberto",
      $or: [{ responsavelId: null }, { responsavelId: { $exists: false } }],
    },
    {
      $set: {
        responsavelId: respOid,
        responsavelNome: String(responsavelNome || "").trim(),
        responsavelLogin: String(responsavelLogin || "").trim(),
        updatedAt: now,
      },
      $push: {
        historico: {
          tipo: "atribuicao",
          em: now,
          por: String(porLogin || "triagem.auto"),
          mensagem: "Triagem automatica definiu responsavel inicial",
          meta: {
            responsavelId: String(respOid),
            responsavelNome: String(responsavelNome || "").trim(),
            responsavelLogin: String(responsavelLogin || "").trim(),
            responsavelPerfil: String(responsavelPerfil || "tecnico").trim().toLowerCase(),
          },
        },
      },
    },
    { returnDocument: "after", returnOriginal: false },
  );

  const doc = out?.value ?? out ?? null;
  return doc && doc._id ? doc : null;
}

export async function excluirChamadoPorIdAdmin(chamadoId) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");

  const out = await db.collection(COL_CHAMADOS).findOneAndDelete({ _id });
  const doc = out?.value ?? out ?? null;
  return doc && doc._id ? doc : null;
}

export async function acharChamadoPorAnexoId(anexoId) {
  const db = pegarDb();
  const id = String(anexoId || "").trim();
  if (!id) return null;

  return db.collection(COL_CHAMADOS).findOne(
    { "historico.meta.anexos.id": id },
    {
      projection: {
        _id: 1,
        numero: 1,
        titulo: 1,
        status: 1,
        "criadoPor.usuarioId": 1,
        historico: 1,
      },
    },
  );
}

export async function listarChamados({
  status = null,
  solicitanteId = null,
  responsavelId = null,
  prioridade = null,
  limit = 50,
} = {}) {
  const db = pegarDb();
  const filtro = {};

  if (Array.isArray(status) && status.length) {
    const st = status
      .map((s) => String(s).trim())
      .filter((s) => STATUS_ALLOWED.includes(s));
    if (st.length) filtro.status = { $in: st };
  } else if (typeof status === "string" && status.trim()) {
    const s = status.trim();
    if (STATUS_ALLOWED.includes(s)) filtro.status = s;
  }

  if (solicitanteId !== null && solicitanteId !== undefined) {
    const s = String(solicitanteId).trim();
    if (!ObjectId.isValid(s)) return [];
    filtro["criadoPor.usuarioId"] = new ObjectId(s);
  }

  if (responsavelId !== null && responsavelId !== undefined) {
    const s = String(responsavelId).trim();
    if (!ObjectId.isValid(s)) return [];
    filtro.responsavelId = new ObjectId(s);
  }

  if (typeof prioridade === "string" && prioridade.trim()) {
    filtro.prioridade = prioridade.trim();
  } else if (Array.isArray(prioridade) && prioridade.length) {
    const ps = prioridade
      .map((p) => String(p).trim())
      .filter(Boolean);
    if (ps.length) filtro.prioridade = { $in: ps };
  }

  const lim = Math.max(1, Math.min(Number(limit) || 50, 200));

  return db
    .collection(COL_CHAMADOS)
    .find(filtro)
    .project({
      numero: 1,
      titulo: 1,
      descricao: 1,
      status: 1,
      createdAt: 1,
      updatedAt: 1,
      prioridade: 1,
      categoria: 1,
      "criadoPor.nome": 1,
      "criadoPor.login": 1,
      responsavelId: 1,
      responsavelNome: 1,
      responsavelLogin: 1,
    })
    .sort({ createdAt: -1 })
    .limit(lim)
    .toArray();
}

export async function listarFilaChamados({
  status = ["aberto", "em_atendimento"],
  limit = 50,
} = {}) {
  return listarChamados({ status, limit });
}

export async function listarMeusAtendimentos(tecnicoId, { limit = 50 } = {}) {
  const db = pegarDb();
  const tecnicoIdStr = String(tecnicoId || "").trim();
  if (!ObjectId.isValid(tecnicoIdStr)) return [];

  const tecnicoOid = new ObjectId(tecnicoIdStr);
  const lim = Math.max(1, Math.min(Number(limit) || 50, 200));

  return db
    .collection(COL_CHAMADOS)
    .find({
      $or: [
        { responsavelId: tecnicoOid },
        { "tecnicosApoio.id": tecnicoIdStr },
      ],
    })
    .project({
      numero: 1,
      titulo: 1,
      descricao: 1,
      status: 1,
      createdAt: 1,
      updatedAt: 1,
      prioridade: 1,
      categoria: 1,
      "criadoPor.nome": 1,
      "criadoPor.login": 1,
      responsavelId: 1,
      responsavelNome: 1,
      responsavelLogin: 1,
      tecnicosApoio: 1,
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(lim)
    .toArray();
}

export async function listarHistoricoTecnicoChamados(
  { tecnicoId = null, tecnicoLogin = "" } = {},
  { limit = 200 } = {},
) {
  const db = pegarDb();
  const lim = Math.max(1, Math.min(Number(limit) || 200, 500));

  const login = String(tecnicoLogin || "").trim();
  const criterios = [];

  const tecnicoIdStr = String(tecnicoId || "").trim();
  if (ObjectId.isValid(tecnicoIdStr)) {
    const tecnicoOid = new ObjectId(tecnicoIdStr);
    criterios.push({ responsavelId: tecnicoOid });
    criterios.push({ "tecnicosApoio.id": tecnicoIdStr });
    criterios.push({ "solucaoPor.tecnicoId": tecnicoOid });
    criterios.push({
      historico: {
        $elemMatch: {
          "meta.autor.tecnicoId": tecnicoOid,
          tipo: { $in: ["mensagem", "solucao", "comentario_interno"] },
        },
      },
    });
    criterios.push({
      historico: {
        $elemMatch: {
          tipo: { $in: ["atribuicao", "transferencia"] },
          "meta.responsavelId": tecnicoIdStr,
        },
      },
    });
  }

  if (login) {
    criterios.push({ responsavelLogin: login });
    criterios.push({ "solucaoPor.login": login });
    criterios.push({
      historico: {
        $elemMatch: {
          tipo: { $in: ["mensagem", "solucao", "comentario_interno"] },
          "meta.autor.login": login,
        },
      },
    });
  }

  if (!criterios.length) return [];

  return db
    .collection(COL_CHAMADOS)
    .find({ $or: criterios })
    .project({
      numero: 1,
      titulo: 1,
      descricao: 1,
      status: 1,
      createdAt: 1,
      updatedAt: 1,
      prioridade: 1,
      categoria: 1,
      "criadoPor.nome": 1,
      "criadoPor.login": 1,
      responsavelId: 1,
      responsavelNome: 1,
      responsavelLogin: 1,
      tecnicosApoio: 1,
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(lim)
    .toArray();
}

export async function contarChamados({
  status = null,
  solicitanteId = null,
  responsavelId = null,
  prioridade = null,
  somenteSemResponsavel = false,
  createdFrom = null,
  createdTo = null,
  updatedFrom = null,
  updatedTo = null,
} = {}) {
  const db = pegarDb();
  const filtro = {};

  if (typeof status === "string") {
    const s = status.trim();
    if (STATUS_ALLOWED.includes(s)) filtro.status = s;
  } else if (Array.isArray(status) && status.length) {
    const st = status
      .map((s) => String(s).trim())
      .filter((s) => STATUS_ALLOWED.includes(s));
    if (st.length) filtro.status = { $in: st };
  }

  if (solicitanteId !== null && solicitanteId !== undefined) {
    const s = String(solicitanteId).trim();
    if (!ObjectId.isValid(s)) return 0;
    filtro["criadoPor.usuarioId"] = new ObjectId(s);
  }

  if (responsavelId !== null && responsavelId !== undefined) {
    const s = String(responsavelId).trim();
    if (!ObjectId.isValid(s)) return 0;
    filtro.responsavelId = new ObjectId(s);
  }

  if (typeof prioridade === "string" && prioridade.trim()) {
    filtro.prioridade = prioridade.trim();
  } else if (Array.isArray(prioridade) && prioridade.length) {
    const ps = prioridade
      .map((p) => String(p).trim())
      .filter(Boolean);
    if (ps.length) filtro.prioridade = { $in: ps };
  }

  if (somenteSemResponsavel) {
    filtro.$or = [
      { responsavelId: null },
      { responsavelId: { $exists: false } },
    ];
  }

  if (createdFrom || createdTo) {
    filtro.createdAt = {};
    if (createdFrom) filtro.createdAt.$gte = new Date(createdFrom);
    if (createdTo) filtro.createdAt.$lt = new Date(createdTo);
  }

  if (updatedFrom || updatedTo) {
    filtro.updatedAt = {};
    if (updatedFrom) filtro.updatedAt.$gte = new Date(updatedFrom);
    if (updatedTo) filtro.updatedAt.$lt = new Date(updatedTo);
  }

  return db.collection(COL_CHAMADOS).countDocuments(filtro);
}

export async function obterUltimaAtualizacaoChamados() {
  const db = pegarDb();
  const [doc] = await db
    .collection(COL_CHAMADOS)
    .find({}, { projection: { updatedAt: 1 } })
    .sort({ updatedAt: -1 })
    .limit(1)
    .toArray();

  return doc?.updatedAt ? new Date(doc.updatedAt) : null;
}

export async function garantirIndicesChamados() {
  const db = pegarDb();

  await db.collection(COL_CHAMADOS).createIndex({ numero: 1 }, { unique: true });
  await db
    .collection(COL_CHAMADOS)
    .createIndex({ "criadoPor.usuarioId": 1, createdAt: -1 });
  await db.collection(COL_CHAMADOS).createIndex({ status: 1, createdAt: -1 });
  await db.collection(COL_CHAMADOS).createIndex({ responsavelId: 1, createdAt: -1 });
  await db.collection(COL_CHAMADOS).createIndex(
    {
      titulo: "text",
      descricao: "text",
      "criadoPor.nome": "text",
      "criadoPor.login": "text",
      responsavelNome: "text",
      responsavelLogin: "text",
    },
    {
      name: "idx_chamados_texto_busca",
      default_language: "portuguese",
      weights: {
        titulo: 10,
        descricao: 4,
        "criadoPor.nome": 2,
        "criadoPor.login": 2,
        responsavelNome: 2,
        responsavelLogin: 2,
      },
    },
  );
  await db
    .collection(COL_CHAMADOS)
    .createIndex({ responsavelId: 1, status: 1, updatedAt: -1 });
  await db
    .collection(COL_CHAMADOS)
    .createIndex({ "tecnicosApoio.id": 1, updatedAt: -1 });
  await db
    .collection(COL_CHAMADOS)
    .createIndex({ "inscritosNotificacao.id": 1, updatedAt: -1 });
  await db
    .collection(COL_CHAMADOS)
    .createIndex({ "solucaoPor.tecnicoId": 1, updatedAt: -1 });
  await db
    .collection(COL_CHAMADOS)
    .createIndex({ "historico.meta.autor.tecnicoId": 1, updatedAt: -1 });
  await db
    .collection(COL_CHAMADOS)
    .createIndex({ "historico.por": 1, updatedAt: -1 });
}
