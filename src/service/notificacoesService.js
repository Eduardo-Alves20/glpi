import { criarNotificacao } from "../repos/notificacoesRepo.js";

function urlChamado({ perfilDestinatario, chamadoId }) {
  const base = (perfilDestinatario === "tecnico" || perfilDestinatario === "admin")
    ? "/tecnico/chamados"
    : "/chamados";
  return `${base}/${chamadoId}`;
}

export async function notificarNovaMensagem({
  chamadoId,
  tituloChamado,
  destinatarios, // [{tipo,id,perfilDestinatario}]
  autor,
  texto,
}) {
  const snippet = (texto || "").slice(0, 140);

  await Promise.all(destinatarios.map((d) => criarNotificacao({
    destinatario: { tipo: d.tipo, id: d.id },
    chamadoId,
    tipo: "nova_mensagem",
    titulo: `Nova mensagem: ${tituloChamado || "Chamado"}`,
    mensagem: snippet || "Você recebeu uma nova mensagem.",
    url: urlChamado({ perfilDestinatario: d.perfilDestinatario, chamadoId }),
    meta: { autor, snippet },
  })));
}

export async function notificarMudouStatus({
  chamadoId,
  tituloChamado,
  destinatarios,
  autor,
  statusAntigo,
  statusNovo,
}) {
  await Promise.all(destinatarios.map((d) => criarNotificacao({
    destinatario: { tipo: d.tipo, id: d.id },
    chamadoId,
    tipo: "mudou_status",
    titulo: `Status atualizado: ${tituloChamado || "Chamado"}`,
    mensagem: `Status: ${statusAntigo || "-"} → ${statusNovo}`,
    url: urlChamado({ perfilDestinatario: d.perfilDestinatario, chamadoId }),
    meta: { autor, statusAntigo, statusNovo },
  })));
}

export async function notificarNovoChamadoFila({
  chamadoId,
  tituloChamado,
  destinatarios, // técnicos/admins
  autor,
}) {
  await Promise.all(destinatarios.map((d) => criarNotificacao({
    destinatario: { tipo: d.tipo, id: d.id },
    chamadoId,
    tipo: "novo_chamado_fila",
    titulo: "Novo chamado na fila",
    mensagem: tituloChamado || "Um novo chamado foi aberto.",
    url: urlChamado({ perfilDestinatario: d.perfilDestinatario, chamadoId }),
    meta: { autor },
  })));
}