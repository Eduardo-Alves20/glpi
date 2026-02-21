// src/compartilhado/validacao/campos.js

export function stripControlChars(s = "") {
  return String(s).replace(/[\u0000-\u001F\u007F]/g, "");
}

export function normalizeSpaces(s = "") {
  return String(s).trim().replace(/\s+/g, " ");
}

export function nomePessoa(value, { min = 3, max = 120 } = {}) {
  let n = normalizeSpaces(stripControlChars(value));

  if (n.length < min || n.length > max) {
    throw new Error(`Nome deve ter entre ${min} e ${max} caracteres.`);
  }

  // Letras Unicode + espaços + hífen + apóstrofo
  const ok = /^[\p{L}\p{M}]+(?:[ '\-][\p{L}\p{M}]+)*$/u.test(n);
  if (!ok) {
    throw new Error("Nome inválido. Use apenas letras, espaços, hífen e apóstrofo.");
  }

  return n;
}

export function email(value, { max = 254 } = {}) {
  const e = normalizeSpaces(stripControlChars(value)).toLowerCase();

  if (!e || e.length > max) throw new Error("E-mail inválido.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error("E-mail inválido.");

  return e;
}

// CPF: normaliza e valida dígitos
export function cpf(value) {
  const raw = String(value ?? "").replace(/\D/g, "");
  if (raw.length !== 11) throw new Error("CPF inválido.");

  // bloqueia CPFs repetidos
  if (/^(\d)\1{10}$/.test(raw)) throw new Error("CPF inválido.");

  const calc = (base, factor) => {
    let total = 0;
    for (let i = 0; i < base.length; i++) total += Number(base[i]) * (factor - i);
    const mod = (total * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  const d1 = calc(raw.slice(0, 9), 10);
  const d2 = calc(raw.slice(0, 10), 11);

  if (d1 !== Number(raw[9]) || d2 !== Number(raw[10])) throw new Error("CPF inválido.");
  return raw;
}

// Para título/descrição: não precisa bloquear tudo, mas normaliza e limita
export function texto(value, { min = 1, max = 5000 } = {}) {
  const t = stripControlChars(String(value ?? "")).trim();
  if (t.length < min) throw new Error("Texto muito curto.");
  if (t.length > max) throw new Error("Texto muito grande.");
  return t;
}

// Senha: não precisa “anti-script”, mas precisa tamanho e opcional complexidade
export function senha(value, { min = 8, max = 72 } = {}) {
  const s = String(value ?? "");
  if (s.length < min || s.length > max) {
    throw new Error(`Senha deve ter entre ${min} e ${max} caracteres.`);
  }
  return s;
}