import { criarNotificacao } from "../repos/notificacoesRepo.js";

function normalizarTexto(v, max = 200) {
  return String(v || "").trim().slice(0, max);
}

function tipoDestinatario(perfil = "") {
  const p = String(perfil || "").trim().toLowerCase();
  if (p === "admin") return "admin";
  if (p === "tecnico") return "tecnico";
  return "";
}

function extrairInscritos(chamado = {}) {
  const lista = Array.isArray(chamado?.inscritosNotificacao)
    ? chamado.inscritosNotificacao
    : [];

  const unicos = new Map();
  for (const item of lista) {
    const id = normalizarTexto(item?.id, 80);
    if (!id) continue;

    const perfil = normalizarTexto(item?.perfil, 20).toLowerCase();
    if (!["admin", "tecnico"].includes(perfil)) continue;

    const tipo = tipoDestinatario(perfil);
    const chave = `${tipo}:${id}`;
    if (!unicos.has(chave)) {
      unicos.set(chave, { tipo, id, perfil });
    }
  }

  return [...unicos.values()];
}

export async function notificarSeguidoresChamado({
  chamado,
  tipo = "mudou_status",
  titulo = "",
  mensagem = "",
  url = "",
  autor = null,
  ignorar = [],
} = {}) {
  const inscritos = extrairInscritos(chamado);
  if (!inscritos.length) return { enviados: 0 };

  const ignorarSet = new Set(
    (Array.isArray(ignorar) ? ignorar : [])
      .map((x) => String(x || "").trim())
      .filter(Boolean),
  );

  const payloads = inscritos
    .filter((d) => !ignorarSet.has(`${d.tipo}:${d.id}`))
    .map((d) => ({
      destinatario: { tipo: d.tipo, id: d.id },
      chamadoId: String(chamado?._id || ""),
      tipo,
      titulo: normalizarTexto(
        titulo || `Chamado #${String(chamado?.numero || "")}: ${String(chamado?.titulo || "")}`,
        140,
      ),
      mensagem: normalizarTexto(mensagem, 1000),
      url: normalizarTexto(url || `/tecnico/chamados/${String(chamado?._id || "")}`, 300),
      meta: autor ? { autor } : {},
    }));

  if (!payloads.length) return { enviados: 0 };
  await Promise.all(payloads.map((p) => criarNotificacao(p)));
  return { enviados: payloads.length };
}

export function chaveDestinoNotificacao({ perfil = "", id = "" } = {}) {
  const tipo = tipoDestinatario(perfil);
  const did = normalizarTexto(id, 80);
  return did && tipo ? `${tipo}:${did}` : "";
}
