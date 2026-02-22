import { listarChamados, contarChamados } from "../chamados/chamadosRepo.js"; 

function inicioDoDiaLocal(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function fimDoDiaLocal(date = new Date()) {
  const d = inicioDoDiaLocal(date);
  d.setDate(d.getDate() + 1);
  return d;
}

function fmtQuando(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("pt-BR");
}

export async function obterHomeTecnicoData(tecnicoId) {
  const hojeIni = inicioDoDiaLocal();
  const hojeFim = fimDoDiaLocal();

  // KPIs (100% reais)
  const [
    chamadosAbertos,
    emAtendimento,
    minhaFila,
    filaGeral,
    resolvidosHoje,
  ] = await Promise.all([
    contarChamados({ status: "aberto" }),
    contarChamados({ status: "em_atendimento" }),
    contarChamados({ responsavelId: tecnicoId, status: ["aberto", "em_atendimento"] }),
    contarChamados({ status: "aberto", somenteSemResponsavel: true }),
    contarChamados({
      responsavelId: tecnicoId,
      status: "resolvido",
      updatedFrom: hojeIni,
      updatedTo: hojeFim,
    }),
  ]);

  // Últimos chamados (reaproveita sua listagem com projeção mínima)
  const ultimosChamadosRaw = await listarChamados({ limit: 10 });

 const ultimosChamados = ultimosChamadosRaw.slice(0, 5).map((c) => ({
  id: String(c._id),               // ✅ ADD
  numero: c.numero ?? "-",
  titulo: c.titulo ?? "(sem título)",
  status: c.status ?? "-",
  solicitante: c?.criadoPor?.nome || c?.criadoPor?.login || "-",
  quando: fmtQuando(c.createdAt),
}));

  // logs: você ainda não tem repo/collection? então manda vazio SEM quebrar view
  const logs = [];

  return {
    kpis: { chamadosAbertos, emAtendimento, minhaFila, filaGeral, resolvidosHoje },
    ultimosChamados,
    logs,
  };
}