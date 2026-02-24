import { pegarDb } from "../../../compartilhado/db/mongo.js";
import {
  COL_CHAMADOS,
  STATUS_ALLOWED,
  assertString,
  sanitizeEnum,
  toObjectId,
} from "../core/chamadosCoreRepo.js";

export async function responderSolucaoTecnico(
  chamadoId,
  tecnico,
  solucao,
  { porLogin = "sistema" } = {},
) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  const tId = toObjectId(tecnico?.id, "tecnicoId");

  const texto = assertString(solucao, "solucao", { min: 10, max: 5000 });
  const now = new Date();

  const r = await db.collection(COL_CHAMADOS).findOneAndUpdate(
    { _id, status: "em_atendimento" },
    {
      $set: {
        status: "aguardando_usuario",
        solucao: texto,
        solucaoEm: now,
        solucaoPor: {
          tecnicoId: tId,
          nome: String(tecnico?.nome || "").trim(),
          login: String(tecnico?.usuario || tecnico?.login || "").trim(),
        },
        aguardandoUsuarioDesde: now,
        updatedAt: now,
      },
      $push: {
        historico: {
          tipo: "solucao",
          em: now,
          por: String(porLogin || "sistema"),
          mensagem: "Técnico enviou solução e aguardando confirmação do usuário",
        },
      },
    },
    { returnDocument: "after" },
  );

  if (!r.value) {
    throw new Error("Não foi possível registrar a solução (verifique o status).");
  }
  return r.value;
}

export async function assumirChamado(
  chamadoId,
  tecnico,
  { porLogin = "sistema" } = {},
) {
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
    { returnDocument: "after" },
  );

  const doc = r?.value || (await db.collection(COL_CHAMADOS).findOne({ _id }));
  if (!doc) throw new Error("Não foi possível assumir este chamado.");

  if (String(doc.responsavelId || "") !== String(tId) || doc.status !== "em_atendimento") {
    throw new Error("Não foi possível assumir este chamado.");
  }

  return doc;
}

export async function adicionarInteracaoTecnico(
  chamadoId,
  tecnico,
  texto,
  { tipo = "mensagem", porLogin = "sistema", mudarStatusPara = null } = {},
) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  const tId = toObjectId(tecnico?.id, "tecnicoId");

  const msg = assertString(texto, "texto", { min: 2, max: 5000 });
  const now = new Date();

  const allowedTipos = ["mensagem", "solucao", "comentario_interno"];
  if (!allowedTipos.includes(tipo)) throw new Error("Tipo de interação inválido.");

  const set = { updatedAt: now };
  if (mudarStatusPara) {
    const novo = sanitizeEnum(mudarStatusPara, STATUS_ALLOWED, "status");
    set.status = novo;
    if (novo === "aguardando_usuario") set.aguardandoUsuarioDesde = now;
  }

  const out = await db.collection(COL_CHAMADOS).findOneAndUpdate(
    { _id },
    {
      $set: set,
      $push: {
        historico: {
          tipo,
          em: now,
          por: String(porLogin || "sistema"),
          mensagem: msg,
          meta: {
            autor: {
              tecnicoId: tId,
              nome: String(tecnico?.nome || "").trim(),
              login: String(tecnico?.usuario || tecnico?.login || "").trim(),
            },
          },
        },
      },
    },
    { returnDocument: "after", returnOriginal: false },
  );

  const doc = out?.value ?? out;
  if (!doc || !doc._id) throw new Error("Não foi possível registrar a interação.");
  return doc;
}

