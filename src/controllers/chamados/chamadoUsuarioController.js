import {
  acharChamadoPorIdDoUsuario,
  usuarioConfirmarSolucao,
  usuarioReabrirChamado,
  usuarioAdicionarInteracao,
} from "../../repos/chamados/usuario/chamadosUsuarioRepo.js";
import {
  acharAvaliacaoPorChamado,
  registrarOuAtualizarAvaliacao,
  removerAvaliacaoPorChamado,
} from "../../repos/avaliacoesAtendimentoRepo.js";
import { acharChamadoPorId } from "../../repos/chamados/core/chamadosCoreRepo.js";
import { criarNotificacao } from "../../repos/notificacoesRepo.js";
import { acharPorId } from "../../repos/usuariosRepo.js";
import { registrarEventoSistema } from "../../service/logsService.js";
import { apagarArquivosUpload, mapearArquivosUpload } from "../../service/anexosService.js";
import {
  notificarSeguidoresChamado,
  chaveDestinoNotificacao,
} from "../../service/notificacoesSeguidoresChamadoService.js";

function resolverTecnicoParaAvaliacao(chamado = {}) {
  const baseResolvidoSemAtendimento = Boolean(chamado?.baseConhecimento?.resolvidoSemAtendimento);
  if (baseResolvidoSemAtendimento) {
    return { id: "", nome: "", login: "", origem: "base_conhecimento" };
  }

  const idResponsavel = String(chamado?.responsavelId || "").trim();
  const nomeResponsavel = String(chamado?.responsavelNome || "").trim();
  const loginResponsavel = String(chamado?.responsavelLogin || "").trim();
  if (idResponsavel) {
    return {
      id: idResponsavel,
      nome: nomeResponsavel,
      login: loginResponsavel,
      origem: "responsavel",
    };
  }

  const idSolucao = String(chamado?.solucaoPor?.tecnicoId || "").trim();
  const nomeSolucao = String(chamado?.solucaoPor?.nome || "").trim();
  const loginSolucao = String(chamado?.solucaoPor?.login || "").trim();
  if (idSolucao) {
    return {
      id: idSolucao,
      nome: nomeSolucao,
      login: loginSolucao,
      origem: "solucao",
    };
  }

  return { id: "", nome: "", login: "", origem: "" };
}

async function destinatariosTecnicosDoChamado(chamado = {}) {
  const mapa = new Map();

  const respId = String(chamado?.responsavelId || "").trim();
  if (respId) {
    try {
      const usuario = await acharPorId(respId);
      if (usuario) {
        const perfil = String(usuario?.perfil || "").toLowerCase() === "admin" ? "admin" : "tecnico";
        mapa.set(`${perfil}:${respId}`, {
          tipo: perfil,
          id: respId,
        });
      } else {
        mapa.set(`tecnico:${respId}`, { tipo: "tecnico", id: respId });
      }
    } catch {
      mapa.set(`tecnico:${respId}`, { tipo: "tecnico", id: respId });
    }
  }

  const apoio = Array.isArray(chamado?.tecnicosApoio) ? chamado.tecnicosApoio : [];
  for (const item of apoio) {
    const id = String(item?.id || "").trim();
    if (!id) continue;
    const perfil = String(item?.perfil || "").toLowerCase() === "admin" ? "admin" : "tecnico";
    mapa.set(`${perfil}:${id}`, { tipo: perfil, id });
  }

  return [...mapa.values()];
}

export async function usuarioChamadoShowGet(req, res) {
  const usuarioSessao = req.session?.usuario;
  const isAdmin = String(usuarioSessao?.perfil || "").toLowerCase() === "admin";

  const chamado = await acharChamadoPorIdDoUsuario(
    req.params.id,
    usuarioSessao.id,
    { permitirAdmin: isAdmin },
  );
  if (!chamado) {
    req.session.flash = { tipo: "error", mensagem: "Chamado nao encontrado." };
    return res.redirect(isAdmin ? "/admin/chamados" : "/chamados/meus");
  }

  const avaliacaoChamado = await acharAvaliacaoPorChamado(String(chamado?._id || ""));
  const podeAvaliarChamado = String(chamado?.criadoPor?.usuarioId || "") === String(usuarioSessao?.id || "");
  const tecnicoAvaliacao = resolverTecnicoParaAvaliacao(chamado);
  const podeAvaliarAtendimento = Boolean(tecnicoAvaliacao.id);
  const mensagemBloqueioAvaliacao = chamado?.status === "fechado" && !podeAvaliarAtendimento
    ? "Este chamado foi encerrado sem atendimento tecnico direto. Avaliacao nao se aplica neste caso."
    : "";

  return res.render("chamados/show", {
    layout: "layout-app",
    titulo: `Chamado #${chamado.numero}`,
    ambiente: process.env.AMBIENTE || "LOCAL",
    usuarioSessao,
    cssPortal: "/styles/usuario.css",
    cssExtra: "/styles/chamado-show.css",
    chamado,
    avaliacaoChamado,
    podeAvaliarChamado,
    podeAvaliarAtendimento,
    mensagemBloqueioAvaliacao,
  });
}

