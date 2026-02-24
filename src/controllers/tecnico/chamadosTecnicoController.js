import { acharChamadoPorId } from "../../repos/chamados/core/chamadosCoreRepo.js";
import {
  assumirChamado,
  atualizarResponsavelChamado,
  adicionarInteracaoTecnico,
} from "../../repos/chamados/tecnico/chamadosTecnicoRepo.js";
import { criarNotificacao } from "../../repos/notificacoesRepo.js";
import { acharPorId, listarUsuariosPorPerfis } from "../../repos/usuariosRepo.js";
import { notificarNovoChamadoFila } from "../../service/notificacoesService.js";
import { registrarEventoSistema } from "../../service/logsService.js";
import { apagarArquivosUpload, mapearArquivosUpload } from "../../service/anexosService.js";

function podeTecnicoVerChamado(usuarioSessao, chamado) {
  if (!chamado) return false;

  const perfil = String(usuarioSessao?.perfil || "");
  if (perfil === "admin" || perfil === "tecnico") return true;

  return false;
}

export async function tecnicoChamadoShowGet(req, res) {
  const usuarioSessao = req.session?.usuario;

  const chamado = await acharChamadoPorId(req.params.id);
  if (!podeTecnicoVerChamado(usuarioSessao, chamado)) {
    req.session.flash = {
      tipo: "error",
      mensagem: "Acesso negado ao chamado.",
    };
    return res.redirect("/tecnico/chamados");
  }

  const equipeRaw = await listarUsuariosPorPerfis(["tecnico", "admin"]);
  const equipeResponsaveis = (equipeRaw || []).map((u) => ({
    id: String(u._id),
    nome: String(u.nome || ""),
    usuario: String(u.usuario || ""),
    perfil: String(u.perfil || ""),
  }));

  return res.render("tecnico/chamados/show", {
    layout: "layout-app",
    titulo: `Chamado #${chamado.numero}`,
    ambiente: process.env.AMBIENTE || "LOCAL",
    usuarioSessao,
    chamado,
    equipeResponsaveis,
    cssPortal: "/styles/usuario.css",
    cssExtra: "/styles/chamado-show.css",
  });
}

export async function tecnicoChamadoAssumirPost(req, res) {
  const usuarioSessao = req.session?.usuario;
  let chamado = null;
  try {
    chamado = await assumirChamado(
      req.params.id,
      {
        id: usuarioSessao.id,
        nome: usuarioSessao.nome,
        usuario: usuarioSessao.usuario,
      },
      { porLogin: usuarioSessao.usuario },
    );
  } catch (e) {
    await registrarEventoSistema({
      req,
      nivel: "warn",
      modulo: "tecnico",
      evento: "chamado.assumir",
      acao: "assumir",
      resultado: "erro",
      mensagem: e?.message || "Falha ao assumir chamado.",
      alvo: {
        tipo: "chamado",
        id: String(req.params.id || ""),
      },
    });

    req.session.flash = {
      tipo: "error",
      mensagem: e.message || "Falha ao assumir.",
    };
    return res.redirect(`/tecnico/chamados/${req.params.id}`);
  }

  const usuarioDestinoId = chamado?.criadoPor?.usuarioId
    ? String(chamado.criadoPor.usuarioId)
    : "";
  const autorId = String(usuarioSessao.id);

  if (usuarioDestinoId && usuarioDestinoId !== autorId) {
    try {
      await criarNotificacao({
        destinatarioTipo: "usuario",
        destinatarioId: usuarioDestinoId,
        chamadoId: String(chamado._id),
        tipo: "atribuido",
        titulo: `Chamado #${chamado.numero}: ${chamado.titulo}`,
        mensagem: `Seu chamado foi assumido por ${usuarioSessao.nome}.`,
        url: `/chamados/${String(chamado._id)}`,
        meta: {
          autor: {
            tipo: "tecnico",
            id: autorId,
            nome: usuarioSessao.nome,
            login: usuarioSessao.usuario,
          },
        },
      });
    } catch (errNotif) {
      console.error("[notificacao] falha ao notificar usuário sobre assunção:", errNotif);
    }
  }

  await registrarEventoSistema({
    req,
    nivel: "info",
    modulo: "tecnico",
    evento: "chamado.assumido",
    acao: "assumir",
    resultado: "sucesso",
    mensagem: `Chamado #${chamado?.numero || ""} assumido por tecnico.`,
    alvo: {
      tipo: "chamado",
      id: String(chamado?._id || req.params.id),
      numero: String(chamado?.numero || ""),
    },
    meta: {
      responsavelId: String(usuarioSessao?.id || ""),
      responsavelLogin: String(usuarioSessao?.usuario || ""),
    },
  });

  req.session.flash = { tipo: "success", mensagem: "Chamado assumido." };
  return res.redirect(`/tecnico/chamados/${req.params.id}`);
}

