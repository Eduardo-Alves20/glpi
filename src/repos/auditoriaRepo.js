// src/repos/auditoriaRepo.js
export function criarAuditoriaRepo(pegarDb) {
  const col = () => pegarDb().collection("auditoria_acessos");

  async function registrarAcessoNegado(evt) {
    await col().insertOne({
      tipo: "acesso_negado",
      em: new Date(),
      ...evt,
    });
  }

  return { registrarAcessoNegado };
}
