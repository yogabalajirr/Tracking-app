import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { authMiddleware } from "../auth";

const router = Router();

const weightSchema = z.object({
  date: z.string(),
  weight: z.number(),
});

router.get("/", authMiddleware, async (req, res) => {
  const list = await prisma.weightEntry.findMany({ where: { userId: req.user!.id }, orderBy: { date: "asc" } });
  res.json(list);
});

router.post("/add", authMiddleware, async (req, res) => {
  const parse = weightSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ message: "Invalid body" });
  const { date, weight } = parse.data;
  const entry = await prisma.weightEntry.create({ data: { userId: req.user!.id, date: new Date(date), weight } });
  res.json(entry);
});

export default router;


