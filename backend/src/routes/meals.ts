import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { authMiddleware } from "../auth";

const router = Router();

const addItemSchema = z.object({
  date: z.string(), // ISO date
  type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  foodId: z.string().uuid(),
  quantity: z.number().int().min(1).default(1),
});

router.get("/", authMiddleware, async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const from = new Date(date + "T00:00:00.000Z");
  const to = new Date(date + "T23:59:59.999Z");
  const meals = await prisma.meal.findMany({
    where: { userId: req.user!.id, date: { gte: from, lte: to } },
    include: { items: { include: { food: true } } },
  });
  res.json(meals);
});

router.post("/add", authMiddleware, async (req, res) => {
  const parse = addItemSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ message: "Invalid body" });
  const { date, type, foodId, quantity } = parse.data;
  const start = new Date(date + "T12:00:00.000Z");
  const meal = await prisma.meal.upsert({
    where: { userId_date_type: { userId: req.user!.id, date: start, type } },
    update: {},
    create: { userId: req.user!.id, date: start, type },
  });
  const item = await prisma.mealItem.create({ data: { mealId: meal.id, foodId, quantity } });
  res.json(item);
});

export default router;


