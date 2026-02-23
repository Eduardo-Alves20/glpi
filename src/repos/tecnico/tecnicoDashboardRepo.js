import { listarChamados, contarChamados } from "../chamados/chamadosRepo.js";

function fmtQuando(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("pt-BR");
}

export async function obterHomeTecnicoData(tecnicoId) {
  // KPIs (100% reais)
  const [
    chamadosAbertos,
    emAtendimento,
    minhaFila,
    filaGeral,
    aguardandoUsuario,
  ] = await Promise.all([
    contarChamados({ status: "aberto" }),
    contarChamados({ status: "em_atendimento" }),
    contarChamados({ responsavelId: tecnicoId, status: ["aberto", "em_atendimento"] }),
    contarChamados({ status: "aberto", somenteSemResponsavel: true }),
    contarChamados({ responsavelId: tecnicoId, status: "aguardando_usuario" }),
  ]);

  // Últimos chamados (reaproveita sua listagem com projeção mínima)
  const ultimosChamadosRaw = await listarChamados({ limit: 10 });

  const ultimosChamados = (ultimosChamadosRaw || []).slice(0, 5).map((c) => ({
    id: String(c._id),
    numero: c.numero ?? "-",
    titulo: c.titulo ?? "(sem título)",
    status: c.status ?? "-",
    solicitante: c?.criadoPor?.nome || c?.criadoPor?.login || "-",
    quando: fmtQuando(c.createdAt),
  }));

  // logs: você ainda não tem repo/collection? então manda vazio SEM quebrar view
  const logs = [];

  return {
    kpis: { chamadosAbertos, emAtendimento, minhaFila, filaGeral, aguardandoUsuario },
    ultimosChamados,
    logs,
  };
}