export {
  criarChamado,
  acharChamadoPorId,
  listarChamados,
  listarMeusAtendimentos,
  listarFilaChamados,
  contarChamados,
  obterUltimaAtualizacaoChamados,
  garantirIndicesChamados,
} from "./core/chamadosCoreRepo.js";

export {
  acharChamadoPorIdDoUsuario,
  editarChamadoDoUsuario,
  usuarioConfirmarSolucao,
  usuarioReabrirChamado,
  usuarioAdicionarInteracao,
} from "./usuario/chamadosUsuarioRepo.js";

export {
  responderSolucaoTecnico,
  assumirChamado,
  adicionarInteracaoTecnico,
} from "./tecnico/chamadosTecnicoRepo.js";

export { fecharChamadosVencidosAguardandoUsuario } from "./admin/chamadosAdminRepo.js";

