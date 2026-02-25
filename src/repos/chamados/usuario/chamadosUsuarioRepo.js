import { pegarDb } from "../../../compartilhado/db/mongo.js";
import {
  COL_CHAMADOS,
  assertString,
  toObjectId,
} from "../core/chamadosCoreRepo.js";
import { sanitizarAnexosHistorico } from "../../../service/anexosService.js";
import { validarClassificacaoAtiva } from "../classificacoesChamadosRepo.js";

function docPosFindOneAndUpdate(out) {
  return out?.value ?? out ?? null;
}

export async function acharChamadoPorIdDoUsuario(
  chamadoId,
  usuarioId,
  { permitirAdmin = false } = {},
) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  const filtro = { _id };

  if (!permitirAdmin) {
    const u = toObjectId(usuarioId, "usuarioId");
    filtro["criadoPor.usuarioId"] = u;
  }

  return db.collection(COL_CHAMADOS).findOne(filtro);
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
    allowed.categoria = await validarClassificacaoAtiva("categoria", allowed.categoria);
  }
  if (allowed.prioridade) {
    allowed.prioridade = await validarClassificacaoAtiva("prioridade", allowed.prioridade);
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
        mensagem: "Usuario editou o chamado",
        meta: { campos },
      },
    },
  };

  const r = await db.collection(COL_CHAMADOS).updateOne(filtro, update);
  if (r.matchedCount === 1) return db.collection(COL_CHAMADOS).findOne({ _id });

  const existeDoUsuario = await db
    .collection(COL_CHAMADOS)
    .findOne({ _id, "criadoPor.usuarioId": u }, { projection: { status: 1 } });

  if (!existeDoUsuario) throw new Error("Chamado nao encontrado.");
  if (existeDoUsuario.status !== "aberto") {
    throw new Error("Este chamado nao pode mais ser editado (status diferente de aberto).");
  }
  throw new Error("Edicao nao permitida.");
}

export async function usuarioConfirmarSolucao(
  chamadoId,
  usuarioId,
  {
    porLogin = "sistema",
    comentario = "",
    anexos = [],
    permitirAdmin = false,
  } = {},
) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  const filtro = { _id, status: "aguardando_usuario" };
  if (!permitirAdmin) {
    const uId = toObjectId(usuarioId, "usuarioId");
    filtro["criadoPor.usuarioId"] = uId;
  }
  const now = new Date();
  const comentarioSan = String(comentario || "").trim();
  const anexosSan = sanitizarAnexosHistorico(anexos);

  let mensagemHistorico = permitirAdmin
    ? "Admin confirmou solucao. Chamado fechado."
    : "Usuario confirmou solucao. Chamado fechado.";
  if (comentarioSan) {
    const motivo = assertString(comentarioSan, "comentario", { min: 1, max: 2000 });
    mensagemHistorico = `${mensagemHistorico} Motivo: ${motivo}`;
  }

  const metaHistorico = {};
  if (anexosSan.length) {
    metaHistorico.anexos = anexosSan;
  }

  const r = await db.collection(COL_CHAMADOS).findOneAndUpdate(
    filtro,
    {
      $set: {
        status: "fechado",
        fechadoEm: now,
        fechadoAutomatico: false,
        fechadoMotivo: permitirAdmin ? "Confirmado pelo admin" : "Confirmado pelo usuario",
        updatedAt: now,
      },
      $push: {
        historico: {
          tipo: "status",
          em: now,
          por: String(porLogin || "sistema"),
          mensagem: mensagemHistorico,
          meta: metaHistorico,
        },
      },
    },
    { returnDocument: "after" },
  );

  const doc = docPosFindOneAndUpdate(r);
  if (!doc || !doc._id) {
    if (permitirAdmin) {
      throw new Error("Nao foi possivel confirmar (status invalido).");
    }
    throw new Error("Nao foi possivel confirmar (status invalido ou chamado nao e seu).");
  }
  return doc;
}

export async function usuarioReabrirChamado(
  chamadoId,
  usuarioId,
  comentario,
  {
    porLogin = "sistema",
    anexos = [],
    permitirAdmin = false,
  } = {},
) {
  const db = pegarDb();
  const _id = toObjectId(chamadoId, "chamadoId");
  const filtro = { _id, status: { $in: ["aguardando_usuario", "fechado"] } };
  if (!permitirAdmin) {
    const uId = toObjectId(usuarioId, "usuarioId");
    filtro["criadoPor.usuarioId"] = uId;
  }
  const now = new Date();
  const anexosSan = sanitizarAnexosHistorico(anexos);

  const msg = assertString(comentario, "comentario", { min: 5, max: 2000 });
  const metaHistorico = {};
  if (anexosSan.length) {
    metaHistorico.anexos = anexosSan;
  }

  const r = await db.collection(COL_CHAMADOS).findOneAndUpdate(
    filtro,
    {
      $set: { status: "aberto", updatedAt: now },
      $push: {
        historico: {
          tipo: "status",
          em: now,
          por: String(porLogin || "sistema"),
          mensagem: `${permitirAdmin ? "Admin" : "Usuario"} reabriu o chamado: ${msg}`,
          meta: metaHistorico,
        },
      },
    },
    { returnDocument: "after" },
  );

  const doc = docPosFindOneAndUpdate(r);
  if (!doc || !doc._id) {
    if (permitirAdmin) {
      throw new Error("Nao foi possivel reabrir (status invalido).");
    }
    throw new Error("Nao foi possivel reabrir (status invalido ou chamado nao e seu).");
  }
  return doc;
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
    throw new Error("Nao foi possivel enviar mensagem (verifique se o chamado esta fechado ou nao e seu).");
  }
  return doc;
}
