const HORAS_SLA_POR_PRIORIDADE = {
  critica: 4,
  alta: 8,
  media: 24,
  baixa: 48,
};

const STATUS_ATIVOS = new Set(["aberto", "em_atendimento", "aguardando_usuario"]);

function paraData(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function plural(n, singular, pluralForm) {
  return n === 1 ? singular : pluralForm;
}

function duracaoCurta(ms = 0) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const dias = Math.floor(totalMin / 1440);
  const horas = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;

  if (dias > 0) {
    if (horas > 0) return `${dias} ${plural(dias, "dia", "dias")} ${horas}h`;
    return `${dias} ${plural(dias, "dia", "dias")}`;
  }
  if (horas > 0) {
    if (mins > 0) return `${horas}h ${mins}min`;
    return `${horas}h`;
  }
  return `${mins}min`;
}

export function calcularPrazoSlaChamado(chamado = {}) {
  const prioridade = String(chamado?.prioridade || "").trim().toLowerCase();
  const horas = Number(HORAS_SLA_POR_PRIORIDADE[prioridade] || 0);
  const inicio = paraData(chamado?.createdAt);
  if (!horas || !inicio) return null;
  return new Date(inicio.getTime() + (horas * 60 * 60 * 1000));
}

export function avaliarSlaChamado(chamado = {}, { now = new Date() } = {}) {
  const status = String(chamado?.status || "").trim().toLowerCase();
  const prazo = calcularPrazoSlaChamado(chamado);
  if (!prazo) {
    return {
      classe: "sem_sla",
      label: "SLA n/a",
      tooltip: "SLA nao definido para a prioridade deste chamado.",
      prazoEm: null,
      atrasado: false,
    };
  }

  const referencia = paraData(now) || new Date();
  const diff = prazo.getTime() - referencia.getTime();
  const absDiff = Math.abs(diff);
  const ativo = STATUS_ATIVOS.has(status);

  if (!ativo) {
    return {
      classe: "encerrado",
      label: "Encerrado",
      tooltip: `Prazo alvo: ${prazo.toLocaleString("pt-BR")}.`,
      prazoEm: prazo,
      atrasado: false,
    };
  }

  if (diff < 0) {
    return {
      classe: "atrasado",
      label: `Atrasado ${duracaoCurta(absDiff)}`,
      tooltip: `SLA estourado ha ${duracaoCurta(absDiff)}. Prazo alvo: ${prazo.toLocaleString("pt-BR")}.`,
      prazoEm: prazo,
      atrasado: true,
    };
  }

  if (diff <= (2 * 60 * 60 * 1000)) {
    return {
      classe: "vencendo",
      label: `Vence em ${duracaoCurta(diff)}`,
      tooltip: `SLA proximo do vencimento. Prazo alvo: ${prazo.toLocaleString("pt-BR")}.`,
      prazoEm: prazo,
      atrasado: false,
    };
  }

  return {
    classe: "em_dia",
    label: `Em dia (${duracaoCurta(diff)})`,
    tooltip: `Dentro do SLA. Prazo alvo: ${prazo.toLocaleString("pt-BR")}.`,
    prazoEm: prazo,
    atrasado: false,
  };
}

