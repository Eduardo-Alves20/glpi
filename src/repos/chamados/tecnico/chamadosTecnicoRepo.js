import { pegarDb } from "../../../compartilhado/db/mongo.js";
import {
  COL_CHAMADOS,
  STATUS_ALLOWED,
  assertString,
  sanitizeEnum,
  toObjectId,
} from "../core/chamadosCoreRepo.js";
import { sanitizarAnexosHistorico } from "../../../service/anexosService.js";

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

export async function atualizarResponsavelChamado(
  chamadoId,
  {
    responsavelId = null,
    responsavelNome = "",
    responsavelLogin = "",
  } = {},
  { porLogin = "sistema" } = {},
) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  const now = new Date();

  const semResponsavel = responsavelId === null || responsavelId === undefined || String(responsavelId).trim() === "";

  const set = semResponsavel
    ? {
        status: "aberto",
        responsavelId: null,
        responsavelNome: "",
        responsavelLogin: "",
        updatedAt: now,
      }
    : {
        status: "em_atendimento",
        responsavelId: toObjectId(responsavelId, "responsavelId"),
        responsavelNome: String(responsavelNome || "").trim(),
        responsavelLogin: String(responsavelLogin || "").trim(),
        atendidoEm: now,
        updatedAt: now,
      };

  const historico = semResponsavel
    ? {
        tipo: "transferencia",
        em: now,
        por: String(porLogin || "sistema"),
        mensagem: "Chamado devolvido para a fila",
        meta: { responsavelId: null },
      }
    : {
        tipo: "transferencia",
        em: now,
        por: String(porLogin || "sistema"),
        mensagem: "Responsável do chamado alterado",
        meta: { responsavelId: String(set.responsavelId) },
      };

  const out = await db.collection(COL_CHAMADOS).findOneAndUpdate(
    { _id, status: { $ne: "fechado" } },
    {
      $set: set,
      $push: { historico },
    },
    { returnDocument: "after", returnOriginal: false },
  );

  const doc = out?.value ?? out;
  if (!doc || !doc._id) {
    throw new Error("Não foi possível atualizar o responsável (chamado fechado ou inexistente).");
  }
  return doc;
}

export async function adicionarInteracaoTecnico(
  chamadoId,
  tecnico,
  texto,
  {
    tipo = "mensagem",
    porLogin = "sistema",
    mudarStatusPara = null,
    anexos = [],
  } = {},
) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  const tId = toObjectId(tecnico?.id, "tecnicoId");

  const anexosSan = sanitizarAnexosHistorico(anexos);
  const textoSan = String(texto ?? "").trim();

  let msg = "";
  if (textoSan) {
    msg = assertString(textoSan, "texto", { min: 2, max: 5000 });
  } else if (!anexosSan.length) {
    throw new Error("Informe uma mensagem ou anexe pelo menos um arquivo.");
  }

  if (!msg && anexosSan.length) msg = "Anexo enviado.";
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
            anexos: anexosSan,
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
