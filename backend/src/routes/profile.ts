import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { authMiddleware } from "../auth";

const router = Router();

const profileSchema = z.object({
  name: z.string().optional(),
  age: z.number().int().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  weight: z.number().optional(),
  height: z.number().optional(),
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]).optional(),
  goal: z.enum(["lose", "maintain", "gain"]).optional(),
});

router.get("/", authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ message: "Not found" });
  const { passwordHash, ...safe } = user;
  return res.json(safe);
});

router.put("/", authMiddleware, async (req, res) => {
  const parse = profileSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ message: "Invalid body" });
  const data = parse.data as any;
  const user = await prisma.user.update({ where: { id: req.user!.id }, data });
  const { passwordHash, ...safe } = user;
  return res.json(safe);
});

export default router;