export async function usuarioChamadoConfirmarPost(req, res) {
  let persistido = false;
  const usuarioSessao = req.session?.usuario;
  const isAdmin = String(usuarioSessao?.perfil || "").toLowerCase() === "admin";
  const comentario = String(req.body?.comentario || "").trim();

  try {
    if (req.uploadError) throw new Error(req.uploadError);
    const anexos = mapearArquivosUpload(req.files);

    const chamado = await usuarioConfirmarSolucao(req.params.id, usuarioSessao.id, {
      porLogin: usuarioSessao.usuario,
      comentario,
      anexos,
      permitirAdmin: isAdmin,
    });
    persistido = true;

    try {
      const destinatarios = await destinatariosTecnicosDoChamado(chamado);
      await Promise.all(
        destinatarios.map((d) => criarNotificacao({
          destinatarioTipo: d.tipo,
          destinatarioId: d.id,
          chamadoId: String(chamado._id),
          tipo: "mudou_status",
          titulo: `Chamado #${chamado.numero}: ${chamado.titulo}`,
          mensagem: "Chamado confirmado e fechado pelo solicitante.",
          url: `/tecnico/chamados/${String(chamado._id)}`,
          meta: {
            autor: {
              tipo: isAdmin ? "admin" : "usuario",
              id: String(usuarioSessao?.id || ""),
              nome: usuarioSessao?.nome,
              login: usuarioSessao?.usuario,
            },
          },
        })),
      );
    } catch (errNotif) {
      console.error("[notificacao] falha ao notificar tecnicos (confirmacao):", errNotif);
    }

    try {
      await notificarSeguidoresChamado({
        chamado,
        tipo: "mudou_status",
        titulo: `Chamado #${chamado.numero}: ${chamado.titulo}`,
        mensagem: "Chamado confirmado e fechado pelo solicitante.",
        url: `/tecnico/chamados/${String(chamado._id)}`,
        autor: {
          tipo: isAdmin ? "admin" : "usuario",
          id: String(usuarioSessao?.id || ""),
          nome: usuarioSessao?.nome,
          login: usuarioSessao?.usuario,
        },
        ignorar: [chaveDestinoNotificacao({ perfil: usuarioSessao?.perfil, id: usuarioSessao?.id })],
      });
    } catch (errNotif) {
      console.error("[notificacao] falha ao notificar seguidores (confirmacao):", errNotif);
    }

    await registrarEventoSistema({
      req,
      nivel: "info",
      modulo: "chamados",
      evento: "chamado.confirmado_usuario",
      acao: "confirmar",
      resultado: "sucesso",
      mensagem: isAdmin
        ? `Chamado #${chamado?.numero || ""} confirmado e fechado por admin.`
        : `Chamado #${chamado?.numero || ""} confirmado e fechado pelo usuario.`,
      alvo: {
        tipo: "chamado",
        id: String(chamado?._id || req.params.id),
        numero: String(chamado?.numero || ""),
      },
      meta: {
        comentario: comentario.slice(0, 200),
        qtdAnexos: anexos.length,
      },
    });

    req.session.flash = {
      tipo: "success",
      mensagem: "Chamado fechado. Obrigado!",
    };
  } catch (e) {
    if (/status invalido/i.test(String(e?.message || ""))) {
      try {
        const atual = isAdmin
          ? await acharChamadoPorId(req.params.id)
          : await acharChamadoPorIdDoUsuario(req.params.id, usuarioSessao.id);
        if (atual && String(atual.status || "") === "fechado") {
          req.session.flash = {
            tipo: "success",
            mensagem: "Chamado ja estava fechado.",
          };
          return res.redirect(`/chamados/${req.params.id}`);
        }
      } catch {}
    }

    if (!persistido) {
      await apagarArquivosUpload(req.files);
    }

    req.session.flash = {
      tipo: "error",
      mensagem: e?.message || "Nao foi possivel confirmar.",
    };
  }

  return res.redirect(`/chamados/${req.params.id}`);
}

