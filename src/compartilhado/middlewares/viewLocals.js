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

  // flash global para qualquer render (success/error/info)
  res.locals.flash = req.session?.flash || null;

  // consome flash apenas quando a resposta realmente renderiza HTML;
  // em redirects ele permanece para o próximo request.
  const renderOriginal = res.render.bind(res);
  res.render = function renderComFlash(...args) {
    if (req.session) req.session.flash = null;
    return renderOriginal(...args);
  };

  next();
}