export async function tecnicoChamadoResponsavelPost(req, res) {
  const usuarioSessao = req.session?.usuario;
  const perfil = String(usuarioSessao?.perfil || "");
  const chamadoId = String(req.params.id || "");
  const novoResponsavelId = String(req.body?.responsavelId || "").trim();

  try {
    if (!usuarioSessao?.id) throw new Error("Sessão inválida.");

    let chamadoAtualizado = null;

    if (!novoResponsavelId) {
      chamadoAtualizado = await atualizarResponsavelChamado(
        chamadoId,
        { responsavelId: null },
        { porLogin: usuarioSessao.usuario },
      );

      const recipients = await listarUsuariosPorPerfis(["tecnico", "admin"]);
      const destinatarios = (recipients || [])
        .map((u) => ({
          tipo: u.perfil === "admin" ? "admin" : "tecnico",
          id: String(u._id),
          perfilDestinatario: String(u.perfil || ""),
        }))
        .filter((d) => d.id !== String(usuarioSessao.id));

      if (destinatarios.length) {
        try {
          await notificarNovoChamadoFila({
            chamadoId: String(chamadoAtualizado._id),
            tituloChamado: chamadoAtualizado.titulo,
            destinatarios,
            autor: {
              tipo: perfil || "tecnico",
              id: String(usuarioSessao.id),
              nome: usuarioSessao.nome,
              login: usuarioSessao.usuario,
            },
          });
        } catch (errNotif) {
          console.error("[notificacao] falha ao notificar equipe sobre retorno à fila:", errNotif);
        }
      }

      await registrarEventoSistema({
        req,
        nivel: "info",
        modulo: "tecnico",
        evento: "chamado.devolvido_fila",
        acao: "atualizar_responsavel",
        resultado: "sucesso",
        mensagem: `Chamado #${chamadoAtualizado?.numero || ""} devolvido para fila.`,
        alvo: {
          tipo: "chamado",
          id: String(chamadoAtualizado?._id || chamadoId),
          numero: String(chamadoAtualizado?.numero || ""),
        },
      });

      req.session.flash = { tipo: "success", mensagem: "Chamado devolvido para a fila." };
      return res.redirect(`/tecnico/chamados/${chamadoId}`);
    }

    const novoResp = await acharPorId(novoResponsavelId);
    if (!novoResp) throw new Error("Responsável não encontrado.");
    if (!["tecnico", "admin"].includes(String(novoResp.perfil || ""))) {
      throw new Error("Responsável inválido para este chamado.");
    }
    if (String(novoResp.status || "") === "bloqueado") {
      throw new Error("Não é possível atribuir para usuário bloqueado.");
    }

    chamadoAtualizado = await atualizarResponsavelChamado(
      chamadoId,
      {
        responsavelId: String(novoResp._id),
        responsavelNome: novoResp.nome,
        responsavelLogin: novoResp.usuario,
      },
      { porLogin: usuarioSessao.usuario },
    );

    const destinoId = String(novoResp._id);
    const autorId = String(usuarioSessao.id);
    if (destinoId && destinoId !== autorId) {
      try {
        await criarNotificacao({
          destinatarioTipo: novoResp.perfil === "admin" ? "admin" : "tecnico",
          destinatarioId: destinoId,
          chamadoId: String(chamadoAtualizado._id),
          tipo: "atribuido",
          titulo: `Chamado #${chamadoAtualizado.numero}: ${chamadoAtualizado.titulo}`,
          mensagem: `Você foi definido como responsável por ${usuarioSessao.nome}.`,
          url: `/tecnico/chamados/${String(chamadoAtualizado._id)}`,
          meta: {
            autor: {
              tipo: perfil || "tecnico",
              id: autorId,
              nome: usuarioSessao.nome,
              login: usuarioSessao.usuario,
            },
          },
        });
      } catch (errNotif) {
        console.error("[notificacao] falha ao notificar novo responsável:", errNotif);
      }
    }

    await registrarEventoSistema({
      req,
      nivel: "info",
      modulo: "tecnico",
      evento: "chamado.reatribuido",
      acao: "atualizar_responsavel",
      resultado: "sucesso",
      mensagem: `Responsavel alterado no chamado #${chamadoAtualizado?.numero || ""}.`,
      alvo: {
        tipo: "chamado",
        id: String(chamadoAtualizado?._id || chamadoId),
        numero: String(chamadoAtualizado?.numero || ""),
      },
      meta: {
        novoResponsavelId: String(novoResp?._id || ""),
        novoResponsavelLogin: String(novoResp?.usuario || ""),
      },
    });

    req.session.flash = { tipo: "success", mensagem: "Responsável do chamado atualizado." };
    return res.redirect(`/tecnico/chamados/${chamadoId}`);
  } catch (e) {
    await registrarEventoSistema({
      req,
      nivel: "warn",
      modulo: "tecnico",
      evento: "chamado.atualizar_responsavel",
      acao: "atualizar_responsavel",
      resultado: "erro",
      mensagem: e?.message || "Falha ao atualizar responsavel.",
      alvo: {
        tipo: "chamado",
        id: chamadoId,
      },
    });

    req.session.flash = {
      tipo: "error",
      mensagem: e?.message || "Não foi possível atualizar o responsável.",
    };
    return res.redirect(`/tecnico/chamados/${chamadoId}`);
  }
}

