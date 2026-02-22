import { ObjectId } from "mongodb";
import {
  acharChamadoPorId,
  assumirChamado,
  responderSolucaoTecnico,
} from "../../repos/chamados/chamadosRepo.js";

function podeTecnicoVerChamado(chamado, tecnicoId) {
  if (!chamado) return false;

  const tId = String(tecnicoId || "");
  const resp = chamado.responsavelId ? String(chamado.responsavelId) : "";

  // Fila: aberto e sem responsável
  if (chamado.status === "aberto" && !resp) return true;

  // Se o responsável é o técnico logado, pode ver qualquer status
  if (resp && resp === tId) return true;

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
  if (!podeTecnicoVerChamado(chamado, tecnicoId)) {
    req.session.flash = { tipo: "error", mensagem: "Acesso negado ao chamado." };
    return res.redirect("/tecnico/chamados");
  }

  return res.render("tecnico/chamados/show", {
    layout: "layout-app",
    titulo: `Chamado #${chamado.numero}`,
    ambiente: process.env.AMBIENTE || "LOCAL",
    usuarioSessao,
    chamado,
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
    await responderSolucaoTecnico(
      req.params.id,
      { id: usuarioSessao.id, nome: usuarioSessao.nome, usuario: usuarioSessao.usuario },
      solucao,
      { porLogin: usuarioSessao.usuario }
    );
    req.session.flash = { tipo: "success", mensagem: "Solução enviada. Aguardando resposta do usuário." };
  } catch (e) {
    req.session.flash = { tipo: "error", mensagem: e.message || "Falha ao enviar solução." };
  }

  return res.redirect(`/tecnico/chamados/${req.params.id}`);
}