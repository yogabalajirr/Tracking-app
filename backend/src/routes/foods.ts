import { Router } from "express";
import { prisma } from "../db";
import { authMiddleware } from "../auth";

const router = Router();

router.get("/", authMiddleware, async (req, res) => {
  const q = (req.query.q as string | undefined)?.toLowerCase() || "";
  const foods = await prisma.food.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : {},
    orderBy: { name: "asc" },
    take: 50,
  });
  res.json(foods);
});

router.get("/favorites", authMiddleware, async (req, res) => {
  const favs = await prisma.favorite.findMany({ where: { userId: req.user!.id }, include: { food: true } });
  res.json(favs.map((f) => f.food));
});

router.post("/favorites/:foodId", authMiddleware, async (req, res) => {
  const { foodId } = req.params;
  await prisma.favorite.upsert({
    where: { userId_foodId: { userId: req.user!.id, foodId } },
    update: {},
    create: { userId: req.user!.id, foodId },
  });
  res.json({ ok: true });
});

router.delete("/favorites/:foodId", authMiddleware, async (req, res) => {
  const { foodId } = req.params;
  await prisma.favorite.delete({ where: { userId_foodId: { userId: req.user!.id, foodId } } });
  res.json({ ok: true });
});

export default router;


