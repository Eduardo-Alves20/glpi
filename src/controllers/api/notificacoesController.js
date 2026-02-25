import {
  listarNotificacoes,
  contarNaoLidas,
  marcarComoLida,
  marcarTodasComoLidas,
} from "../../repos/notificacoesRepo.js";
import {
  resolverDestinatarioNotificacoes,
  obterTiposIgnoradosNotificacoes,
} from "../../service/notificacoesDestinatarioService.js";

function mapearNotificacaoApi(item = {}) {
  return {
    ...item,
    _id: String(item?._id || ""),
  };
}

export async function listar(req, res) {
  const destinatario = resolverDestinatarioNotificacoes(req.session?.usuario);
  if (!destinatario) return res.status(401).json({ error: "unauthorized" });

  const { since, unread, limit } = req.query;
  const tiposIgnorados = obterTiposIgnoradosNotificacoes(req.session?.usuario);

  const itens = await listarNotificacoes({
    destinatario,
    since: since || null,
    unread: unread === "1" || unread === "true",
    limit: Number(limit || 20),
    tiposIgnorados,
  });

  res.json({
    serverNow: new Date().toISOString(),
    itens: (itens || []).map(mapearNotificacaoApi),
  });
}

export async function unreadCount(req, res) {
  const destinatario = resolverDestinatarioNotificacoes(req.session?.usuario);
  if (!destinatario) return res.status(401).json({ error: "unauthorized" });
  const tiposIgnorados = obterTiposIgnoradosNotificacoes(req.session?.usuario);

  const count = await contarNaoLidas(destinatario, { tiposIgnorados });
  res.json({ count });
}

export async function marcarLida(req, res) {
  const destinatario = resolverDestinatarioNotificacoes(req.session?.usuario);
  if (!destinatario) return res.status(401).json({ error: "unauthorized" });

  const out = await marcarComoLida({ notifId: req.params.id, destinatario });
  res.json(out);
}

export async function marcarTodas(req, res) {
  const destinatario = resolverDestinatarioNotificacoes(req.session?.usuario);
  if (!destinatario) return res.status(401).json({ error: "unauthorized" });

  const out = await marcarTodasComoLidas(destinatario);
  res.json(out);
}

