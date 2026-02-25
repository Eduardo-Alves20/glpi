import { acharChamadoPorId } from "../../repos/chamados/core/chamadosCoreRepo.js";
import {
  assumirChamado,
  atualizarResponsavelChamado,
  adicionarInteracaoTecnico,
  adicionarTecnicoApoioChamado,
  removerTecnicoApoioChamado,
  seguirNotificacoesChamado,
  pararNotificacoesChamado,
} from "../../repos/chamados/tecnico/chamadosTecnicoRepo.js";
import { criarNotificacao } from "../../repos/notificacoesRepo.js";
import { acharPorId, listarUsuariosPorPerfis } from "../../repos/usuariosRepo.js";
import { notificarNovoChamadoFila } from "../../service/notificacoesService.js";
import {
  notificarSeguidoresChamado,
  chaveDestinoNotificacao,
} from "../../service/notificacoesSeguidoresChamadoService.js";
import { registrarEventoSistema } from "../../service/logsService.js";
import { apagarArquivosUpload, mapearArquivosUpload } from "../../service/anexosService.js";
import {
  acharAvaliacaoPorChamado,
  moderarAvaliacaoPorChamado,
} from "../../repos/avaliacoesAtendimentoRepo.js";

function podeTecnicoVerChamado(usuarioSessao, chamado) {
  if (!chamado) return false;

  const perfil = String(usuarioSessao?.perfil || "");
  if (perfil === "admin" || perfil === "tecnico") return true;

  return false;
}

export async function tecnicoChamadoShowGet(req, res) {
  const usuarioSessao = req.session?.usuario;
  const perfilSessao = String(usuarioSessao?.perfil || "").toLowerCase();
  const isAdminSessao = perfilSessao === "admin";

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

  const minhaChave = chaveDestinoNotificacao({
    perfil: usuarioSessao?.perfil,
    id: usuarioSessao?.id,
  });
  const inscritos = Array.isArray(chamado?.inscritosNotificacao)
    ? chamado.inscritosNotificacao
    : [];
  const seguindoNotificacoes = inscritos.some((x) => {
    const chave = chaveDestinoNotificacao({
      perfil: x?.perfil,
      id: x?.id,
    });
    return Boolean(minhaChave && chave && minhaChave === chave);
  });
  const avaliacaoChamado = isAdminSessao
    ? await acharAvaliacaoPorChamado(String(chamado?._id || ""))
    : null;

  return res.render("tecnico/chamados/show", {
    layout: "layout-app",
    titulo: `Chamado #${chamado.numero}`,
    ambiente: process.env.AMBIENTE || "LOCAL",
    usuarioSessao,
    chamado,
    avaliacaoChamado,
    equipeResponsaveis,
    seguindoNotificacoes,
    cssPortal: "/styles/usuario.css",
    cssExtra: "/styles/chamado-show.css",
  });
}

export async function tecnicoChamadoAvaliacaoModerarPost(req, res) {
  const usuarioSessao = req.session?.usuario;
  const chamadoId = String(req.params.id || "");
  const perfilSessao = String(usuarioSessao?.perfil || "").toLowerCase();

  try {
    if (!usuarioSessao?.id || perfilSessao !== "admin") {
      throw new Error("Apenas admin pode alterar avaliacao de chamado.");
    }

    const chamado = await acharChamadoPorId(chamadoId);
    if (!podeTecnicoVerChamado(usuarioSessao, chamado)) {
      throw new Error("Chamado nao encontrado ou sem permissao.");
    }

    const nota = Number(req.body?.nota || 0);
    const feedback = String(req.body?.feedback || "").trim();
    const sugestao = String(req.body?.sugestao || "").trim();
    const motivo = String(req.body?.motivo || "").trim();

    const avaliacao = await moderarAvaliacaoPorChamado(chamadoId, {
      nota,
      feedback,
      sugestao,
      motivo,
      moderador: {
        id: String(usuarioSessao?.id || ""),
        nome: usuarioSessao?.nome,
        usuario: usuarioSessao?.usuario,
        perfil: usuarioSessao?.perfil,
      },
    });

    await registrarEventoSistema({
      req,
      nivel: "security",
      modulo: "admin",
      evento: "chamado.avaliacao.moderada",
      acao: "moderar_avaliacao",
      resultado: "sucesso",
      mensagem: `Admin moderou avaliacao do chamado #${chamado?.numero || ""}.`,
      alvo: {
        tipo: "chamado",
        id: String(chamado?._id || chamadoId),
        numero: String(chamado?.numero || ""),
      },
      meta: {
        nota: Number(avaliacao?.nota || 0),
        motivo: motivo.slice(0, 300),
      },
    });

    req.session.flash = { tipo: "success", mensagem: "Avaliacao alterada pelo admin." };
  } catch (err) {
    await registrarEventoSistema({
      req,
      nivel: "warn",
      modulo: "admin",
      evento: "chamado.avaliacao.moderada",
      acao: "moderar_avaliacao",
      resultado: "erro",
      mensagem: err?.message || "Falha ao moderar avaliacao do chamado.",
      alvo: {
        tipo: "chamado",
        id: chamadoId,
      },
    });

    req.session.flash = { tipo: "error", mensagem: err?.message || "Nao foi possivel alterar a avaliacao." };
  }

  return res.redirect(`/tecnico/chamados/${chamadoId}`);
}

