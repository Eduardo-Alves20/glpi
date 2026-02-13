// src/compartilhado/middlewares/auditoria.js
export function criarAuditoriaSeguranca({ auditoriaRepo }) {
  function obterIp(req) {
    // se você setar app.set("trust proxy", 1), req.ip fica correto em proxy reverso
    return req.ip || req.socket?.remoteAddress || "";
  }

  async function registrarTentativaAcessoNegado(req, { motivo = "", perfisPermitidos = [] } = {}) {
    const u = req.session?.usuario || {};

    await auditoriaRepo.registrarAcessoNegado({
      usuarioId: u.id || null,
      usuario: u.usuario || null,
      nome: u.nome || null,
      perfil: u.perfil || null,
      rota: req.originalUrl,
      metodo: req.method,
      ip: obterIp(req),
      userAgent: req.get("user-agent") || "",
      motivo,
      perfisPermitidos: perfisPermitidos.map(String),
    });
  }

  return { registrarTentativaAcessoNegado };
}
