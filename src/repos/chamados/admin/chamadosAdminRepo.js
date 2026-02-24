import { pegarDb } from "../../../compartilhado/db/mongo.js";
import { COL_CHAMADOS } from "../core/chamadosCoreRepo.js";

export async function fecharChamadosVencidosAguardandoUsuario({ dias = 30 } = {}) {
  const db = pegarDb();
  const d = Math.max(1, Math.min(Number(dias) || 30, 365));
  const now = new Date();
  const limite = new Date(now);
  limite.setDate(limite.getDate() - d);

  const r = await db.collection(COL_CHAMADOS).updateMany(
    {
      status: "aguardando_usuario",
      aguardandoUsuarioDesde: { $lte: limite },
    },
    {
      $set: {
        status: "fechado",
        fechadoEm: now,
        fechadoAutomatico: true,
        fechadoMotivo: `Auto-fechamento após ${d} dias sem resposta do usuário`,
        updatedAt: now,
      },
      $push: {
        historico: {
          tipo: "status",
          em: now,
          por: "sistema",
          mensagem: `Fechamento automático após ${d} dias sem resposta do usuário`,
        },
      },
    },
  );

  return { fechados: r.modifiedCount || 0 };
}

