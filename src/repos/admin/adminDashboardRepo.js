import {
  contarChamados,
  listarChamados,
  obterUltimaAtualizacaoChamados,
} from "../chamados/core/chamadosCoreRepo.js";
import {
  contarPorPerfil,
  contarUsuariosBloqueados,
  listarRecentes,
  obterUltimoUsuarioCriadoEm,
  totalUsuarios,
} from "../usuariosRepo.js";
import { listarLogsRecentes, obterUltimoLogEm } from "../logsRepo.js";

function inicioDeHoje() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtQuando(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("pt-BR");
}

function maxDate(...dates) {
  const valid = dates
    .map((d) => (d ? new Date(d) : null))
    .filter((d) => d && !Number.isNaN(d.getTime()));
  if (!valid.length) return null;
  return new Date(Math.max(...valid.map((d) => d.getTime())));
}

export async function obterAdminDashboardData() {
  const hoje = inicioDeHoje();

  const [
    chamadosAbertos,
    chamadosCriticos,
    aguardandoTecnico,
    criadosHoje,
    emAndamento,
    aguardandoUsuario,
    totalUsuariosCount,
    totalTecnicos,
    totalAdmins,
    usuariosBloqueados,
    ultimosChamadosRaw,
    ultimosUsuariosRaw,
    logsRaw,
    ultimoChamadoEm,
    ultimoUsuarioEm,
    ultimoLogEm,
  ] = await Promise.all([
    contarChamados({ status: "aberto" }),
    contarChamados({
      prioridade: ["alta", "critica"],
      status: ["aberto", "em_atendimento", "aguardando_usuario"],
    }),
    contarChamados({ status: "aberto", somenteSemResponsavel: true }),
    contarChamados({ createdFrom: hoje }),
    contarChamados({ status: "em_atendimento" }),
    contarChamados({ status: "aguardando_usuario" }),
    totalUsuarios(),
    contarPorPerfil("tecnico"),
    contarPorPerfil("admin"),
    contarUsuariosBloqueados(),
    listarChamados({
      status: ["aberto", "em_atendimento", "aguardando_usuario"],
      limit: 10,
    }),
    listarRecentes(10),
    listarLogsRecentes(10),
    obterUltimaAtualizacaoChamados(),
    obterUltimoUsuarioCriadoEm(),
    obterUltimoLogEm(),
  ]);

  const kpis = {
    chamadosAbertos,
    chamadosCriticos,
    aguardandoTecnico,
    criadosHoje,
    emAndamento,
    aguardandoUsuario,
    vencendoSla: 0,
    totalUsuarios: totalUsuariosCount,
    totalTecnicos,
    totalAdmins,
    usuariosBloqueados,
  };

  const ultimosChamados = (ultimosChamadosRaw || []).slice(0, 5).map((c) => ({
    id: String(c._id),
    numero: c.numero ?? "-",
    titulo: c.titulo ?? "(sem título)",
    status: c.status ?? "-",
    solicitante: c?.criadoPor?.nome || c?.criadoPor?.login || "-",
    quando: fmtQuando(c.updatedAt || c.createdAt),
  }));

  const ultimosUsuarios = (ultimosUsuariosRaw || []).slice(0, 5).map((u) => ({
    id: String(u._id),
    nome: u.nome || "-",
    perfil: u.perfil || "-",
    quando: fmtQuando(u.criadoEm || u.updatedAt),
  }));

  const logs = (logsRaw || []).slice(0, 5).map((l) => ({
    titulo: l.mensagem || l.evento || "Evento do sistema",
    tipo: String(l.nivel || "info").toUpperCase(),
    quando: fmtQuando(l.criadoEm),
    evento: l.evento || "",
    resultado: l.resultado || "",
    usuario: l?.usuario?.login || l?.usuario?.nome || "",
  }));

  const lastChangeAt =
    maxDate(ultimoChamadoEm, ultimoUsuarioEm, ultimoLogEm) || new Date();

  return {
    kpis,
    logs,
    ultimosChamados,
    ultimosUsuarios,
    lastChangeAt,
    serverTime: new Date(),
  };
}

