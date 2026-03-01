import { EventEmitter } from "events";

const EVT_PRESENCA_ATUALIZADA = "presenca.atualizada";
const bus = new EventEmitter();
bus.setMaxListeners(0);

export function publicarAtualizacaoPresencaOnline() {
  bus.emit(EVT_PRESENCA_ATUALIZADA, Date.now());
  return true;
}

export function aoAtualizacaoPresencaOnline(listener) {
  if (typeof listener !== "function") return () => {};

  const handler = (ts) => {
    try {
      listener(ts);
    } catch (err) {
      console.error("[presenca-realtime] listener falhou:", err);
    }
  };

  bus.on(EVT_PRESENCA_ATUALIZADA, handler);
  return () => bus.off(EVT_PRESENCA_ATUALIZADA, handler);
}
