import { ObjectId } from "mongodb";
import { pegarDb } from "../compartilhado/db/mongo.js";
import { listarUsuariosPorPerfis } from "../repos/usuariosRepo.js";
import { atribuirResponsavelTriagemAutomatica } from "../repos/chamados/core/chamadosCoreRepo.js";

const STATUS_ATIVOS = ["aberto", "em_atendimento", "aguardando_usuario"];

function oidToString(v) {
  if (!v) return "";
  try {
    if (typeof v?.toHexString === "function") return String(v.toHexString());
  } catch {}
  return String(v || "").trim();
}

function prioridadeAlta(valor = "") {
  const p = String(valor || "").trim().toLowerCase();
  return p === "alta" || p === "critica";
}

export async function tentarTriagemAutomaticaChamado({
  chamado = null,
  porLogin = "triagem.auto",
} = {}) {
  const chamadoId = oidToString(chamado?._id);
  if (!chamadoId || !ObjectId.isValid(chamadoId)) {
    return { atribuido: false, motivo: "chamado_invalido", chamado };
  }

  const candidatos = await listarUsuariosPorPerfis(["tecnico", "admin"]);
  if (!Array.isArray(candidatos) || !candidatos.length) {
    return { atribuido: false, motivo: "sem_candidatos", chamado };
  }

  const candidatosValidos = candidatos
    .map((u) => ({
      id: oidToString(u?._id),
      nome: String(u?.nome || "").trim(),
      usuario: String(u?.usuario || "").trim(),
      perfil: String(u?.perfil || "").trim().toLowerCase(),
    }))
    .filter((u) => ObjectId.isValid(u.id));

  if (!candidatosValidos.length) {
    return { atribuido: false, motivo: "sem_candidatos_validos", chamado };
  }

  const db = pegarDb();
  const idsObj = candidatosValidos.map((u) => new ObjectId(u.id));

  const [cargaAtivaAgg, experienciaCategoriaAgg] = await Promise.all([
    db.collection("chamados").aggregate([
      {
        $match: {
          responsavelId: { $in: idsObj },
          status: { $in: STATUS_ATIVOS },
        },
      },
      {
        $group: {
          _id: "$responsavelId",
          ativos: { $sum: 1 },
          criticosAtivos: {
            $sum: {
              $cond: [{ $eq: ["$prioridade", "critica"] }, 1, 0],
            },
          },
        },
      },
    ]).toArray(),
    db.collection("chamados").aggregate([
      {
        $match: {
          responsavelId: { $in: idsObj },
          categoria: String(chamado?.categoria || "").trim(),
        },
      },
      {
        $group: {
          _id: "$responsavelId",
          totalCategoria: { $sum: 1 },
        },
      },
    ]).toArray(),
  ]);

  const cargaMap = new Map(
    (cargaAtivaAgg || []).map((x) => [oidToString(x?._id), {
      ativos: Number(x?.ativos || 0),
      criticosAtivos: Number(x?.criticosAtivos || 0),
    }]),
  );

  const categoriaMap = new Map(
    (experienciaCategoriaAgg || []).map((x) => [oidToString(x?._id), Number(x?.totalCategoria || 0)]),
  );

  const ticketPrioridadeAlta = prioridadeAlta(chamado?.prioridade);

  const ranking = candidatosValidos
    .map((cand) => {
      const carga = cargaMap.get(cand.id) || { ativos: 0, criticosAtivos: 0 };
      const experienciaCategoria = Number(categoriaMap.get(cand.id) || 0);
      const penalidadeAdmin = cand.perfil === "admin" && !ticketPrioridadeAlta ? 20 : 0;

      const score = (
        (carga.ativos * 100)
        + (carga.criticosAtivos * 25)
        + penalidadeAdmin
        - (experienciaCategoria * 5)
      );

      return {
        ...cand,
        score,
        cargaAtiva: carga.ativos,
        criticosAtivos: carga.criticosAtivos,
        experienciaCategoria,
      };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      if (a.cargaAtiva !== b.cargaAtiva) return a.cargaAtiva - b.cargaAtiva;
      if (a.criticosAtivos !== b.criticosAtivos) return a.criticosAtivos - b.criticosAtivos;
      return a.usuario.localeCompare(b.usuario);
    });

  const escolhido = ranking[0] || null;
  if (!escolhido) {
    return { atribuido: false, motivo: "sem_escolha", chamado };
  }

  const chamadoAtualizado = await atribuirResponsavelTriagemAutomatica(
    chamadoId,
    {
      responsavelId: escolhido.id,
      responsavelNome: escolhido.nome,
      responsavelLogin: escolhido.usuario,
      responsavelPerfil: escolhido.perfil,
    },
    { porLogin },
  );

  if (!chamadoAtualizado?._id) {
    return { atribuido: false, motivo: "nao_atribuido", chamado };
  }

  return {
    atribuido: true,
    chamado: chamadoAtualizado,
    responsavel: {
      id: escolhido.id,
      nome: escolhido.nome,
      usuario: escolhido.usuario,
      perfil: escolhido.perfil,
    },
    score: escolhido.score,
    cargaAtiva: escolhido.cargaAtiva,
    experienciaCategoria: escolhido.experienciaCategoria,
  };
}

