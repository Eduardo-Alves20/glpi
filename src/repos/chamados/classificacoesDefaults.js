export const CATEGORIAS_PADRAO = [
  { chave: "acesso", nome: "Acesso", ordem: 10 },
  { chave: "incidente", nome: "Incidente", ordem: 20 },
  { chave: "solicitacao", nome: "Solicitacao", ordem: 30 },
  { chave: "infra", nome: "Infra", ordem: 40 },
  { chave: "outros", nome: "Outros", ordem: 50 },
];

export const PRIORIDADES_PADRAO = [
  { chave: "baixa", nome: "Baixa", ordem: 10 },
  { chave: "media", nome: "Media", ordem: 20 },
  { chave: "alta", nome: "Alta", ordem: 30 },
  { chave: "critica", nome: "Critica", ordem: 40 },
];

export const CATEGORIAS_PADRAO_VALUES = CATEGORIAS_PADRAO.map((item) => item.chave);
export const PRIORIDADES_PADRAO_VALUES = PRIORIDADES_PADRAO.map((item) => item.chave);

export const CATEGORIAS_LABELS_PADRAO = Object.freeze(
  Object.fromEntries(CATEGORIAS_PADRAO.map((item) => [item.chave, item.nome])),
);

export const PRIORIDADES_LABELS_PADRAO = Object.freeze(
  Object.fromEntries(PRIORIDADES_PADRAO.map((item) => [item.chave, item.nome])),
);

