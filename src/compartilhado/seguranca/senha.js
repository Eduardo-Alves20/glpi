import bcrypt from "bcrypt";

const ROUNDS = 12;

export async function gerarHashSenha(senha) {
  if (!senha) throw new Error("Senha inválida para hash.");
  return bcrypt.hash(senha, ROUNDS);
}

export async function compararSenha(senha, hash) {
  if (!senha || !hash) return false;
  return bcrypt.compare(senha, hash);
}
