// src/repos/auditoriaRepo.js
export function criarAuditoriaRepo(pegarDb) {
  const col = () => pegarDb().collection("auditoria_acessos");
  const colLogs = () => pegarDb().collection("logs_sistema");

  async function registrarAcessoNegado(evt) {
    const doc = {
      tipo: "acesso_negado",
      em: new Date(),
      ...evt,
    };

    await col().insertOne(doc);

    // replica em logs_sistema para consulta centralizada do admin
    await colLogs().insertOne({
      nivel: "security",
      modulo: "seguranca",
      evento: "security.acesso_negado",
      acao: "acesso",
      resultado: "negado",
      mensagem: "Tentativa de acesso negado por perfil/permissao.",
      usuario: {
        id: doc.usuarioId ? String(doc.usuarioId) : "",
        login: doc.usuario || "",
        nome: doc.nome || "",
        perfil: doc.perfil || "",
      },
      alvo: {
        tipo: "rota",
        id: String(doc.rota || ""),
      },
      req: {
        metodo: String(doc.metodo || ""),
        rota: String(doc.rota || ""),
        ip: String(doc.ip || ""),
        userAgent: String(doc.userAgent || ""),
      },
      tags: ["security", "acesso_negado"],
      meta: {
        motivo: doc.motivo || "",
        perfisPermitidos: Array.isArray(doc.perfisPermitidos)
          ? doc.perfisPermitidos
          : [],
      },
      criadoEm: new Date(),
    });
  }

  return { registrarAcessoNegado };
}
