import { obterAdminDashboardData } from "../../repos/admin/adminDashboardRepo.js";

export async function adminHomeGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;

  const { kpis, logs, ultimosChamados, ultimosUsuarios, serverTime } =
    await obterAdminDashboardData();

  return res.render("admin/home", {
    layout: "layout-app",
    titulo: "GLPI - Admin",
    cssPortal: "/styles/admin.css",
    cssExtra: "/styles/admin-home.css",
    usuarioSessao,
    kpis,
    logs,
    ultimosChamados,
    ultimosUsuarios,
    serverTime: new Date(serverTime).toISOString(),
  });
}

