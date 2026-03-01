import { ServerResponse } from "http";
import { WebSocketServer } from "ws";
import {
  listarNotificacoes,
  contarNaoLidas,
} from "../repos/notificacoesRepo.js";
import {
  resolverDestinatarioNotificacoes,
  obterTiposIgnoradosNotificacoes,
} from "../service/notificacoesDestinatarioService.js";
import {
  aoAtualizacaoNotificacoes,
  chaveDestinatarioNotificacao,
} from "../service/notificacoesRealtimeService.js";
import { obterResumoPresencaOnline } from "../repos/presencaOnlineRepo.js";
import { aoAtualizacaoPresencaOnline } from "../service/presencaRealtimeService.js";

const WS_PATH = "/ws/notificacoes";

function pathnameReq(req) {
  try {
    return new URL(req.url || "", "http://localhost").pathname;
  } catch {
    return "";
  }
}

function recusarUpgrade(socket, status = 401, texto = "Unauthorized") {
  try {
    socket.write(
      `HTTP/1.1 ${status} ${texto}\r\nConnection: close\r\n\r\n`,
    );
  } catch {
    // noop
  } finally {
    socket.destroy();
  }
}

function wsAberto(ws) {
  return ws && ws.readyState === 1;
}

function enviarJson(ws, payload) {
  if (!wsAberto(ws)) return false;
  try {
    ws.send(JSON.stringify(payload));
    return true;
  } catch (err) {
    console.error("[ws-notificacoes] falha ao enviar payload:", err);
    return false;
  }
}

function itemNotificacaoToClient(item = {}) {
  return {
    ...item,
    _id: String(item?._id || ""),
  };
}

async function montarSnapshot(destinatario, tiposIgnorados = []) {
  const [itens, unreadCount] = await Promise.all([
    listarNotificacoes({
      destinatario,
      limit: 20,
      tiposIgnorados,
    }),
    contarNaoLidas(destinatario, { tiposIgnorados }),
  ]);

  return {
    type: "snapshot",
    serverNow: new Date().toISOString(),
    unreadCount: Number(unreadCount || 0),
    itens: (itens || []).map(itemNotificacaoToClient),
  };
}

async function montarSnapshotPresenca() {
  const resumo = await obterResumoPresencaOnline();
  return {
    type: "presence_snapshot",
    ...resumo,
  };
}

export function anexarWebSocketNotificacoes({ server, sessionMiddleware } = {}) {
  if (!server || typeof sessionMiddleware !== "function") {
    throw new Error("Config invalida do WebSocket de notificacoes.");
  }

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    if (pathnameReq(request) !== WS_PATH) {
      recusarUpgrade(socket, 404, "Not Found");
      return;
    }

    const fakeRes = new ServerResponse(request);

    sessionMiddleware(request, fakeRes, () => {
      const usuarioSessao = request.session?.usuario;
      const destinatario = resolverDestinatarioNotificacoes(usuarioSessao);

      if (!destinatario) {
        recusarUpgrade(socket, 401, "Unauthorized");
        return;
      }

      request.__wsDestinatario = destinatario;
      request.__wsTiposIgnorados = obterTiposIgnoradosNotificacoes(usuarioSessao);
      request.__wsPerfil = String(usuarioSessao?.perfil || "").trim().toLowerCase();

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    });
  });

  wss.on("connection", (ws, request) => {
    const destinatario = request.__wsDestinatario;
    const tiposIgnorados = request.__wsTiposIgnorados || [];
    const chaveDestino = chaveDestinatarioNotificacao(destinatario);
    const escutaAdmins = String(destinatario?.tipo || "") === "admin" && String(destinatario?.id || "") === "*";
    const perfilSessao = String(request.__wsPerfil || "").trim().toLowerCase();
    const podeVerPresenca = perfilSessao === "tecnico" || perfilSessao === "admin";

    let encerrado = false;
    let enviando = false;
    let pendente = false;
    let enviandoPresenca = false;
    let pendentePresenca = false;

    const enviarSnapshot = async () => {
      if (encerrado || !wsAberto(ws)) return;
      if (enviando) {
        pendente = true;
        return;
      }

      enviando = true;
      try {
        const payload = await montarSnapshot(destinatario, tiposIgnorados);
        enviarJson(ws, payload);
      } catch (err) {
        console.error("[ws-notificacoes] falha ao montar snapshot:", err);
        enviarJson(ws, { type: "error", code: "snapshot_failed" });
      } finally {
        enviando = false;
        if (pendente) {
          pendente = false;
          setTimeout(() => {
            void enviarSnapshot();
          }, 120);
        }
      }
    };

    const enviarPresencaSnapshot = async () => {
      if (!podeVerPresenca || encerrado || !wsAberto(ws)) return;
      if (enviandoPresenca) {
        pendentePresenca = true;
        return;
      }

      enviandoPresenca = true;
      try {
        const payload = await montarSnapshotPresenca();
        enviarJson(ws, payload);
      } catch (err) {
        console.error("[ws-presenca] falha ao montar snapshot:", err);
      } finally {
        enviandoPresenca = false;
        if (pendentePresenca) {
          pendentePresenca = false;
          setTimeout(() => {
            void enviarPresencaSnapshot();
          }, 120);
        }
      }
    };

    const unsubscribe = aoAtualizacaoNotificacoes((chave) => {
      if (!chave) return;
      if (escutaAdmins) {
        if (!chave.startsWith("admin:")) return;
      } else if (chave !== chaveDestino) {
        return;
      }
      void enviarSnapshot();
    });
    const unsubscribePresenca = podeVerPresenca
      ? aoAtualizacaoPresencaOnline(() => {
        void enviarPresencaSnapshot();
      })
      : () => {};

    const heartbeat = setInterval(() => {
      if (!wsAberto(ws)) return;
      try {
        ws.ping();
      } catch {
        // noop
      }
    }, 30000);

    ws.on("message", (raw) => {
      let data = null;
      try {
        data = JSON.parse(String(raw || ""));
      } catch {
        data = null;
      }

      if (data?.type === "sync") {
        void enviarSnapshot();
        return;
      }

      if (data?.type === "presence_sync") {
        void enviarPresencaSnapshot();
      }
    });

    ws.on("close", () => {
      encerrado = true;
      clearInterval(heartbeat);
      unsubscribe();
      unsubscribePresenca();
    });

    ws.on("error", () => {
      // conexao individual falhou
    });

    void enviarSnapshot();
    if (podeVerPresenca) {
      void enviarPresencaSnapshot();
    }
  });

  return wss;
}
