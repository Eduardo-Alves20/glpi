import { registrarLog } from "../repos/logsRepo.js";

function obterIp(req) {
  return req?.ip || req?.socket?.remoteAddress || "";
}

function obterReqInfo(req) {
  if (!req) return null;
  return {
    requestId: String(req.requestId || ""),
    metodo: String(req.method || "").toUpperCase(),
    rota: String(req.originalUrl || req.url || ""),
    ip: obterIp(req),
    userAgent: String(req.get?.("user-agent") || ""),
  };
}

function obterUsuarioSessao(req) {
  const u = req?.session?.usuario;
  if (!u) return null;
  return {
    id: String(u.id || ""),
    login: String(u.usuario || ""),
    nome: String(u.nome || ""),
    perfil: String(u.perfil || ""),
  };
}

export async function registrarEventoSistema({
  req = null,
  nivel = "info",
  modulo = "sistema",
  evento = "sistema.evento",
  acao = "",
  resultado = "info",
  mensagem = "",
  usuario = null,
  alvo = null,
  tags = [],
  meta = null,
} = {}) {
  try {
    await registrarLog({
      nivel,
      modulo,
      evento,
      acao,
      resultado,
      mensagem,
      usuario: usuario || obterUsuarioSessao(req),
      alvo,
      req: obterReqInfo(req),
      tags,
      meta,
    });
  } catch (err) {
    // logging nunca deve quebrar fluxo principal
    console.error("[logs] falha ao registrar evento:", err);
  }
}
