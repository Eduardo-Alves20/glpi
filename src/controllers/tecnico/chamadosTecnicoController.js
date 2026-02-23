import { ObjectId } from "mongodb";
import {
  acharChamadoPorId,
  assumirChamado,
  adicionarInteracaoTecnico,
} from "../../repos/chamados/chamadosRepo.js";

function podeTecnicoVerChamado(usuarioSessao, chamado) {
  if (!chamado) return false;

  const perfil = String(usuarioSessao?.perfil || "");
  if (perfil === "admin" || perfil === "tecnico") return true;

  return false;
}

export async function tecnicoChamadoShowGet(req, res) {

  const usuarioSessao = req.session?.usuario;
  const tecnicoId = usuarioSessao?.id;

  const chamado = await acharChamadoPorId(req.params.id);
  console.log("[SHOW] tecnicoId=", tecnicoId);
console.log("[SHOW] chamado=", {
  existe: !!chamado,
  status: chamado?.status,
  responsavelId: chamado?.responsavelId ? String(chamado.responsavelId) : null,
});
console.log("[SHOW] podeVer=", podeTecnicoVerChamado(chamado, tecnicoId));
 if (!podeTecnicoVerChamado(usuarioSessao, chamado)) {
  req.session.flash = { tipo: "error", mensagem: "Acesso negado ao chamado." };
  return res.redirect("/tecnico/chamados");
}

  return res.render("tecnico/chamados/show", {
    layout: "layout-app",
    titulo: `Chamado #${chamado.numero}`,
    ambiente: process.env.AMBIENTE || "LOCAL",
    usuarioSessao,
    chamado,
    cssPortal: "/styles/usuario.css",         
    cssExtra: "/styles/chamado-show.css",
  });
}

export async function tecnicoChamadoAssumirPost(req, res) {
  const usuarioSessao = req.session?.usuario;
  try {
    await assumirChamado(
      req.params.id,
      { id: usuarioSessao.id, nome: usuarioSessao.nome, usuario: usuarioSessao.usuario },
      { porLogin: usuarioSessao.usuario }
    );
    req.session.flash = { tipo: "success", mensagem: "Chamado assumido." };
  } catch (e) {
    req.session.flash = { tipo: "error", mensagem: e.message || "Falha ao assumir." };
  }
  return res.redirect(`/tecnico/chamados/${req.params.id}`);
}

export async function tecnicoChamadoSolucaoPost(req, res) {
  const usuarioSessao = req.session?.usuario;
  const solucao = String(req.body?.solucao || "").trim();

  try {
    await adicionarInteracaoTecnico(
  req.params.id,
  { id: usuarioSessao.id, nome: usuarioSessao.nome, usuario: usuarioSessao.usuario },
  solucao,
  {
    tipo: "solucao",
    porLogin: usuarioSessao.usuario,
    mudarStatusPara: "aguardando_usuario", // se você quiser manter o fluxo
  }
);
    req.session.flash = { tipo: "success", mensagem: "Solução enviada. Aguardando resposta do usuário." };
  } catch (e) {
    req.session.flash = { tipo: "error", mensagem: e.message || "Falha ao enviar solução." };
  }

  return res.redirect(`/tecnico/chamados/${req.params.id}`);
}
export async function tecnicoChamadoInteracaoPost(req, res) {
  try {
    const usuarioSessao = req.session?.usuario;
    const { texto, tipo } = req.body || {};

    const t = (tipo === "solucao") ? "solucao" : "mensagem";
    const mudarStatusPara = (t === "solucao") ? "aguardando_usuario" : null;

    await adicionarInteracaoTecnico(
      req.params.id,
      { id: usuarioSessao.id, nome: usuarioSessao.nome, usuario: usuarioSessao.usuario },
      texto,
      { tipo: t, porLogin: usuarioSessao.usuario, mudarStatusPara }
    );

    req.session.flash = { tipo: "success", mensagem: (t === "solucao") ? "Solução enviada." : "Mensagem enviada." };
    return res.redirect(`/tecnico/chamados/${req.params.id}`);
  } catch (err) {
    console.error(err);
    req.session.flash = { tipo: "error", mensagem: err?.message || "Erro ao enviar." };
    return res.redirect(`/tecnico/chamados/${req.params.id}`);
  }
}