export async function tecnicoChamadoSolucaoPost(req, res) {
  const usuarioSessao = req.session?.usuario;
  const solucao = String(req.body?.solucao || "").trim();
  let anexos = [];
  let chamadoAtualizado = null;
  let persistido = false;

  try {
    if (req.uploadError) throw new Error(req.uploadError);
    anexos = mapearArquivosUpload(req.files);

    chamadoAtualizado = await adicionarInteracaoTecnico(
      req.params.id,
      {
        id: usuarioSessao.id,
        nome: usuarioSessao.nome,
        usuario: usuarioSessao.usuario,
      },
      solucao,
      {
        tipo: "solucao",
        porLogin: usuarioSessao.usuario,
        mudarStatusPara: "aguardando_usuario", // se você quiser manter o fluxo
        anexos,
      },
    );
    persistido = true;

    await registrarEventoSistema({
      req,
      nivel: "info",
      modulo: "tecnico",
      evento: "chamado.solucao_tecnico",
      acao: "interacao_solucao",
      resultado: "sucesso",
      mensagem: `Solucao enviada no chamado #${chamadoAtualizado?.numero || ""}.`,
      alvo: {
        tipo: "chamado",
        id: String(chamadoAtualizado?._id || req.params.id),
        numero: String(chamadoAtualizado?.numero || ""),
      },
      meta: {
        tamanhoMensagem: solucao.length,
        qtdAnexos: anexos.length,
      },
    });

    req.session.flash = {
      tipo: "success",
      mensagem: "Solução enviada. Aguardando resposta do usuário.",
    };
  } catch (e) {
    if (!persistido) {
      await apagarArquivosUpload(req.files);
    }

    await registrarEventoSistema({
      req,
      nivel: "warn",
      modulo: "tecnico",
      evento: "chamado.solucao_tecnico",
      acao: "interacao_solucao",
      resultado: "erro",
      mensagem: e?.message || "Falha ao enviar solucao.",
      alvo: {
        tipo: "chamado",
        id: String(req.params.id || ""),
      },
    });

    req.session.flash = {
      tipo: "error",
      mensagem: e.message || "Falha ao enviar solução.",
    };
  }

  return res.redirect(`/tecnico/chamados/${req.params.id}`);
}
export async function tecnicoChamadoInteracaoPost(req, res) {
  let persistido = false;
  try {
    if (req.uploadError) throw new Error(req.uploadError);

    const usuarioSessao = req.session?.usuario;
    const texto = String(req.body?.texto || "").trim();
    const tipo = String(req.body?.tipo || "");
    const anexos = mapearArquivosUpload(req.files);

    const t = tipo === "solucao" ? "solucao" : "mensagem";
    const mudarStatusPara = t === "solucao" ? "aguardando_usuario" : null;

    const chamadoAtualizado = await adicionarInteracaoTecnico(
      req.params.id,
      { id: usuarioSessao.id, nome: usuarioSessao.nome, usuario: usuarioSessao.usuario },
      texto,
      { tipo: t, porLogin: usuarioSessao.usuario, mudarStatusPara, anexos }
    );
    persistido = true;

    const solicitanteId = String(chamadoAtualizado?.criadoPor?.usuarioId || "");
    const autorId = String(usuarioSessao?.id || "");

    if (solicitanteId && solicitanteId !== autorId) {
      await criarNotificacao({
        destinatarioTipo: "usuario",
        destinatarioId: solicitanteId,
        chamadoId: String(chamadoAtualizado._id),
        tipo: t === "solucao" ? "nova_solucao" : "nova_mensagem",
        titulo: `Chamado #${chamadoAtualizado.numero}: ${chamadoAtualizado.titulo}`,
        mensagem: t === "solucao" ? "Técnico enviou uma solução." : "Nova mensagem do técnico.",
        url: `/chamados/${String(chamadoAtualizado._id)}`,
        meta: {
          autor: { tipo: "tecnico", id: autorId, nome: usuarioSessao.nome, login: usuarioSessao.usuario },
        },
      });
    }

    req.session.flash = { tipo: "success", mensagem: t === "solucao" ? "Solução enviada." : "Mensagem enviada." };
    await registrarEventoSistema({
      req,
      nivel: "info",
      modulo: "tecnico",
      evento: t === "solucao" ? "chamado.solucao_tecnico" : "chamado.interacao_tecnico",
      acao: "interacao",
      resultado: "sucesso",
      mensagem:
        t === "solucao"
          ? `Solucao enviada no chamado #${chamadoAtualizado?.numero || ""}.`
          : `Mensagem tecnica no chamado #${chamadoAtualizado?.numero || ""}.`,
      alvo: {
        tipo: "chamado",
        id: String(chamadoAtualizado?._id || req.params.id),
        numero: String(chamadoAtualizado?.numero || ""),
      },
      meta: {
        tipoInteracao: t,
        tamanhoMensagem: texto.length,
        qtdAnexos: anexos.length,
      },
    });

    return res.redirect(`/tecnico/chamados/${req.params.id}`);
  } catch (err) {
    if (!persistido) {
      await apagarArquivosUpload(req.files);
    }

    await registrarEventoSistema({
      req,
      nivel: "warn",
      modulo: "tecnico",
      evento: "chamado.interacao_tecnico",
      acao: "interacao",
      resultado: "erro",
      mensagem: err?.message || "Erro ao enviar interacao tecnica.",
      alvo: {
        tipo: "chamado",
        id: String(req.params.id || ""),
      },
    });

    console.error(err);
    req.session.flash = { tipo: "error", mensagem: err?.message || "Erro ao enviar." };
    return res.redirect(`/tecnico/chamados/${req.params.id}`);
  }
}
