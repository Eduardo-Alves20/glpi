import { Router } from "express";
import { authGet, authPost, logoutPost } from "../controllers/auth/authController.js";
import { exigirLogin } from "../compartilhado/middlewares/seguranca.js";

export function criarAuthRotas() {
  const router = Router();

  // Login
  router.get("/auth", authGet);
  router.post("/auth", authPost);

  // Logout (melhor exigir login aqui)
  router.post("/logout", exigirLogin, logoutPost);

  return router;
}
