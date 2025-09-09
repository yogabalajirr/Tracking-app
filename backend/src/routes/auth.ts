import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { comparePassword, hashPassword } from "../utils";
import { signJwt } from "../auth";
import { authMiddleware } from "../auth";

const router = Router();

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post("/signup", async (req, res) => {
  const parse = credsSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ message: "Invalid body" });
  const { email, password } = parse.data;
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return res.status(400).json({ message: "Email already registered" });
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { email, passwordHash } });
  const token = signJwt({ id: user.id, email: user.email });
  return res.json({ token });
});

router.post("/login", async (req, res) => {
  const parse = credsSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ message: "Invalid body" });
  const { email, password } = parse.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) return res.status(401).json({ message: "Invalid credentials" });
  const token = signJwt({ id: user.id, email: user.email });
  return res.json({ token });
});

router.get("/me", authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ message: "Not found" });
  const { passwordHash, ...safe } = user;
  return res.json(safe);
});

export default router;


