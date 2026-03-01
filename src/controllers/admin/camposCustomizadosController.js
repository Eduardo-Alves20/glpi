import {
  ENTIDADES_CAMPOS_CUSTOMIZADOS,
  TIPOS_CAMPOS_CUSTOMIZADOS,
  atualizarStatusCampoCustomizado,
  criarCampoCustomizado,
  excluirCampoCustomizado,
  listarTodosCamposCustomizados,
} from "../../repos/camposCustomizadosRepo.js";
import { registrarEventoSistema } from "../../service/logsService.js";

function viewBase(req, extra = {}) {
  return {
    layout: "layout-app",
    titulo: "GLPI - Campos customizados",
    cssPortal: "/styles/usuario.css",
    req,
    ...extra,
  };
}

function valorFormCampo(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizarEntradaFormulario(body = {}) {
  return {
    entidade: valorFormCampo(body.entidade),
    chave: valorFormCampo(body.chave).toLowerCase(),
    rotulo: valorFormCampo(body.rotulo),
    tipo: valorFormCampo(body.tipo, "text").toLowerCase(),
    obrigatorio:
      String(body.obrigatorio ?? "").trim().toLowerCase() === "on"
      || String(body.obrigatorio ?? "").trim().toLowerCase() === "1",
    ativo: String(body.ativo ?? "").trim().toLowerCase() !== "0",
    ordem: valorFormCampo(body.ordem, "100"),
    placeholder: valorFormCampo(body.placeholder),
    ajuda: valorFormCampo(body.ajuda),
    opcoes: String(body.opcoes ?? ""),
  };
}

async function carregarCamposAgrupados() {
  const campos = await listarTodosCamposCustomizados();
  return {
    usuario: campos.filter((item) => item.entidade === "usuario"),
    chamado: campos.filter((item) => item.entidade === "chamado"),
  };
}

export async function camposCustomizadosIndexGet(req, res) {
  const flash = req.session?.flash || null;
  if (req.session) req.session.flash = null;

  const grupos = await carregarCamposAgrupados();

  return res.render(
    "admin/campos-customizados/index",
    viewBase(req, {
      flash,
      erros: [],
      valores: {
        entidade: "usuario",
        chave: "",
        rotulo: "",
        tipo: "text",
        obrigatorio: false,
        ativo: true,
        ordem: "100",
        placeholder: "",
        ajuda: "",
        opcoes: "",
      },
      opcoes: {
        entidades: ENTIDADES_CAMPOS_CUSTOMIZADOS,
        tipos: TIPOS_CAMPOS_CUSTOMIZADOS,
      },
      camposPorEntidade: grupos,
    }),
  );
}

export async function camposCustomizadosCreatePost(req, res) {
  const valores = normalizarEntradaFormulario(req.body);
  const erros = [];

  try {
    await criarCampoCustomizado(
      {
        ...valores,
        ordem: Number(valores.ordem || 100),
      },
      req.session?.usuario || null,
    );

    await registrarEventoSistema({
      req,
      nivel: "security",
      modulo: "admin",
      evento: "admin.campos_customizados.criado",
      acao: "criar_campo_customizado",
      resultado: "sucesso",
      mensagem: `Campo customizado ${valores.chave} criado para ${valores.entidade}.`,
      meta: {
        entidade: valores.entidade,
        chave: valores.chave,
        tipo: valores.tipo,
      },
    });

    if (req.session) {
      req.session.flash = {
        tipo: "success",
        mensagem: "Campo customizado criado com sucesso.",
      };
    }
    return res.redirect("/admin/campos-customizados");
  } catch (err) {
    erros.push(err?.message || "Nao foi possivel criar o campo customizado.");
  }

  const grupos = await carregarCamposAgrupados();
  return res.status(400).render(
    "admin/campos-customizados/index",
    viewBase(req, {
      erros,
      valores,
      flash: null,
      opcoes: {
        entidades: ENTIDADES_CAMPOS_CUSTOMIZADOS,
        tipos: TIPOS_CAMPOS_CUSTOMIZADOS,
      },
      camposPorEntidade: grupos,
    }),
  );
}

export async function camposCustomizadosStatusPost(req, res) {
  const campoId = String(req.params.id || "").trim();
  const ativo = String(req.body?.ativo || "").trim() === "1";

  try {
    const atualizado = await atualizarStatusCampoCustomizado(campoId, ativo);

    await registrarEventoSistema({
      req,
      nivel: "security",
      modulo: "admin",
      evento: "admin.campos_customizados.status",
      acao: "atualizar_status_campo_customizado",
      resultado: "sucesso",
      mensagem: `Campo ${atualizado.chave} (${atualizado.entidade}) atualizado para ${ativo ? "ativo" : "inativo"}.`,
      meta: {
        entidade: atualizado.entidade,
        chave: atualizado.chave,
        ativo,
      },
    });

    if (req.session) {
      req.session.flash = {
        tipo: "success",
        mensagem: "Status do campo customizado atualizado.",
      };
    }
  } catch (err) {
    if (req.session) {
      req.session.flash = {
        tipo: "error",
        mensagem: err?.message || "Nao foi possivel atualizar o status do campo.",
      };
    }
  }

  return res.redirect("/admin/campos-customizados");
}

export async function camposCustomizadosExcluirPost(req, res) {
  const campoId = String(req.params.id || "").trim();

  try {
    const removido = await excluirCampoCustomizado(campoId);

    await registrarEventoSistema({
      req,
      nivel: "security",
      modulo: "admin",
      evento: "admin.campos_customizados.excluido",
      acao: "excluir_campo_customizado",
      resultado: "sucesso",
      mensagem: `Campo ${removido.chave} (${removido.entidade}) excluido.`,
      meta: {
        entidade: removido.entidade,
        chave: removido.chave,
        tipo: removido.tipo,
      },
    });

    if (req.session) {
      req.session.flash = {
        tipo: "success",
        mensagem: "Campo customizado excluido com sucesso.",
      };
    }
  } catch (err) {
    if (req.session) {
      req.session.flash = {
        tipo: "error",
        mensagem: err?.message || "Nao foi possivel excluir o campo.",
      };
    }
  }

  return res.redirect("/admin/campos-customizados");
}
