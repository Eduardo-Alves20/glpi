import { pegarDb } from "../../../compartilhado/db/mongo.js";
import {
  COL_CHAMADOS,
  CATEGORIAS_ALLOWED,
  PRIORIDADES_ALLOWED,
  assertString,
  sanitizeEnum,
  toObjectId,
} from "../core/chamadosCoreRepo.js";
import { sanitizarAnexosHistorico } from "../../../service/anexosService.js";

export async function acharChamadoPorIdDoUsuario(chamadoId, usuarioId) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  const u = toObjectId(usuarioId, "usuarioId");

  return db.collection(COL_CHAMADOS).findOne({ _id, "criadoPor.usuarioId": u });
}

export async function editarChamadoDoUsuario(
  chamadoId,
  usuarioId,
  dados,
  { porLogin = "sistema" } = {},
) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  const u = toObjectId(usuarioId, "usuarioId");

  const allowed = {};
  const campos = [];

  if (dados && typeof dados === "object") {
    if (typeof dados.titulo !== "undefined") {
      allowed.titulo = String(dados.titulo ?? "").trim();
      campos.push("titulo");
    }
    if (typeof dados.descricao !== "undefined") {
      allowed.descricao = String(dados.descricao ?? "").trim();
      campos.push("descricao");
    }
    if (typeof dados.categoria !== "undefined") {
      allowed.categoria = String(dados.categoria ?? "").trim();
      campos.push("categoria");
    }
    if (typeof dados.prioridade !== "undefined") {
      allowed.prioridade = String(dados.prioridade ?? "").trim();
      campos.push("prioridade");
    }
  }

  if (allowed.titulo) assertString(allowed.titulo, "titulo", { min: 6, max: 120 });
  if (allowed.descricao) {
    assertString(allowed.descricao, "descricao", { min: 20, max: 5000 });
  }
  if (allowed.categoria) {
    sanitizeEnum(allowed.categoria, CATEGORIAS_ALLOWED, "categoria");
  }
  if (allowed.prioridade) {
    sanitizeEnum(allowed.prioridade, PRIORIDADES_ALLOWED, "prioridade");
  }

  const now = new Date();
  const filtro = { _id, "criadoPor.usuarioId": u, status: "aberto" };
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
  if (r.matchedCount === 1) return db.collection(COL_CHAMADOS).findOne({ _id });

  const existeDoUsuario = await db
    .collection(COL_CHAMADOS)
    .findOne({ _id, "criadoPor.usuarioId": u }, { projection: { status: 1 } });

  if (!existeDoUsuario) throw new Error("Chamado não encontrado.");
  if (existeDoUsuario.status !== "aberto") {
    throw new Error("Este chamado não pode mais ser editado (status diferente de aberto).");
  }
  throw new Error("Edição não permitida.");
}

export async function usuarioConfirmarSolucao(
  chamadoId,
  usuarioId,
  { porLogin = "sistema" } = {},
) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  const uId = toObjectId(usuarioId, "usuarioId");
  const now = new Date();

  const r = await db.collection(COL_CHAMADOS).findOneAndUpdate(
    { _id, "criadoPor.usuarioId": uId, status: "aguardando_usuario" },
    {
      $set: {
        status: "fechado",
        fechadoEm: now,
        fechadoAutomatico: false,
        fechadoMotivo: "Confirmado pelo usuário",
        updatedAt: now,
      },
      $push: {
        historico: {
          tipo: "status",
          em: now,
          por: String(porLogin || "sistema"),
          mensagem: "Usuário confirmou solução. Chamado fechado.",
        },
      },
    },
    { returnDocument: "after" },
  );

  if (!r.value) {
    throw new Error("Não foi possível confirmar (status inválido ou chamado não é seu).");
  }
  return r.value;
}

export async function usuarioReabrirChamado(
  chamadoId,
  usuarioId,
  comentario,
  { porLogin = "sistema" } = {},
) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  const uId = toObjectId(usuarioId, "usuarioId");
  const now = new Date();

  const msg = assertString(comentario, "comentario", { min: 5, max: 2000 });

  const r = await db.collection(COL_CHAMADOS).findOneAndUpdate(
    { _id, "criadoPor.usuarioId": uId, status: { $in: ["aguardando_usuario", "fechado"] } },
    {
      $set: { status: "aberto", updatedAt: now },
      $push: {
        historico: {
          tipo: "status",
          em: now,
          por: String(porLogin || "sistema"),
          mensagem: `Usuário reabriu o chamado: ${msg}`,
        },
      },
    },
    { returnDocument: "after" },
  );

  if (!r.value) {
    throw new Error("Não foi possível reabrir (status inválido ou chamado não é seu).");
  }
  return r.value;
}

export async function usuarioAdicionarInteracao(
  chamadoId,
  usuario,
  texto,
  { porLogin = "sistema", anexos = [] } = {},
) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  const uId = toObjectId(usuario?.id, "usuarioId");

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

  const out = await db.collection(COL_CHAMADOS).findOneAndUpdate(
    { _id, "criadoPor.usuarioId": uId, status: { $ne: "fechado" } },
    {
      $set: { updatedAt: now },
      $push: {
        historico: {
          tipo: "mensagem",
          em: now,
          por: String(porLogin || usuario?.usuario || usuario?.login || "usuario"),
          mensagem: msg,
          meta: {
            autor: {
              usuarioId: uId,
              nome: String(usuario?.nome || "").trim(),
              login: String(usuario?.usuario || usuario?.login || "").trim(),
            },
            anexos: anexosSan,
          },
        },
      },
    },
    { returnDocument: "after", returnOriginal: false },
  );

  const doc = out?.value ?? out;
  if (!doc || !doc._id) {
    throw new Error("Não foi possível enviar mensagem (verifique se o chamado está fechado ou não é seu).");
  }
  return doc;
}
