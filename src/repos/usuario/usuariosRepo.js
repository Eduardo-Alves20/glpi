import { ObjectId } from "mongodb";
import { pegarDb } from "../../compartilhado/db/mongo.js";
import { compararSenha, gerarHashSenha } from "../../compartilhado/seguranca/senha.js";
import { nomePessoa, email as emailVal, senha as senhaVal } from "../../compartilhado/validacao/campos.js";



const COL_USUARIOS = "usuarios";

function normEmail(v) {
  return String(v ?? "").trim().toLowerCase();
}
function normNome(v) {
  return String(v ?? "").trim();
}
function assertEmail(email) {
  const e = normEmail(email);
  if (!e || e.length > 254) throw new Error("E-mail inválido.");
  // regex simples e segura; validação forte fica pro frontend também
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error("E-mail inválido.");
  return e;
}
function assertNome(nome) {
  const n = normNome(nome);
  if (n.length < 3 || n.length > 120) throw new Error("Nome deve ter entre 3 e 120 caracteres.");
  return n;
}
function assertSenhaNova(s) {
  const p = String(s ?? "");
  if (p.length < 8 || p.length > 72) throw new Error("Senha deve ter entre 8 e 72 caracteres.");
  // opcional: exigir complexidade
  // if (!/[A-Z]/.test(p) || !/[0-9]/.test(p)) throw new Error("Senha fraca.");
  return p;
}

export async function acharUsuarioPorId(usuarioId) {
  const db = pegarDb();
  if (!ObjectId.isValid(String(usuarioId))) return null;
  return db.collection(COL_USUARIOS).findOne({ _id: new ObjectId(String(usuarioId)) });
}

/**
 * Atualiza dados do perfil do usuário logado.
 * Segurança:
 * - allowlist (nome/email/senha)
 * - troca de senha exige senha atual
 * - e-mail unique (trata duplicidade)
 */
export async function atualizarPerfilUsuario(
  usuarioId,
  { nome, email, senhaAtual, senhaNova } = {}
) {
  const db = pegarDb();
  if (!ObjectId.isValid(String(usuarioId))) throw new Error("Usuário inválido.");

  const _id = new ObjectId(String(usuarioId));

  // busca usuário atual
  const usuario = await db.collection(COL_USUARIOS).findOne(
    { _id },
    { projection: { nome: 1, email: 1, senhaHash: 1, usuario: 1, perfil: 1, status: 1 } }
  );
  if (!usuario) throw new Error("Usuário não encontrado.");
  if (usuario.status === "bloqueado") throw new Error("Usuário bloqueado.");

  const $set = {};
  $set.nome = nomePessoa(nome);
$set.email = emailVal(email);
const nova = senhaVal(senhaNova);
  const now = new Date();

  // nome/email
  if (typeof nome !== "undefined") $set.nome = assertNome(nome);
  if (typeof email !== "undefined") $set.email = assertEmail(email);

  // senha
  const querTrocarSenha = typeof senhaNova !== "undefined" && String(senhaNova).length > 0;
  if (querTrocarSenha) {
    if (!senhaAtual) throw new Error("Informe a senha atual.");
    const ok = await compararSenha(String(senhaAtual), usuario.senhaHash);
    if (!ok) throw new Error("Senha atual incorreta.");

    const nova = assertSenhaNova(senhaNova);
    $set.senhaHash = await gerarHashSenha(nova);
  }

  if (Object.keys($set).length === 0) throw new Error("Nada para atualizar.");

  $set.updatedAt = now;

  try {
    await db.collection(COL_USUARIOS).updateOne({ _id }, { $set });
  } catch (err) {
    // e-mail único (se você tiver index unique em email)
    if (err?.code === 11000) throw new Error("E-mail já está em uso.");
    throw err;
  }

  // retorna dados seguros (sem senhaHash)
  const atualizado = await db.collection(COL_USUARIOS).findOne(
    { _id },
    { projection: { nome: 1, email: 1, usuario: 1, perfil: 1, status: 1 } }
  );

  return atualizado;
}