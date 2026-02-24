import { listarChamados, contarChamados } from "../chamados/core/chamadosCoreRepo.js";

function fmtQuando(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("pt-BR");
}

function inicioDeHoje() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function obterHomeTecnicoData(tecnicoId) {
  const hoje = inicioDeHoje();

  const [
    chamadosAbertos,
    emAtendimento,
    minhaFila,
    filaGeral,
    aguardandoUsuario,
    criadosHoje,
    chamadosCriticos,
  ] = await Promise.all([
    contarChamados({ status: "aberto" }),
    contarChamados({ status: "em_atendimento" }),
    contarChamados({ responsavelId: tecnicoId, status: ["em_atendimento", "aguardando_usuario"] }),
    contarChamados({ status: "aberto", somenteSemResponsavel: true }),
    contarChamados({ status: "aguardando_usuario" }),
    contarChamados({ createdFrom: hoje }),
    contarChamados({ prioridade: "alta", status: ["aberto", "em_atendimento", "aguardando_usuario"] }),
  ]);

  const ultimosChamadosRaw = await listarChamados({ limit: 10 });

  const ultimosChamados = (ultimosChamadosRaw || []).slice(0, 5).map((c) => ({
    id: String(c._id),
    numero: c.numero ?? "-",
    titulo: c.titulo ?? "(sem título)",
    status: c.status ?? "-",
    solicitante: c?.criadoPor?.nome || c?.criadoPor?.login || "-",
    quando: fmtQuando(c.updatedAt || c.createdAt),
  }));

  const logs = [];

  return {
    kpis: {
      chamadosAbertos,
      chamadosCriticos,
      aguardandoTecnico: filaGeral,
      criadosHoje,
      emAtendimento,
      emAndamento: emAtendimento,
      minhaFila,
      filaGeral,
      aguardandoUsuario,
      vencendoSla: 0,
    },
    ultimosChamados,
    logs,
  };
}