function perfilDestinoNotificacao(perfil = "") {
  return String(perfil || "").toLowerCase() === "admin" ? "admin" : "tecnico";
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

  try {
    await notificarSeguidoresChamado({
      chamado,
      tipo: "mudou_status",
      titulo: `Chamado #${chamado.numero}: ${chamado.titulo}`,
      mensagem: `${usuarioSessao.nome} assumiu o chamado.`,
      url: `/tecnico/chamados/${String(chamado._id)}`,
      autor: {
        tipo: perfilDestinoNotificacao(usuarioSessao?.perfil),
        id: String(usuarioSessao?.id || ""),
        nome: usuarioSessao?.nome,
        login: usuarioSessao?.usuario,
      },
      ignorar: [chaveDestinoNotificacao({ perfil: usuarioSessao?.perfil, id: usuarioSessao?.id })],
    });
  } catch (errNotif) {
    console.error("[notificacao] falha ao notificar seguidores na assuncao:", errNotif);
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

      try {
        await notificarSeguidoresChamado({
          chamado: chamadoAtualizado,
          tipo: "mudou_status",
          titulo: `Chamado #${chamadoAtualizado.numero}: ${chamadoAtualizado.titulo}`,
          mensagem: `${usuarioSessao.nome} devolveu o chamado para a fila.`,
          url: `/tecnico/chamados/${String(chamadoAtualizado._id)}`,
          autor: {
            tipo: perfilDestinoNotificacao(usuarioSessao?.perfil),
            id: String(usuarioSessao?.id || ""),
            nome: usuarioSessao?.nome,
            login: usuarioSessao?.usuario,
          },
          ignorar: [chaveDestinoNotificacao({ perfil: usuarioSessao?.perfil, id: usuarioSessao?.id })],
        });
      } catch (errNotif) {
        console.error("[notificacao] falha ao notificar seguidores (retorno fila):", errNotif);
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

    try {
      await notificarSeguidoresChamado({
        chamado: chamadoAtualizado,
        tipo: "mudou_status",
        titulo: `Chamado #${chamadoAtualizado.numero}: ${chamadoAtualizado.titulo}`,
        mensagem: `Responsavel alterado para ${novoResp.nome}.`,
        url: `/tecnico/chamados/${String(chamadoAtualizado._id)}`,
        autor: {
          tipo: perfilDestinoNotificacao(usuarioSessao?.perfil),
          id: String(usuarioSessao?.id || ""),
          nome: usuarioSessao?.nome,
          login: usuarioSessao?.usuario,
        },
        ignorar: [chaveDestinoNotificacao({ perfil: usuarioSessao?.perfil, id: usuarioSessao?.id })],
      });
    } catch (errNotif) {
      console.error("[notificacao] falha ao notificar seguidores (troca responsavel):", errNotif);
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

export async function tecnicoChamadoSeguirNotificacoesPost(req, res) {
  const usuarioSessao = req.session?.usuario;
  const chamadoId = String(req.params.id || "");

  try {
    if (!usuarioSessao?.id) throw new Error("Sessao invalida.");
    await seguirNotificacoesChamado(
      chamadoId,
      {
        id: usuarioSessao.id,
        nome: usuarioSessao.nome,
        usuario: usuarioSessao.usuario,
        perfil: usuarioSessao.perfil,
      },
      { porLogin: usuarioSessao.usuario },
    );
    req.session.flash = { tipo: "success", mensagem: "Notificacoes ativadas para este chamado." };
  } catch (e) {
    req.session.flash = { tipo: "error", mensagem: e?.message || "Falha ao ativar notificacoes." };
  }

  return res.redirect(`/tecnico/chamados/${chamadoId}`);
}

export async function tecnicoChamadoPararNotificacoesPost(req, res) {
  const usuarioSessao = req.session?.usuario;
  const chamadoId = String(req.params.id || "");

  try {
    if (!usuarioSessao?.id) throw new Error("Sessao invalida.");
    await pararNotificacoesChamado(
      chamadoId,
      {
        id: usuarioSessao.id,
        nome: usuarioSessao.nome,
        usuario: usuarioSessao.usuario,
        perfil: usuarioSessao.perfil,
      },
      { porLogin: usuarioSessao.usuario },
    );
    req.session.flash = { tipo: "success", mensagem: "Notificacoes desativadas para este chamado." };
  } catch (e) {
    req.session.flash = { tipo: "error", mensagem: e?.message || "Falha ao desativar notificacoes." };
  }

  return res.redirect(`/tecnico/chamados/${chamadoId}`);
}

export async function tecnicoChamadoApoioAdicionarPost(req, res) {
  const usuarioSessao = req.session?.usuario;
  const chamadoId = String(req.params.id || "");
  const apoioId = String(req.body?.apoioId || "").trim();
  let chamadoAtualizado = null;

  try {
    if (!usuarioSessao?.id) throw new Error("Sessao invalida.");
    if (!apoioId) throw new Error("Selecione um tecnico para apoio.");

    const tecnicoApoio = await acharPorId(apoioId);
    if (!tecnicoApoio) throw new Error("Tecnico de apoio nao encontrado.");
    if (!["tecnico", "admin"].includes(String(tecnicoApoio.perfil || "").toLowerCase())) {
      throw new Error("Perfil invalido para apoio.");
    }
    if (String(tecnicoApoio.status || "").toLowerCase() === "bloqueado") {
      throw new Error("Nao e possivel adicionar tecnico bloqueado.");
    }

    chamadoAtualizado = await adicionarTecnicoApoioChamado(
      chamadoId,
      {
        id: String(tecnicoApoio._id),
        nome: tecnicoApoio.nome,
        usuario: tecnicoApoio.usuario,
        perfil: tecnicoApoio.perfil,
      },
      { porLogin: usuarioSessao.usuario },
    );

    await seguirNotificacoesChamado(
      chamadoId,
      {
        id: String(tecnicoApoio._id),
        nome: tecnicoApoio.nome,
        usuario: tecnicoApoio.usuario,
        perfil: tecnicoApoio.perfil,
      },
      { porLogin: usuarioSessao.usuario },
    );

    const destinoId = String(tecnicoApoio._id);
    if (destinoId !== String(usuarioSessao.id || "")) {
      try {
        await criarNotificacao({
          destinatarioTipo: perfilDestinoNotificacao(tecnicoApoio.perfil),
          destinatarioId: destinoId,
          chamadoId: String(chamadoAtualizado._id),
          tipo: "mudou_status",
          titulo: `Chamado #${chamadoAtualizado.numero}: ${chamadoAtualizado.titulo}`,
          mensagem: `${usuarioSessao.nome} adicionou voce como tecnico de apoio.`,
          url: `/tecnico/chamados/${String(chamadoAtualizado._id)}`,
          meta: {
            autor: {
              tipo: perfilDestinoNotificacao(usuarioSessao.perfil),
              id: String(usuarioSessao.id),
              nome: usuarioSessao.nome,
              login: usuarioSessao.usuario,
            },
          },
        });
      } catch (errNotif) {
        console.error("[notificacao] falha ao notificar tecnico de apoio:", errNotif);
      }
    }

    try {
      await notificarSeguidoresChamado({
        chamado: chamadoAtualizado,
        tipo: "mudou_status",
        titulo: `Chamado #${chamadoAtualizado.numero}: ${chamadoAtualizado.titulo}`,
        mensagem: `Tecnico de apoio adicionado: ${tecnicoApoio.nome}.`,
        url: `/tecnico/chamados/${String(chamadoAtualizado._id)}`,
        autor: {
          tipo: perfilDestinoNotificacao(usuarioSessao?.perfil),
          id: String(usuarioSessao?.id || ""),
          nome: usuarioSessao?.nome,
          login: usuarioSessao?.usuario,
        },
        ignorar: [chaveDestinoNotificacao({ perfil: usuarioSessao?.perfil, id: usuarioSessao?.id })],
      });
    } catch (errNotif) {
      console.error("[notificacao] falha ao notificar seguidores (apoio adicionado):", errNotif);
    }

    req.session.flash = { tipo: "success", mensagem: "Tecnico de apoio adicionado." };
  } catch (e) {
    req.session.flash = { tipo: "error", mensagem: e?.message || "Falha ao adicionar tecnico de apoio." };
  }

  return res.redirect(`/tecnico/chamados/${chamadoId}`);
}

export async function tecnicoChamadoApoioRemoverPost(req, res) {
  const usuarioSessao = req.session?.usuario;
  const chamadoId = String(req.params.id || "");
  const apoioId = String(req.body?.apoioId || "").trim();
  let chamadoAtualizado = null;

  try {
    if (!usuarioSessao?.id) throw new Error("Sessao invalida.");
    if (!apoioId) throw new Error("Tecnico de apoio invalido.");

    chamadoAtualizado = await removerTecnicoApoioChamado(
      chamadoId,
      apoioId,
      { porLogin: usuarioSessao.usuario },
    );

    req.session.flash = { tipo: "success", mensagem: "Tecnico de apoio removido." };
  } catch (e) {
    req.session.flash = { tipo: "error", mensagem: e?.message || "Falha ao remover tecnico de apoio." };
  }

  if (chamadoAtualizado) {
    try {
      await notificarSeguidoresChamado({
        chamado: chamadoAtualizado,
        tipo: "mudou_status",
        titulo: `Chamado #${chamadoAtualizado.numero}: ${chamadoAtualizado.titulo}`,
        mensagem: "Tecnico de apoio removido deste chamado.",
        url: `/tecnico/chamados/${String(chamadoAtualizado._id)}`,
        autor: {
          tipo: perfilDestinoNotificacao(usuarioSessao?.perfil),
          id: String(usuarioSessao?.id || ""),
          nome: usuarioSessao?.nome,
          login: usuarioSessao?.usuario,
        },
        ignorar: [chaveDestinoNotificacao({ perfil: usuarioSessao?.perfil, id: usuarioSessao?.id })],
      });
    } catch (errNotif) {
      console.error("[notificacao] falha ao notificar seguidores (apoio removido):", errNotif);
    }
  }

  return res.redirect(`/tecnico/chamados/${chamadoId}`);
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
    const isAdmin = String(usuarioSessao?.perfil || "").toLowerCase() === "admin";
    const texto = String(req.body?.texto || "").trim();
    const tipo = String(req.body?.tipo || "");
    const anexos = mapearArquivosUpload(req.files);
    const chamadoAntes = await acharChamadoPorId(req.params.id);
    if (!chamadoAntes) throw new Error("Chamado nao encontrado.");

    const t = tipo === "solucao" ? "solucao" : "mensagem";
    if (!isAdmin && t === "mensagem" && String(chamadoAntes.status || "") === "aguardando_usuario") {
      throw new Error("Chamado aguardando usuario. Atualize a solucao ou aguarde a validacao.");
    }
    const solucaoAtualizada = t === "solucao" && String(chamadoAntes.status || "") === "aguardando_usuario";
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
        mensagem: t === "solucao"
          ? (solucaoAtualizada ? "Tecnico atualizou a solucao do chamado." : "Tecnico enviou uma solucao.")
          : "Nova mensagem do tecnico.",
        url: `/chamados/${String(chamadoAtualizado._id)}`,
        meta: {
          autor: { tipo: "tecnico", id: autorId, nome: usuarioSessao.nome, login: usuarioSessao.usuario },
        },
      });
    }

    try {
      await notificarSeguidoresChamado({
        chamado: chamadoAtualizado,
        tipo: t === "solucao" ? "nova_solucao" : "nova_mensagem",
        titulo: `Chamado #${chamadoAtualizado.numero}: ${chamadoAtualizado.titulo}`,
        mensagem: t === "solucao"
          ? (solucaoAtualizada ? "Solucao atualizada no chamado." : "Nova solucao enviada no chamado.")
          : "Nova interacao no chamado.",
        url: `/tecnico/chamados/${String(chamadoAtualizado._id)}`,
        autor: {
          tipo: perfilDestinoNotificacao(usuarioSessao?.perfil),
          id: String(usuarioSessao?.id || ""),
          nome: usuarioSessao?.nome,
          login: usuarioSessao?.usuario,
        },
        ignorar: [chaveDestinoNotificacao({ perfil: usuarioSessao?.perfil, id: usuarioSessao?.id })],
      });
    } catch (errNotif) {
      console.error("[notificacao] falha ao notificar seguidores (interacao tecnico):", errNotif);
    }

    req.session.flash = {
      tipo: "success",
      mensagem: t === "solucao"
        ? (solucaoAtualizada ? "Solucao atualizada. Usuario notificado." : "Solucao enviada. Aguardando usuario.")
        : "Mensagem enviada.",
    };
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

