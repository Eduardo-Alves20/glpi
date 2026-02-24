import {
  listarNotificacoes,
  contarNaoLidas,
  marcarComoLida,
  marcarTodasComoLidas,
} from "../../repos/notificacoesRepo.js";

function getDestinatario(req) {
  // Ajuste conforme seu session shape:
  // Ex.: req.session.usuario = { id, perfil, tecnicoId, ... }
  const u = req.session?.usuario;
  if (!u) return null;

  if (u.perfil === "tecnico") return { tipo: "tecnico", id: String(u.tecnicoId || u.id) };
  if (u.perfil === "admin") return { tipo: "admin", id: String(u.id) };
  return { tipo: "usuario", id: String(u.id) };
}

export async function listar(req, res) {
  const destinatario = getDestinatario(req);
  if (!destinatario) return res.status(401).json({ error: "unauthorized" });

  const { since, unread, limit } = req.query;

  const itens = await listarNotificacoes({
    destinatario,
    since: since || null,
    unread: unread === "1" || unread === "true",
    limit: Number(limit || 20),
  });

  res.json({
    serverNow: new Date().toISOString(),
    itens,
  });
}

export async function unreadCount(req, res) {
  const destinatario = getDestinatario(req);
  if (!destinatario) return res.status(401).json({ error: "unauthorized" });

  const count = await contarNaoLidas(destinatario);
  res.json({ count });
}

export async function marcarLida(req, res) {
  const destinatario = getDestinatario(req);
  if (!destinatario) return res.status(401).json({ error: "unauthorized" });

  const out = await marcarComoLida({ notifId: req.params.id, destinatario });
  res.json(out);
}

export async function marcarTodas(req, res) {
  const destinatario = getDestinatario(req);
  if (!destinatario) return res.status(401).json({ error: "unauthorized" });

  const out = await marcarTodasComoLidas(destinatario);
  res.json(out);
}