export async function usuarioChamadoReabrirPost(req, res) {
  let persistido = false;
  const usuarioSessao = req.session?.usuario;
  const isAdmin = String(usuarioSessao?.perfil || "").toLowerCase() === "admin";
  const comentario = String(req.body?.comentario || "").trim();

  try {
    if (req.uploadError) throw new Error(req.uploadError);
    const anexos = mapearArquivosUpload(req.files);

    const chamado = await usuarioReabrirChamado(req.params.id, usuarioSessao.id, comentario, {
      porLogin: usuarioSessao.usuario,
      anexos,
      permitirAdmin: isAdmin,
    });
    persistido = true;
    await removerAvaliacaoPorChamado(String(chamado?._id || req.params.id));

    try {
      const destinatarios = await destinatariosTecnicosDoChamado(chamado);
      await Promise.all(
        destinatarios.map((d) => criarNotificacao({
          destinatarioTipo: d.tipo,
          destinatarioId: d.id,
          chamadoId: String(chamado._id),
          tipo: "mudou_status",
          titulo: `Chamado #${chamado.numero}: ${chamado.titulo}`,
          mensagem: "Chamado reaberto pelo solicitante e retornou para fila.",
          url: `/tecnico/chamados/${String(chamado._id)}`,
          meta: {
            autor: {
              tipo: isAdmin ? "admin" : "usuario",
              id: String(usuarioSessao?.id || ""),
              nome: usuarioSessao?.nome,
              login: usuarioSessao?.usuario,
            },
          },
        })),
      );
    } catch (errNotif) {
      console.error("[notificacao] falha ao notificar tecnicos (reabertura):", errNotif);
    }

    try {
      await notificarSeguidoresChamado({
        chamado,
        tipo: "mudou_status",
        titulo: `Chamado #${chamado.numero}: ${chamado.titulo}`,
        mensagem: "Chamado reaberto pelo solicitante e retornou para fila.",
        url: `/tecnico/chamados/${String(chamado._id)}`,
        autor: {
          tipo: isAdmin ? "admin" : "usuario",
          id: String(usuarioSessao?.id || ""),
          nome: usuarioSessao?.nome,
          login: usuarioSessao?.usuario,
        },
        ignorar: [chaveDestinoNotificacao({ perfil: usuarioSessao?.perfil, id: usuarioSessao?.id })],
      });
    } catch (errNotif) {
      console.error("[notificacao] falha ao notificar seguidores (reabertura):", errNotif);
    }

    await registrarEventoSistema({
      req,
      nivel: "warn",
      modulo: "chamados",
      evento: "chamado.reaberto_usuario",
      acao: "reabrir",
      resultado: "sucesso",
      mensagem: isAdmin
        ? `Chamado #${chamado?.numero || ""} reaberto por admin.`
        : `Chamado #${chamado?.numero || ""} reaberto pelo usuario.`,
      alvo: {
        tipo: "chamado",
        id: String(chamado?._id || req.params.id),
        numero: String(chamado?.numero || ""),
      },
      meta: {
        comentario: comentario.slice(0, 200),
        qtdAnexos: anexos.length,
      },
    });

    req.session.flash = {
      tipo: "success",
      mensagem: "Chamado reaberto e voltou para a fila.",
    };
  } catch (e) {
    if (/status invalido/i.test(String(e?.message || ""))) {
      try {
        const atual = isAdmin
          ? await acharChamadoPorId(req.params.id)
          : await acharChamadoPorIdDoUsuario(req.params.id, usuarioSessao.id);
        if (atual && String(atual.status || "") === "aberto") {
          req.session.flash = {
            tipo: "success",
            mensagem: "Chamado ja estava reaberto.",
          };
          return res.redirect(`/chamados/${req.params.id}`);
        }
      } catch {}
    }

    if (!persistido) {
      await apagarArquivosUpload(req.files);
    }

    req.session.flash = {
      tipo: "error",
      mensagem: e?.message || "Nao foi possivel reabrir.",
    };
  }

  return res.redirect(`/chamados/${req.params.id}`);
}

