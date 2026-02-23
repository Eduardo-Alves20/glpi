import {
  acharChamadoPorIdDoUsuario,
  usuarioConfirmarSolucao,
  usuarioReabrirChamado,
} from "../../repos/chamados/chamadosRepo.js";
import { usuarioAdicionarInteracao } from "../../repos/chamados/chamadosRepo.js"; 

export async function usuarioChamadoShowGet(req, res) {
  const usuarioSessao = req.session?.usuario;

  const chamado = await acharChamadoPorIdDoUsuario(req.params.id, usuarioSessao.id);
  if (!chamado) {
    req.session.flash = { tipo: "error", mensagem: "Chamado não encontrado." };
    return res.redirect("/chamados/meus");
  }

  return res.render("chamados/show", {
    layout: "layout-app",
    titulo: `Chamado #${chamado.numero}`,
    ambiente: process.env.AMBIENTE || "LOCAL",
    usuarioSessao,
    cssPortal: "/styles/usuario.css",
cssExtra: "/styles/chamado-show.css",
    chamado,
  });
}

export async function usuarioChamadoConfirmarPost(req, res) {
  const usuarioSessao = req.session?.usuario;
  try {
    await usuarioConfirmarSolucao(req.params.id, usuarioSessao.id, { porLogin: usuarioSessao.usuario });
    req.session.flash = { tipo: "success", mensagem: "Chamado fechado. Obrigado!" };
  } catch (e) {
    req.session.flash = { tipo: "error", mensagem: e.message || "Não foi possível confirmar." };
  }
  return res.redirect(`/chamados/${req.params.id}`);
}

export async function usuarioChamadoReabrirPost(req, res) {
  const usuarioSessao = req.session?.usuario;
  const comentario = String(req.body?.comentario || "").trim();

  try {
    await usuarioReabrirChamado(req.params.id, usuarioSessao.id, comentario, { porLogin: usuarioSessao.usuario });
    req.session.flash = { tipo: "success", mensagem: "Chamado reaberto e voltou para a fila." };
  } catch (e) {
    req.session.flash = { tipo: "error", mensagem: e.message || "Não foi possível reabrir." };
  }

  return res.redirect(`/chamados/${req.params.id}`);
}


export async function usuarioChamadoInteracaoPost(req, res) {
  try {
    const usuarioSessao = req.session?.usuario;
    const { texto } = req.body || {};

    await usuarioAdicionarInteracao(
      req.params.id,
      { id: usuarioSessao.id, nome: usuarioSessao.nome, usuario: usuarioSessao.usuario },
      texto
    );

    req.session.flash = { tipo: "success", mensagem: "Mensagem enviada." };
    return res.redirect(`/chamados/${req.params.id}`);
  } catch (err) {
    console.error(err);
    req.session.flash = { tipo: "error", mensagem: err?.message || "Erro ao enviar mensagem." };
    return res.redirect(`/chamados/${req.params.id}`);
  }
}