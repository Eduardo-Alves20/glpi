import { EventEmitter } from "events";

const EVT_NOTIFICACOES_ATUALIZADAS = "notificacoes.atualizadas";
const bus = new EventEmitter();
bus.setMaxListeners(0);

export function chaveDestinatarioNotificacao(destinatario = {}) {
  const tipo = String(destinatario?.tipo || "").trim().toLowerCase();
  const id = String(destinatario?.id || "").trim();
  if (!tipo || !id) return "";
  return `${tipo}:${id}`;
}

export function publicarAtualizacaoNotificacoes(destinatario = {}) {
  const chave = chaveDestinatarioNotificacao(destinatario);
  if (!chave) return false;
  bus.emit(EVT_NOTIFICACOES_ATUALIZADAS, chave);
  return true;
}

export function aoAtualizacaoNotificacoes(listener) {
  if (typeof listener !== "function") return () => {};

  const handler = (chave) => {
    try {
      listener(chave);
    } catch (err) {
      console.error("[notificacoes-realtime] listener falhou:", err);
    }
  };

  bus.on(EVT_NOTIFICACOES_ATUALIZADAS, handler);
  return () => bus.off(EVT_NOTIFICACOES_ATUALIZADAS, handler);
}