export async function usuarioChamadoAvaliacaoPost(req, res) {
  const usuarioSessao = req.session?.usuario;
  const chamadoId = String(req.params.id || "");
  const perfilSessao = String(usuarioSessao?.perfil || "").toLowerCase();

  try {
    if (!usuarioSessao?.id || perfilSessao !== "usuario") {
      throw new Error("Apenas o usuario solicitante pode avaliar o atendimento.");
    }

    const chamado = await acharChamadoPorIdDoUsuario(
      chamadoId,
      usuarioSessao?.id,
      { permitirAdmin: false },
    );
    if (!chamado) throw new Error("Chamado nao encontrado.");
    if (String(chamado?.criadoPor?.usuarioId || "") !== String(usuarioSessao?.id || "")) {
      throw new Error("Apenas o solicitante deste chamado pode enviar avaliacao.");
    }
    if (String(chamado?.status || "") !== "fechado") {
      throw new Error("A avaliacao so pode ser enviada com chamado fechado.");
    }

    const tecnicoAvaliacao = resolverTecnicoParaAvaliacao(chamado);
    if (!tecnicoAvaliacao.id) {
      throw new Error("Este chamado foi encerrado sem atendimento tecnico direto e nao pode ser avaliado.");
    }

    const avaliacaoExistente = await acharAvaliacaoPorChamado(chamadoId);
    if (avaliacaoExistente) {
      throw new Error("Este chamado ja foi avaliado e nao pode ser alterado.");
    }

    const nota = Number(req.body?.nota || 0);
    const feedback = String(req.body?.feedback || "").trim();
    const sugestao = String(req.body?.sugestao || "").trim();

    const avaliacao = await registrarOuAtualizarAvaliacao({
      chamado: {
        ...chamado,
        responsavelId: tecnicoAvaliacao.id,
        responsavelNome: tecnicoAvaliacao.nome || chamado?.responsavelNome || chamado?.solucaoPor?.nome || "",
        responsavelLogin: tecnicoAvaliacao.login || chamado?.responsavelLogin || chamado?.solucaoPor?.login || "",
      },
      avaliador: {
        id: String(usuarioSessao?.id || ""),
        nome: usuarioSessao?.nome,
        usuario: usuarioSessao?.usuario,
        perfil: usuarioSessao?.perfil,
      },
      nota,
      feedback,
      sugestao,
    });

    const tecnicoId = String(tecnicoAvaliacao.id || "").trim();
    if (tecnicoId && tecnicoId !== String(usuarioSessao?.id || "")) {
      try {
        const tecnicoUser = await acharPorId(tecnicoId);
        const perfilDestino = String(tecnicoUser?.perfil || "").toLowerCase();
        const destinatarioTipo = perfilDestino === "admin" ? "admin" : "tecnico";
        const destinoTecnico = destinatarioTipo === "tecnico";

        await criarNotificacao({
          destinatarioTipo,
          destinatarioId: tecnicoId,
          chamadoId: destinoTecnico ? null : String(chamado?._id || chamadoId),
          tipo: "mudou_status",
          titulo: destinoTecnico
            ? "Nova avaliacao recebida"
            : `Chamado #${chamado.numero}: ${chamado.titulo}`,
          mensagem: destinoTecnico
            ? "Voce recebeu uma nova avaliacao de atendimento. Abra Minhas avaliacoes."
            : `Novo feedback recebido: nota ${Number(avaliacao?.nota || 0).toFixed(1)}/5.`,
          url: destinoTecnico
            ? "/usuario/avaliacoes"
            : `/tecnico/chamados/${String(chamado?._id || chamadoId)}`,
          meta: destinoTecnico
            ? { origem: "avaliacao_atendimento" }
            : {
                autor: {
                  tipo: "usuario",
                  id: String(usuarioSessao?.id || ""),
                  nome: usuarioSessao?.nome,
                  login: usuarioSessao?.usuario,
                },
              },
        });
      } catch (errNotif) {
        console.error("[notificacao] falha ao notificar tecnico sobre avaliacao:", errNotif);
      }
    }

    await registrarEventoSistema({
      req,
      nivel: "info",
      modulo: "chamados",
      evento: "chamado.avaliacao.registrada",
      acao: "avaliar_atendimento",
      resultado: "sucesso",
      mensagem: `Avaliacao registrada no chamado #${chamado?.numero || ""}.`,
      alvo: {
        tipo: "chamado",
        id: String(chamado?._id || chamadoId),
        numero: String(chamado?.numero || ""),
      },
      meta: {
        nota: Number(avaliacao?.nota || 0),
        temFeedback: Boolean(feedback),
        temSugestao: Boolean(sugestao),
      },
    });

    req.session.flash = { tipo: "success", mensagem: "Avaliacao registrada com sucesso." };
  } catch (err) {
    await registrarEventoSistema({
      req,
      nivel: "warn",
      modulo: "chamados",
      evento: "chamado.avaliacao.registrada",
      acao: "avaliar_atendimento",
      resultado: "erro",
      mensagem: err?.message || "Falha ao registrar avaliacao.",
      alvo: {
        tipo: "chamado",
        id: chamadoId,
      },
    });
    req.session.flash = { tipo: "error", mensagem: err?.message || "Nao foi possivel registrar a avaliacao." };
  }

  return res.redirect(`/chamados/${chamadoId}`);
}

