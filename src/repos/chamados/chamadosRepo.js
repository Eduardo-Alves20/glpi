import { ObjectId } from "mongodb";
import { pegarDb } from "../../compartilhado/db/mongo.js"; // ajuste se seu caminho for outro

const COL_CHAMADOS = "chamados";
const COL_COUNTERS = "counters";

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

async function nextChamadoNumero(db, session) {
  const ano = new Date().getFullYear();
  const counterId = `chamados:${ano}`;

  const r = await db.collection(COL_COUNTERS).findOneAndUpdate(
    { _id: counterId },
    {
      $inc: { seq: 1 },
      $setOnInsert: { createdAt: new Date() },
      $set: { updatedAt: new Date() },
    },
    {
      upsert: true,
      returnDocument: "after",
      session,
    }
  );

  const seq = r?.value?.seq;
  if (!Number.isInteger(seq) || seq <= 0) {
    throw new Error("Falha ao gerar número do chamado.");
  }

  // CH-YYYY-000001 (sequência atômica por ano)
  return `CH-${ano}-${String(seq).padStart(6, "0")}`;
}

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

  // validação/sanitização no repo (defesa em profundidade)
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

  // Se você estiver em replica set (prod), dá pra usar transaction.
  // Em dev/local single node, transação pode não estar habilitada — então usamos session
  // e o índice unique de "numero" garante integridade mesmo sem transaction.
  const session = db.client?.startSession?.(); // depende de como seu pegarDb expõe client
  try {
    let criado;

    if (session) {
      await session.withTransaction(async () => {
        const numero = await nextChamadoNumero(db, session);

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

        const r = await db.collection(COL_CHAMADOS).insertOne(doc, { session });
        criado = { ...doc, _id: r.insertedId };
      });
      return criado;
    }

    // Fallback seguro sem transaction: número atômico + índice unique em "numero"
    // Se der colisão (muito improvável com counter), o insert falha e você trata acima.
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
        { tipo: "criacao", em: now, por: String(usuarioLogin || "sistema"), mensagem: "Chamado criado" },
      ],
      createdAt: now,
      updatedAt: now,
    };

    const r = await db.collection(COL_CHAMADOS).insertOne(doc);
    return { ...doc, _id: r.insertedId };
  } finally {
    try { await session?.endSession?.(); } catch {}
  }
}

export async function listarMeusChamados(usuarioId, { limit = 50 } = {}) {
  const db = pegarDb();
  if (!ObjectId.isValid(usuarioId)) return [];

  const lim = Math.max(1, Math.min(Number(limit) || 50, 200)); // limite defensivo

  return db
    .collection(COL_CHAMADOS)
    .find({ "criadoPor.usuarioId": new ObjectId(usuarioId) })
    .project({ // evita vazar campos desnecessários
      numero: 1, titulo: 1, status: 1, createdAt: 1, prioridade: 1, categoria: 1
    })
    .sort({ createdAt: -1 })
    .limit(lim)
    .toArray();
}
