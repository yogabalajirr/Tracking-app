import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { authMiddleware } from "../auth";

const router = Router();

const exerciseSchema = z.object({
  date: z.string(),
  type: z.string().min(1),
  duration: z.number().int().min(1),
  calories: z.number().int().min(1),
});

router.get("/", authMiddleware, async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const from = new Date(date + "T00:00:00.000Z");
  const to = new Date(date + "T23:59:59.999Z");
  const list = await prisma.exercise.findMany({ where: { userId: req.user!.id, date: { gte: from, lte: to } }, orderBy: { createdAt: "desc" } });
  res.json(list);
});

router.post("/add", authMiddleware, async (req, res) => {
  const parse = exerciseSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ message: "Invalid body" });
  const { date, type, duration, calories } = parse.data;
  const entry = await prisma.exercise.create({ data: { userId: req.user!.id, date: new Date(date), type, duration, calories } });
  res.json(entry);
});

export default router;