export async function usuarioChamadoInteracaoPost(req, res) {
  let persistido = false;
  try {
    if (req.uploadError) throw new Error(req.uploadError);

    const usuarioSessao = req.session?.usuario;
    const texto = String(req.body?.texto || "").trim();
    const anexos = mapearArquivosUpload(req.files);

    const chamadoAtualizado = await usuarioAdicionarInteracao(
      req.params.id,
      {
        id: usuarioSessao.id,
        nome: usuarioSessao.nome,
        usuario: usuarioSessao.usuario,
      },
      texto,
      { porLogin: usuarioSessao.usuario, anexos },
    );
    persistido = true;

    const autorId = String(usuarioSessao?.id || "");
    const destinatarios = await destinatariosTecnicosDoChamado(chamadoAtualizado);
    await Promise.all(
      destinatarios
        .filter((d) => String(d.id) !== autorId)
        .map((d) => criarNotificacao({
          destinatarioTipo: d.tipo,
          destinatarioId: d.id,
          chamadoId: String(chamadoAtualizado._id),
          tipo: "nova_mensagem",
          titulo: `Chamado #${chamadoAtualizado.numero}: ${chamadoAtualizado.titulo}`,
          mensagem: "Nova mensagem do usuario.",
          url: `/tecnico/chamados/${String(chamadoAtualizado._id)}`,
          meta: {
            autor: {
              tipo: "usuario",
              id: autorId,
              nome: usuarioSessao.nome,
              login: usuarioSessao.usuario,
            },
          },
        })),
    );

    try {
      await notificarSeguidoresChamado({
        chamado: chamadoAtualizado,
        tipo: "nova_mensagem",
        titulo: `Chamado #${chamadoAtualizado.numero}: ${chamadoAtualizado.titulo}`,
        mensagem: "Nova mensagem do usuario no chamado.",
        url: `/tecnico/chamados/${String(chamadoAtualizado._id)}`,
        autor: {
          tipo: "usuario",
          id: autorId,
          nome: usuarioSessao?.nome,
          login: usuarioSessao?.usuario,
        },
        ignorar: [chaveDestinoNotificacao({ perfil: usuarioSessao?.perfil, id: usuarioSessao?.id })],
      });
    } catch (errNotif) {
      console.error("[notificacao] falha ao notificar seguidores (mensagem usuario):", errNotif);
    }

    await registrarEventoSistema({
      req,
      nivel: "info",
      modulo: "chamados",
      evento: "chamado.interacao_usuario",
      acao: "interacao",
      resultado: "sucesso",
      mensagem: `Mensagem do usuario no chamado #${chamadoAtualizado?.numero || ""}.`,
      alvo: {
        tipo: "chamado",
        id: String(chamadoAtualizado?._id || req.params.id),
        numero: String(chamadoAtualizado?.numero || ""),
      },
      meta: {
        tamanhoMensagem: texto.length,
        qtdAnexos: anexos.length,
      },
    });

    req.session.flash = { tipo: "success", mensagem: "Mensagem enviada." };
    return res.redirect(`/chamados/${req.params.id}`);
  } catch (err) {
    if (!persistido) {
      await apagarArquivosUpload(req.files);
    }

    console.error(err);
    req.session.flash = {
      tipo: "error",
      mensagem: err?.message || "Erro ao enviar mensagem.",
    };
    return res.redirect(`/chamados/${req.params.id}`);
  }
}
