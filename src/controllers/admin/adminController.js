import {
  contarPorPerfil,
  totalUsuarios,
  listarRecentes,
} from "../../repos/usuariosRepo.js";

export async function adminHomeGet(req, res) {
  const total = await totalUsuarios();
  const totalAdmins = await contarPorPerfil("admin");
  const totalTecnicos = await contarPorPerfil("tecnico");

  const kpis = {
    chamadosAbertos: 0,
    chamadosCriticos: 0,
    aguardandoTecnico: 0,
    criadosHoje: 0,
    emAndamento: 0,
    aguardandoUsuario: 0,
    vencendoSla: 0,
    totalUsuarios: total,
    totalTecnicos,
    totalAdmins,
    usuariosBloqueados: 0,
  };

  const logs = [
    {
      titulo: "Painel carregado",
      tipo: "info",
      quando: new Date().toLocaleString("pt-BR"),
    },
  ];
  const ultimosChamados = [];

  const ultimosUsuarios = (await listarRecentes(5)).map((u) => ({
    nome: u.nome,
    perfil: u.perfil,
    quando: new Date(u.criadoEm || Date.now()).toLocaleString("pt-BR"),
  }));

return res.render("admin/home", {
  layout: "layout-app",
  titulo: "GLPI - Admin",
  cssPortal: "/styles/admin.css",
  cssExtra: "/styles/admin-home.css", // se quiser separar home
  kpis, logs, ultimosChamados, ultimosUsuarios,
});


}
