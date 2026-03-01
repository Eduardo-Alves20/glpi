const PREFIXO_PADRAO = "cf__";

function texto(value, { max = 255 } = {}) {
  return String(value ?? "").trim().slice(0, max);
}

function valorCheckbox(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  return ["1", "true", "on", "yes", "sim"].includes(v);
}

function validarDataIso(raw) {
  const s = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;

  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

function lerRawCampo(body = {}, nomeInput = "") {
  const value = body?.[nomeInput];
  if (Array.isArray(value)) return String(value[0] || "");
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return String(value || "");
}

function nomeInputCampo(campo = {}, prefixo = PREFIXO_PADRAO) {
  return `${prefixo}${String(campo.chave || "").trim()}`;
}

function valorFormularioCampo(campo = {}, raw = "") {
  if (campo.tipo === "checkbox") return valorCheckbox(raw);
  return String(raw || "");
}

export function extrairCamposCustomizadosDeBody(
  body = {},
  definicoes = [],
  { prefixo = PREFIXO_PADRAO } = {},
) {
  const erros = [];
  const valores = {};
  const valoresFormulario = {};
  const lista = Array.isArray(definicoes) ? definicoes : [];

  lista.forEach((campo) => {
    const chave = String(campo?.chave || "").trim();
    if (!chave) return;

    const nomeInput = nomeInputCampo(campo, prefixo);
    const raw = lerRawCampo(body, nomeInput);
    const tipo = String(campo?.tipo || "text").toLowerCase();
    const obrigatorio = Boolean(campo?.obrigatorio);
    const opcoes = Array.isArray(campo?.opcoes) ? campo.opcoes : [];

    valoresFormulario[chave] = valorFormularioCampo(campo, raw);

    if (tipo === "checkbox") {
      const checked = valorCheckbox(raw);
      if (obrigatorio && !checked) {
        erros.push(`Campo obrigatorio nao marcado: ${campo.rotulo}.`);
        return;
      }
      if (checked || obrigatorio || Object.prototype.hasOwnProperty.call(body, nomeInput)) {
        valores[chave] = checked;
      }
      return;
    }

    const textoRaw = String(raw || "").trim();
    if (!textoRaw) {
      if (obrigatorio) erros.push(`Campo obrigatorio: ${campo.rotulo}.`);
      return;
    }

    if (tipo === "text") {
      valores[chave] = texto(textoRaw, { max: 255 });
      return;
    }

    if (tipo === "textarea") {
      valores[chave] = texto(textoRaw, { max: 2000 });
      return;
    }

    if (tipo === "number") {
      const n = Number(textoRaw.replace(",", "."));
      if (!Number.isFinite(n)) {
        erros.push(`Campo numerico invalido: ${campo.rotulo}.`);
        return;
      }
      valores[chave] = n;
      return;
    }

    if (tipo === "date") {
      if (!validarDataIso(textoRaw)) {
        erros.push(`Campo de data invalido: ${campo.rotulo}.`);
        return;
      }
      valores[chave] = textoRaw;
      return;
    }

    if (tipo === "select") {
      const permitidos = new Set(
        opcoes
          .map((item) => String(item?.valor || "").trim())
          .filter(Boolean),
      );
      if (!permitidos.has(textoRaw)) {
        erros.push(`Opcao invalida para ${campo.rotulo}.`);
        return;
      }
      valores[chave] = textoRaw;
      return;
    }

    erros.push(`Tipo de campo nao suportado: ${campo.rotulo}.`);
  });

  return {
    ok: erros.length === 0,
    erros,
    valores,
    valoresFormulario,
  };
}

export function normalizarCustomFieldsParaPersistencia(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};

  const out = {};
  Object.entries(payload)
    .slice(0, 120)
    .forEach(([k, v]) => {
      const chave = String(k || "").trim().toLowerCase();
      if (!/^[a-z][a-z0-9_]{1,39}$/.test(chave)) return;

      if (typeof v === "string") {
        const txt = String(v).trim().slice(0, 2000);
        if (txt) out[chave] = txt;
        return;
      }

      if (typeof v === "number" && Number.isFinite(v)) {
        out[chave] = v;
        return;
      }

      if (typeof v === "boolean") {
        out[chave] = v;
      }
    });

  return out;
}
