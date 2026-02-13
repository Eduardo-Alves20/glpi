export function injetarLocalsLayout(req, res, next) {
  const usuarioSessao = req.session?.usuario || null;
  const perfil = usuarioSessao?.perfil || "anon";

  const nomeCurto = (usuarioSessao?.nome || usuarioSessao?.usuario || "Servidor(a)")
    .split(" ")[0];

  const pathAtual = req.path || "";
  const isAtivo = (prefixo) => pathAtual === prefixo || pathAtual.startsWith(prefixo + "/");

  res.locals.usuarioSessao = usuarioSessao;
  res.locals.perfil = perfil;
  res.locals.nomeCurto = nomeCurto;
  res.locals.pathAtual = pathAtual;
  res.locals.isAtivo = isAtivo;

  // ambiente opcional (LOCAL/HOMOLOG/PROD)
  res.locals.ambiente = process.env.AMBIENTE || "";

  next();
}
