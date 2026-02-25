import { pegarDb } from "../../../compartilhado/db/mongo.js";
import {
  COL_CHAMADOS,
  STATUS_ALLOWED,
  assertString,
  sanitizeEnum,
  toObjectId,
} from "../core/chamadosCoreRepo.js";
import { sanitizarAnexosHistorico } from "../../../service/anexosService.js";

function docPosFindOneAndUpdate(out) {
  return out?.value ?? out ?? null;
}

function montarTecnicoResumo(tecnico = {}) {
  const id = String(tecnico?.id || "").trim();
  const nome = String(tecnico?.nome || "").trim();
  const login = String(tecnico?.usuario || tecnico?.login || "").trim();
  const perfil = String(tecnico?.perfil || "tecnico").trim().toLowerCase() || "tecnico";
  if (!id) throw new Error("Tecnico invalido.");
  return { id, nome, login, perfil };
}

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

  const doc = docPosFindOneAndUpdate(r);
  if (!doc || !doc._id) {
    throw new Error("Nao foi possivel registrar a solucao (verifique o status).");
  }
  return doc;
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
          meta: {
            responsavelId: String(tId),
            responsavelNome: String(tecnico?.nome || "").trim(),
            responsavelLogin: String(tecnico?.usuario || tecnico?.login || "").trim(),
          },
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
        meta: {
          responsavelId: null,
          responsavelNome: "",
          responsavelLogin: "",
        },
      }
    : {
        tipo: "transferencia",
        em: now,
        por: String(porLogin || "sistema"),
        mensagem: "Responsável do chamado alterado",
        meta: {
          responsavelId: String(set.responsavelId),
          responsavelNome: String(set.responsavelNome || "").trim(),
          responsavelLogin: String(set.responsavelLogin || "").trim(),
        },
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

export async function adicionarTecnicoApoioChamado(
  chamadoId,
  tecnicoApoio,
  { porLogin = "sistema" } = {},
) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  const now = new Date();
  const apoio = montarTecnicoResumo(tecnicoApoio);

  const chamadoAtual = await db.collection(COL_CHAMADOS).findOne(
    { _id, status: { $ne: "fechado" } },
    { projection: { responsavelId: 1 } },
  );
  if (!chamadoAtual) {
    throw new Error("Nao foi possivel adicionar tecnico de apoio (chamado fechado ou inexistente).");
  }

  if (String(chamadoAtual?.responsavelId || "") === apoio.id) {
    throw new Error("Este tecnico ja e o responsavel principal.");
  }

  await db.collection(COL_CHAMADOS).updateOne(
    { _id },
    { $pull: { tecnicosApoio: { id: apoio.id } } },
  );

  const out = await db.collection(COL_CHAMADOS).findOneAndUpdate(
    { _id, status: { $ne: "fechado" } },
    {
      $set: { updatedAt: now },
      $push: {
        tecnicosApoio: {
          id: apoio.id,
          nome: apoio.nome,
          login: apoio.login,
          perfil: apoio.perfil,
          em: now,
        },
        historico: {
          tipo: "atribuicao",
          em: now,
          por: String(porLogin || "sistema"),
          mensagem: "Tecnico de apoio adicionado",
          meta: {
            apoioId: apoio.id,
            apoioNome: apoio.nome,
            apoioLogin: apoio.login,
          },
        },
      },
    },
    { returnDocument: "after", returnOriginal: false },
  );

  const doc = out?.value ?? out;
  if (!doc || !doc._id) {
    throw new Error("Nao foi possivel adicionar tecnico de apoio.");
  }
  return doc;
}

export async function removerTecnicoApoioChamado(
  chamadoId,
  tecnicoApoioId,
  { porLogin = "sistema" } = {},
) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  const apoioId = String(tecnicoApoioId || "").trim();
  if (!apoioId) throw new Error("Tecnico de apoio invalido.");
  const now = new Date();

  const atual = await db.collection(COL_CHAMADOS).findOne(
    { _id, status: { $ne: "fechado" } },
    { projection: { tecnicosApoio: 1 } },
  );
  if (!atual) {
    throw new Error("Nao foi possivel remover tecnico de apoio (chamado fechado ou inexistente).");
  }

  const apoio = (Array.isArray(atual.tecnicosApoio) ? atual.tecnicosApoio : [])
    .find((x) => String(x?.id || "") === apoioId);
  if (!apoio) {
    throw new Error("Tecnico de apoio nao encontrado no chamado.");
  }

  const out = await db.collection(COL_CHAMADOS).findOneAndUpdate(
    { _id, status: { $ne: "fechado" } },
    {
      $set: { updatedAt: now },
      $pull: { tecnicosApoio: { id: apoioId } },
      $push: {
        historico: {
          tipo: "transferencia",
          em: now,
          por: String(porLogin || "sistema"),
          mensagem: "Tecnico de apoio removido",
          meta: {
            apoioId,
            apoioNome: String(apoio?.nome || ""),
            apoioLogin: String(apoio?.login || ""),
          },
        },
      },
    },
    { returnDocument: "after", returnOriginal: false },
  );

  const doc = out?.value ?? out;
  if (!doc || !doc._id) {
    throw new Error("Nao foi possivel remover tecnico de apoio.");
  }
  return doc;
}

export async function seguirNotificacoesChamado(
  chamadoId,
  usuario,
  { porLogin = "sistema" } = {},
) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  const now = new Date();
  const actor = montarTecnicoResumo(usuario);

  await db.collection(COL_CHAMADOS).updateOne(
    { _id },
    { $pull: { inscritosNotificacao: { id: actor.id, perfil: actor.perfil } } },
  );

  const out = await db.collection(COL_CHAMADOS).findOneAndUpdate(
    { _id },
    {
      $set: { updatedAt: now },
      $push: {
        inscritosNotificacao: {
          id: actor.id,
          nome: actor.nome,
          login: actor.login,
          perfil: actor.perfil,
          em: now,
        },
        historico: {
          tipo: "status",
          em: now,
          por: String(porLogin || "sistema"),
          mensagem: "Tecnico ativou notificacoes deste chamado",
          meta: {
            inscritoId: actor.id,
            inscritoLogin: actor.login,
            inscritoPerfil: actor.perfil,
          },
        },
      },
    },
    { returnDocument: "after", returnOriginal: false },
  );

  const doc = out?.value ?? out;
  if (!doc || !doc._id) throw new Error("Nao foi possivel ativar notificacoes do chamado.");
  return doc;
}

export async function pararNotificacoesChamado(
  chamadoId,
  usuario,
  { porLogin = "sistema" } = {},
) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  const now = new Date();
  const actor = montarTecnicoResumo(usuario);

  const out = await db.collection(COL_CHAMADOS).findOneAndUpdate(
    { _id },
    {
      $set: { updatedAt: now },
      $pull: { inscritosNotificacao: { id: actor.id, perfil: actor.perfil } },
      $push: {
        historico: {
          tipo: "status",
          em: now,
          por: String(porLogin || "sistema"),
          mensagem: "Tecnico desativou notificacoes deste chamado",
          meta: {
            inscritoId: actor.id,
            inscritoLogin: actor.login,
            inscritoPerfil: actor.perfil,
          },
        },
      },
    },
    { returnDocument: "after", returnOriginal: false },
  );

  const doc = out?.value ?? out;
  if (!doc || !doc._id) throw new Error("Nao foi possivel desativar notificacoes do chamado.");
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

