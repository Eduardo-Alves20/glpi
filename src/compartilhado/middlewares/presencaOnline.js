import { tocarPresencaOnline } from "../../repos/presencaOnlineRepo.js";

const ultimoToquePorUsuario = new Map();

function intEnv(name, fallback, { min = 1000, max = 120000 } = {}) {
  const raw = Number.parseInt(String(process.env[name] || "").trim(), 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(raw, max));
}

const INTERVALO_TOQUE_MS = intEnv("ONLINE_TOUCH_INTERVAL_MS", 15000);

function perfilValido(perfil = "") {
  const p = String(perfil || "").trim().toLowerCase();
  return p === "usuario" || p === "tecnico" || p === "admin";
}

function chaveUsuario(sessUsuario = {}) {
  const id = String(sessUsuario?.id || "").trim();
  const perfil = String(sessUsuario?.perfil || "").trim().toLowerCase();
  if (!id || !perfil) return "";
  return `${perfil}:${id}`;
}

export function anexarPresencaOnline(req, res, next) {
  const sessUsuario = req.session?.usuario;
  if (!sessUsuario?.id || !perfilValido(sessUsuario?.perfil)) return next();

  const chave = chaveUsuario(sessUsuario);
  if (!chave) return next();

  const agora = Date.now();
  const ultimo = Number(ultimoToquePorUsuario.get(chave) || 0);
  if (ultimo > 0 && (agora - ultimo) < INTERVALO_TOQUE_MS) return next();
  ultimoToquePorUsuario.set(chave, agora);

  tocarPresencaOnline({
    usuarioId: String(sessUsuario.id || ""),
    perfil: String(sessUsuario.perfil || ""),
    nome: String(sessUsuario.nome || ""),
    login: String(sessUsuario.usuario || ""),
  }).catch((err) => {
    console.error("[presenca-online] falha ao atualizar presenca:", err);
  });

  return next();
}
